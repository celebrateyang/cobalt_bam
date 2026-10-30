import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DOWNLOAD_PROTECTION_DURATION_MS, isDownloadProtected,
    createDownloadProtectionStarter, calculateDownloadCharge,
} from './download-protection.js';

const newUser = { id: 1, points: 0, download_protection_eligible: true, download_protection_started_at: null };

test('protection includes the first action and excludes the exact expiry boundary', () => {
    assert.equal(DOWNLOAD_PROTECTION_DURATION_MS, 8 * 60 * 1000);
    const user = { ...newUser, download_protection_started_at: '1000' };
    assert.equal(isDownloadProtected(user, 999), false);
    assert.equal(isDownloadProtected(user, 1000), true);
    assert.equal(isDownloadProtected(user, 1000 + DOWNLOAD_PROTECTION_DURATION_MS - 1), true);
    assert.equal(isDownloadProtected(user, 1000 + DOWNLOAD_PROTECTION_DURATION_MS), false);
    assert.equal(isDownloadProtected(newUser, 1000), false);
    assert.equal(isDownloadProtected({ ...user, is_disabled: true }, 1000), false);
    assert.equal(isDownloadProtected({ ...user, download_protection_eligible: false }, 1000), false);
});

test('concurrent first actions keep one start time even when extraction subsequently fails', async () => {
    let stored = { ...newUser }, writes = 0;
    const start = createDownloadProtectionStarter(async (sql) => {
        if (sql.includes('UPDATE')) {
            if (stored.download_protection_started_at != null) return { rows: [] };
            writes++;
            stored = { ...stored, download_protection_started_at: 1000 };
        }
        return { rows: [{ ...stored }] };
    });
    const users = await Promise.all(Array.from({ length: 12 }, () => start({ ...newUser })));
    assert.equal(writes, 1);
    assert.ok(users.every(user => user.download_protection_started_at === 1000));
    await assert.rejects(async () => { throw new Error('extraction failed'); });
    assert.equal((await start(stored)).download_protection_started_at, 1000);
    assert.equal(writes, 1);
});

test('old, disabled, and already activated accounts do not write on download actions', async () => {
    const start = createDownloadProtectionStarter(() => assert.fail('unexpected DB write'));
    for (const user of [null, { ...newUser, is_disabled: true },
        { ...newUser, download_protection_eligible: false },
        { ...newUser, download_protection_started_at: 1000 }]) {
        assert.equal(await start(user), user);
    }
});

test('activation failures propagate rather than silently granting free downloads', async () => {
    const start = createDownloadProtectionStarter(async () => { throw new Error('DB unavailable'); });
    await assert.rejects(start(newUser), /DB unavailable/);
});

test('protection allows zero-balance downloads of any price; normal charging has no grace', () => {
    assert.deepEqual(calculateDownloadCharge({ requiredPoints: 10000, availablePoints: 0, protectedDownload: true }),
        { allowed: true, chargedPoints: 0, chargePolicy: 'new_user_protection' });
    assert.deepEqual(calculateDownloadCharge({ requiredPoints: 80, availablePoints: 20 }),
        { allowed: false, chargedPoints: 80, chargePolicy: 'standard' });
    assert.deepEqual(calculateDownloadCharge({ requiredPoints: 80, availablePoints: 80 }),
        { allowed: true, chargedPoints: 80, chargePolicy: 'standard' });
});
