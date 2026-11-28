import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import * as protection from '../core/download-protection.js';
import { isBrowserQueuedDownload } from '../core/browser-queue.js';

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
    const api = vm.runInContext(`({ initUserDatabase, upsertUserFromClerk, getUserByClerkId, consumeUserPoints,
        createPointsHold, finalizePointsHold, releasePointsHold, claimDownloadRequest,
        failDownloadRequest, completeDownloadRequest, startDownloadProtection,
        prepareYoutubeClipMembership, settleYoutubeClipMembership, completeMemberDownloadUsage })`, context);
    // A pre-migration account must remain ineligible, including later profile sync.
    await query(source.match(/CREATE TABLE IF NOT EXISTS users \([\s\S]*?\);/)[0]);
    await query(`INSERT INTO users (clerk_user_id, created_at, updated_at) VALUES ('legacy', 1, 1)`);
    await api.initUserDatabase();
    const rollout = Number((await query('SELECT started_at FROM download_protection_rollout')).rows[0].started_at);
    const signup = (id, createdAt = rollout + 1, email = `${id}@example.com`) => api.upsertUserFromClerk({
        clerkUserId: id, primaryEmail: email, clerkCreatedAt: createdAt,
    });

    await t.test('clip handler reserves validated duration and settles or releases actual points', async () => {
        const user = await signup('clip-handler', rollout - 1);
        await query('UPDATE users SET points = 100 WHERE id = $1', [user.id]);
        const handlerFile = await readFile(new URL('../core/api.js', import.meta.url), 'utf8');
        const handlerSource = handlerFile.slice(handlerFile.indexOf('    const handleDownload = async'), handlerFile.indexOf("    app.post('/', handleDownload);"));
        let extractionFails = false;
        let member = false;
        const handlerContext = vm.createContext({
            ...api, ...protection, URL, Date, process: { env: {} },
            console: { log() {}, warn() {}, error(...args) { throw new Error(args.join(' ')); } },
            randomUUID: () => `request_${++sequence}`, resolveDownloadLogEmail: () => 'test@example.com',
            isClerkAuthConfigured: true, isUpstreamServer: false,
            getClerkUserIdFromTokenHeader: async () => ({ ok: true, clerkUserId: 'clip-handler' }),
            hashHmac: () => 'rate-key', normalizeRequest: async request => ({ success: true, data: request }),
            fail: (res, code) => res.status(400).json({ status: 'error', error: { code } }),
            createResponse: (_, { code, context }) => ({ status: 400, body: { status: 'error', error: { code, context } } }),
            getUrlHost: () => 'youtube.com', logDownloadRequest() {}, scheduleDownloadAttemptCreate() {},
            scheduleDownloadAttemptComplete() {}, DOWNLOAD_ATTEMPT_STATUS: {}, getReadableDownloadError: x => x,
            toNullableInteger: x => x, env: { downloadDedupeTTL: 0, pointsHoldTtlSeconds: 3600 },
            getIdempotencyErrorCode: () => 'error.api.request.conflict',
            reserveMemberDownloadUsage: async ({ userId, metadata }) => {
                if (!member) return { allowed: false, membership: null };
                const usageEvent = (await query(
                    `INSERT INTO member_usage_events (user_id,status,created_at,metadata) VALUES ($1,'reserved',$2,$3) RETURNING id`,
                    [userId, Date.now(), metadata],
                )).rows[0];
                return { allowed: true, usageEvent, membership: { planKey: 'test',
                    usage: { dailySuccessfulDownloads: 0, monthlySuccessfulDownloads: 0 },
                    limits: { dailySuccessfulDownloads: 10, monthlySuccessfulDownloads: 100 } } };
            },
            extract: () => ({ host: 'youtube', patternMatch: [] }), APIKeys: { getAllowedServices() {} },
            match: async ({ params }) => extractionFails
                ? { status: 400, body: { status: 'error', error: { code: 'error.api.youtube.clip.unsupported' } } }
                : { status: 200, body: { status: 'local-processing', service: 'youtube', type: 'merge',
                    duration: params.youtubeClip.end - params.youtubeClip.start } },
            isBrowserQueuedDownload,
        });
        vm.runInContext(handlerFile.slice(handlerFile.indexOf('const durationToPoints ='),
            handlerFile.indexOf('const getClerkUserIdFromTokenHeader =')), handlerContext);
        vm.runInContext(handlerSource, handlerContext);
        const handle = vm.runInContext('handleDownload', handlerContext);
        const request = async (queueId, start, end) => {
            const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
            await handle({ body: { url: 'https://youtube.com/watch?v=example', queueId,
                youtubeClip: { start, end } }, header() {} }, response);
            return response;
        };
        const first = await request('clip-success', 100, 190);
        assert.equal(first.body.points.outcome, 'held');
        assert.equal(first.body.points.required, 4);
        assert.equal((await query('SELECT points FROM users WHERE id = $1', [user.id])).rows[0].points, 100);
        assert.equal((await request('clip-success', 110, 190)).body.status, 'error');
        assert.equal((await api.finalizePointsHold({ userId: user.id, holdId: first.body.points.holdId })).charged, 4);
        const second = await request('clip-failed', 100, 110);
        assert.equal((await api.releasePointsHold({ userId: user.id, holdId: second.body.points.holdId })).status, 'released');
        extractionFails = true;
        assert.equal((await request('clip-extraction-error', 100, 110)).body.status, 'error');
        assert.equal((await query('SELECT points FROM users WHERE id = $1', [user.id])).rows[0].points, 96);
        extractionFails = false;
        member = true;
        const memberResult = await request('clip-member-success', 100, 190);
        assert.equal(memberResult.body.points.outcome, 'member');
        const eventId = memberResult.body.points.memberUsageId;
        let event = (await query('SELECT status, duration_seconds, points_equivalent FROM member_usage_events WHERE id = $1', [eventId])).rows[0];
        assert.equal(event.status, 'reserved');
        assert.equal(event.duration_seconds, 90);
        assert.equal(event.points_equivalent, 4);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: eventId, success: true })).status, 'success');
        const cancelled = await request('clip-member-failure', 100, 110);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: cancelled.body.points.memberUsageId, success: false })).status, 'failed');
        extractionFails = true;
        assert.equal((await request('clip-member-extraction-error', 100, 110)).body.status, 'error');
        event = (await query('SELECT status FROM member_usage_events WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [user.id])).rows[0];
        assert.equal(event.status, 'failed');
    });

    await t.test('clip member reservations settle only once and only for their owner', async () => {
        const user = await signup('clip-member');
        const other = await signup('clip-other');
        const create = async metadata => (await query(
            `INSERT INTO member_usage_events (user_id,status,created_at,metadata) VALUES ($1,'reserved',$2,$3) RETURNING id`,
            [user.id, Date.now(), metadata],
        )).rows[0].id;
        const id = await create({ stage: 'youtube_clip_reserved' });
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: id, success: true })).ok, false);
        assert.equal(await api.prepareYoutubeClipMembership({ userId: user.id, usageEventId: id, durationSeconds: 90, pointsEquivalent: 4 }), true);
        assert.equal((await api.settleYoutubeClipMembership({ userId: other.id, usageEventId: id, success: true })).ok, false);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: id, success: true })).ok, true);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: id, success: true })).ok, true);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: id, success: false })).ok, false);
        const ordinary = await create({ stage: 'request_reserved' });
        assert.equal(await api.prepareYoutubeClipMembership({ userId: user.id, usageEventId: ordinary, durationSeconds: 90, pointsEquivalent: 4 }), false);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: ordinary, success: true })).ok, false);
        const failed = await create({ stage: 'youtube_clip_reserved' });
        assert.equal(await api.prepareYoutubeClipMembership({ userId: user.id, usageEventId: failed, durationSeconds: 90, pointsEquivalent: 4 }), true);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: failed, success: false })).ok, true);
        assert.equal((await api.settleYoutubeClipMembership({ userId: user.id, usageEventId: failed, success: true })).ok, false);
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
