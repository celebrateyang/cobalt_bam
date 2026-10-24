import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { isDownloadProtected } from './download-protection.js';

// Exercise the actual download entry through early validation failures, without
// starting Express or contacting extractors, Clerk, or the production database.
const source = readFileSync(new URL('./api.js', import.meta.url), 'utf8');
const start = source.indexOf('    const handleDownload = async');
const end = source.indexOf("    app.post('/', handleDownload);", start);
const handlerSource = source.slice(start, end);
const fixture = ({ auth = true } = {}) => {
    const events = [];
    const user = { id: 17, points: 0, download_protection_eligible: true };
    const context = vm.createContext({
        URL, Date,
        console: { log() {}, warn() {}, error() {} },
        resolveDownloadLogEmail: () => 'test@example.com',
        randomUUID: () => 'request-1',
        isClerkAuthConfigured: true, isUpstreamServer: false,
        getClerkUserIdFromTokenHeader: async () => ({ ok: auth, reason: 'invalid', clerkUserId: 'clerk-17' }),
        hashHmac: () => 'rate-key',
        getUserByClerkId: async () => user,
        startDownloadProtection: async current => {
            events.push('activate');
            current.download_protection_started_at ??= Date.now();
            return current;
        },
        isDownloadProtected,
        normalizeRequest: async () => { events.push('validate'); return { success: false }; },
        fail: (res, code) => { events.push(code); return code; },
        createResponse: () => ({ status: 401 }),
        getUrlHost: () => 'example.com',
        scheduleDownloadAttemptCreate() {}, scheduleDownloadAttemptComplete() {},
        DOWNLOAD_ATTEMPT_STATUS: { failed: 'failed' }, getReadableDownloadError: () => 'failed',
    });
    vm.runInContext(handlerSource, context);
    const handle = vm.runInContext('handleDownload', context);
    return { events, user, handle: body => handle({ body, header() {} }, {}) };
};

test('invalid download submission activates before validation and retains its start on retry', async () => {
    const f = fixture();
    assert.equal(await f.handle({ url: 'unsupported' }), 'error.api.invalid_body');
    assert.deepEqual(f.events, ['activate', 'validate', 'error.api.invalid_body']);
    const startedAt = f.user.download_protection_started_at;
    await f.handle({ url: 'still unsupported' });
    assert.equal(f.user.download_protection_started_at, startedAt);
});

test('missing link is still a download action for an authenticated user', async () => {
    const f = fixture();
    assert.equal(await f.handle({}), 'error.api.link.missing');
    assert.deepEqual(f.events, ['activate', 'error.api.link.missing']);
});

test('unauthenticated submissions do not activate protection', async () => {
    const f = fixture({ auth: false });
    await f.handle({ url: 'unsupported' });
    assert.equal(f.user.download_protection_started_at, undefined);
    assert.ok(!f.events.includes('activate'));
});
