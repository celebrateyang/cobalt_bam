import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { initPromotionSubmissionsDatabase, submitXFollow, finishXFollowUpload, reviewPromotionSubmission } from './promotion-submissions.js';
import { cleanupOneXFollowProof } from './x-follow-cleanup.js';

test('X follow applications require review and award once per user and X account', async () => {
    const db = new PGlite();
    const query = (sql, args) => db.query(sql, args);
    const factory = async () => ({ query, release() {} });
    try {
        await db.exec("CREATE TABLE users(id int PRIMARY KEY, clerk_user_id text, points int, is_disabled boolean, updated_at bigint); INSERT INTO users VALUES(1,'a',20,false,0),(2,'b',30,false,0),(3,'c',0,true,0)");
        await initPromotionSubmissionsDatabase(query);
        let key = 0;
        const application = (userId, username) => ({ userId, clerkUserId: ['','a','b','c'][userId], username, contentType: 'image/png', objectKey: `proof/${++key}` });
        const first = await submitXFollow(application(1, 'example'), factory);
        assert.equal(first.ok, true);
        assert.equal(await finishXFollowUpload(first.id, '123', factory), true);
        assert.equal((await query('SELECT points FROM users WHERE id=1')).rows[0].points, 20);
        assert.equal((await submitXFollow(application(1, 'other'), factory)).code, 'ALREADY_SUBMITTED');
        const second = await submitXFollow(application(2, 'EXAMPLE'), factory);
        assert.equal(second.ok, true);
        assert.equal(await finishXFollowUpload(second.id, '456', factory), true);
        assert.equal((await submitXFollow(application(3, 'third'), factory)).code, 'ACCOUNT_DISABLED');
        const approved = await reviewPromotionSubmission({ submissionId: first.id, action: 'approve', awardedPoints: 999 }, factory);
        assert.equal(approved.userPointsAfter, 120);
        assert.equal((await reviewPromotionSubmission({ submissionId: first.id, action: 'approve' }, factory)).code, 'ALREADY_REVIEWED');
        assert.equal((await reviewPromotionSubmission({ submissionId: second.id, action: 'approve' }, factory)).code, 'ALREADY_REWARDED');
        assert.equal((await reviewPromotionSubmission({ submissionId: second.id, action: 'reject', adminNote: 'Try again' }, factory)).ok, true);
        assert.equal((await submitXFollow(application(2, 'different'), factory)).ok, true);
    } finally { await db.close(); }
});

test('cleanup retains pending proof and recent reviews, retries failed deletes, and preserves reward history', async () => {
    const db = new PGlite();
    const query = (sql, args) => db.query(sql, args);
    const factory = async () => ({ query, release() {} });
    const now = Date.now();
    try {
        await db.exec("CREATE TABLE users(id int PRIMARY KEY, clerk_user_id text, points int, is_disabled boolean, updated_at bigint); INSERT INTO users VALUES(1,'a',20,false,0),(2,'b',20,false,0)");
        await initPromotionSubmissionsDatabase(query);
        const first = await submitXFollow({ userId: 1, clerkUserId: 'a', username: 'first', contentType: 'image/png', objectKey: 'proof/first' }, factory);
        await finishXFollowUpload(first.id, '123', factory);
        const second = await submitXFollow({ userId: 2, clerkUserId: 'b', username: 'second', contentType: 'image/png', objectKey: 'proof/second' }, factory);
        await finishXFollowUpload(second.id, '456', factory);
        await reviewPromotionSubmission({ submissionId: first.id, action: 'approve' }, factory);
        const deleted = [];
        const storage = { deleteObject: async (...args) => deleted.push(args) };
        assert.equal(await cleanupOneXFollowProof({ storage, now: now + 29 * 86400000, clientFactory: factory }), false);
        await assert.rejects(cleanupOneXFollowProof({ storage: { deleteObject: async () => { throw new Error('unavailable'); } }, now: now + 31 * 86400000, clientFactory: factory }), /unavailable/);
        assert.equal(await cleanupOneXFollowProof({ storage, now: now + 31 * 86400000, clientFactory: factory }), true);
        assert.deepEqual(deleted, [['proof/first', '123']]);
        assert.equal(await cleanupOneXFollowProof({ storage, now: now + 90 * 86400000, clientFactory: factory }), false);
        assert.equal((await query('SELECT count(*)::int AS n FROM user_promotion_submissions')).rows[0].n, 2);
        assert.equal((await query('SELECT points FROM users WHERE id=1')).rows[0].points, 120);
    } finally { await db.close(); }
});
