export const DOWNLOAD_PROTECTION_DURATION_MS = 8 * 60 * 1000;

export const isDownloadProtected = (user, admittedAt = Date.now()) => {
    const startedAt = Number(user?.download_protection_started_at);
    return user?.download_protection_eligible === true && !user.is_disabled &&
        user.download_protection_started_at != null &&
        Number.isFinite(startedAt) && Number.isFinite(admittedAt) &&
        admittedAt >= startedAt && admittedAt < startedAt + DOWNLOAD_PROTECTION_DURATION_MS;
};

// The conditional write commits independently of extraction and charging.
// A stale snapshot after another tab activates is repaired with one read.
export const createDownloadProtectionStarter = (query) => async (user) => {
    if (!user || user.is_disabled || !user.download_protection_eligible ||
        user.download_protection_started_at != null) return user;
    const updated = await query(`
        UPDATE users
        SET download_protection_started_at = FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
        WHERE id = $1 AND download_protection_eligible = TRUE
          AND is_disabled IS NOT TRUE AND download_protection_started_at IS NULL
        RETURNING *;
    `, [user.id]);
    if (updated.rows[0]) return updated.rows[0];
    const current = await query('SELECT * FROM users WHERE id = $1;', [user.id]);
    return current.rows[0] ?? null;
};

export const calculateDownloadCharge = ({ requiredPoints, availablePoints, protectedDownload = false }) => {
    const required = Math.max(0, Number(requiredPoints) || 0);
    const available = Number(availablePoints);
    return {
        allowed: Number.isFinite(available) && (protectedDownload || available >= required),
        chargedPoints: protectedDownload ? 0 : required,
        chargePolicy: protectedDownload ? 'new_user_protection' : 'standard',
    };
};
