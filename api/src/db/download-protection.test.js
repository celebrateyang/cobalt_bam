import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import * as protection from '../core/download-protection.js';

// Optional isolated PostgreSQL engine. Install PGlite outside the checkout and
// set DOWNLOAD_PROTECTION_TEST_PGLITE to its dist/index.js to run SQL integration.
const enginePath = process.env.DOWNLOAD_PROTECTION_TEST_PGLITE;
test('download protection PostgreSQL integration', { skip: !enginePath }, async t => {
    const { PGlite } = await import(pathToFileURL(enginePath).href);
    const db = new PGlite();
    t.after(() => db.close());
    const query = async (sql, params) => {
        const result = await db.query(sql, params);
        return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    };
    let pending = Promise.resolve();
    const getClient = async () => {
        const previous = pending;
        let release;
        pending = new Promise(resolve => { release = resolve; });
        await previous;
        return { query, release };
    };
    const source = await readFile(new URL('./users.js', import.meta.url), 'utf8');
    // Run the actual repository functions/SQL with only external I/O replaced.
    const executable = source.replace(/^import[\s\S]*?;\r?\n/gm, '')
        .replace(/^export \{[^\n]*\n/gm, '').replace(/^export /gm, '');
    let sequence = 0;
    const sandbox = {
        ...protection, query, getClient, initPool() {},
        env: { dbType: 'postgresql' }, console: { log() {} }, URL,
        nanoid: () => `test_${++sequence}`, generateClipboardPersonalCode: () => `code_${++sequence}`,
    };
    for (const name of ['initFeedbackDatabase', 'initReferralDatabase', 'initPromotionSubmissionsDatabase',
        'ensureMembershipOrdersSchema', 'ensureRandomChatSafetySchema', 'initDownloadAttemptsDatabase',
        'initPlatformRequestsDatabase', 'initCuriousCatDatabase']) sandbox[name] = async () => {};
    const context = vm.createContext(sandbox);
    vm.runInContext(executable, context);
    const api = vm.runInContext(`({ initUserDatabase, upsertUserFromClerk, consumeUserPoints,
        createPointsHold, finalizePointsHold, releasePointsHold, claimDownloadRequest,
        failDownloadRequest, completeDownloadRequest, startDownloadProtection })`, context);
    // A pre-migration account must remain ineligible, including later profile sync.
    await query(source.match(/CREATE TABLE IF NOT EXISTS users \([\s\S]*?\);/)[0]);
    await query(`INSERT INTO users (clerk_user_id, created_at, updated_at) VALUES ('legacy', 1, 1)`);
    await api.initUserDatabase();
    const rollout = Number((await query('SELECT started_at FROM download_protection_rollout')).rows[0].started_at);
    const signup = (id, createdAt = rollout + 1, email = `${id}@example.com`) => api.upsertUserFromClerk({
        clerkUserId: id, primaryEmail: email, clerkCreatedAt: createdAt,
    });

    await t.test('migration is repeatable and Clerk registration date governs eligibility', async () => {
        await api.initUserDatabase();
        assert.equal(Number((await query('SELECT started_at FROM download_protection_rollout')).rows[0].started_at), rollout);
        assert.equal((await signup('legacy')).download_protection_eligible, false);
        assert.equal((await signup('old-clerk', rollout - 1)).download_protection_eligible, false);
        assert.equal((await signup('unknown-clerk', null)).download_protection_eligible, false);
        assert.equal((await signup('new-clerk')).download_protection_eligible, true);
        const duplicate = await signup('duplicate', rollout + 1, 'new-clerk@example.com');
        assert.equal(duplicate.is_disabled, true);
        assert.equal(duplicate.download_protection_eligible, false);
    });

    await t.test('concurrent activation writes one durable start, regardless of extraction failure', async () => {
        const user = await signup('concurrent');
        const results = await Promise.all(Array.from({ length: 8 }, () => api.startDownloadProtection({ ...user })));
        assert.equal(new Set(results.map(row => row.download_protection_started_at)).size, 1);
        assert.ok(results[0].download_protection_started_at);
        const refreshed = await signup('concurrent');
        assert.equal(refreshed.download_protection_started_at, results[0].download_protection_started_at);
    });

    await t.test('zero balance protected debit succeeds; normal and non-download debit cannot use grace', async () => {
        const user = await signup('direct');
        await query('UPDATE users SET points = 0 WHERE id = $1', [user.id]);
        const free = await api.consumeUserPoints(user.id, 9000, { protectedDownload: true, markDownloadSuccess: true });
        assert.equal(free.points, 0);
        assert.equal(free.download_success_count, 1);
        assert.equal(free.chargeMeta.chargedPoints, 0);
        assert.equal(await api.consumeUserPoints(user.id, 1), null);
        await query('UPDATE users SET points = 20, first_download_grace_eligible = TRUE WHERE id = $1', [user.id]);
        assert.equal(await api.consumeUserPoints(user.id, 220), null);
        assert.equal((await api.consumeUserPoints(user.id, 10)).points, 10);
    });

    await t.test('zero holds stay free after protection expires; finalize and release are idempotent', async () => {
        const user = await signup('queue');
        await query('UPDATE users SET points = 0 WHERE id = $1', [user.id]);
        const hold = await api.createPointsHold({ userId: user.id, points: 10000, protectedDownload: true,
            queueId: 'free-queue', sourceUrl: 'https://example.com/video', expiresAt: Date.now() + 60000 });
        assert.equal(hold.ok, true);
        assert.equal(hold.pointsHeld, 0);
        assert.equal(hold.pointsRequired, 10000);
        await query('UPDATE users SET download_protection_started_at = 1 WHERE id = $1', [user.id]);
        const settled = await api.finalizePointsHold({ userId: user.id, holdId: hold.holdId });
        assert.equal(settled.ok, true);
        assert.equal(settled.charged, 0);
        assert.equal((await api.finalizePointsHold({ userId: user.id, holdId: hold.holdId })).status, 'finalized');
        assert.equal((await api.releasePointsHold({ userId: user.id, holdId: hold.holdId })).status, 'finalized');
        assert.equal((await api.createPointsHold({ userId: user.id, points: 1, expiresAt: Date.now() + 60000 })).code, 'INSUFFICIENT_POINTS');
        const cancelled = await api.createPointsHold({ userId: user.id, points: 10, protectedDownload: true, expiresAt: Date.now() + 60000 });
        await api.releasePointsHold({ userId: user.id, holdId: cancelled.holdId });
        assert.equal((await query('SELECT points FROM users WHERE id = $1', [user.id])).rows[0].points, 0);
    });

    await t.test('request retries retain original admission policy and protect hold ownership', async () => {
        const user = await signup('claims');
        const args = { userId: user.id, queueId: 'claim-queue', sourceUrl: 'https://example.com/video' };
        const claim = await api.claimDownloadRequest({ ...args, protectedDownload: true });
        assert.equal(claim.protectedDownload, true);
        await api.failDownloadRequest({ ...args, ownerToken: claim.ownerToken });
        const retry = await api.claimDownloadRequest({ ...args, protectedDownload: false });
        assert.equal(retry.protectedDownload, true);
        const denied = await api.createPointsHold({ ...args, points: 99, protectedDownload: true,
            expiresAt: Date.now() + 60000, idempotencyOwnerToken: claim.ownerToken });
        assert.equal(denied.code, 'IDEMPOTENCY_LOST');
        const hold = await api.createPointsHold({ ...args, points: 99, protectedDownload: retry.protectedDownload,
            expiresAt: Date.now() + 60000, idempotencyOwnerToken: retry.ownerToken,
            responseStatus: 200, responseBody: { status: 'local-processing' } });
        assert.equal(hold.pointsHeld, 0);
        const replay = await api.claimDownloadRequest(args);
        assert.equal(replay.status, 'replay');
        assert.equal(replay.responseBody.points.holdId, hold.holdId);
    });

    await t.test('pre-deployment discounted holds settle at their original amount', async () => {
        const user = await signup('historical');
        await query(`INSERT INTO user_points_holds
            (hold_id,user_id,points,required_points,grace_points,status,created_at,updated_at,expires_at)
            VALUES ('legacy-hold',$1,20,220,200,'held',1,1,$2)`, [user.id, Date.now() + 60000]);
        const result = await api.finalizePointsHold({ userId: user.id, holdId: 'legacy-hold' });
        assert.equal(result.charged, 20);
        assert.equal(result.pointsAfter, 0);
    });
});
