import { env } from "../config.js";
import { query } from "./pg-client.js";
import { DOWNLOAD_ATTEMPT_STATUS } from "./download-attempts.js";

const isPostgresEnabled = () => env.dbType === "postgresql";
let schemaPromise = null;

export const CURIOUS_CAT_ACTIONS = Object.freeze({
    modal: "modal",
    link: "link",
    blindBox: "blind_box",
});

const clampLimit = (value, fallback = 20, max = 100) => {
    const parsed = Number.parseInt(String(value), 10);
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.min(Math.max(safe, 1), max);
};

const normalizePage = (value) => {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const normalizeBlindBoxUrl = (value) => {
    let url = String(value || "").trim();
    while (
        url.length >= 2 &&
        ((url.startsWith('"') && url.endsWith('"')) ||
            (url.startsWith("'") && url.endsWith("'")))
    ) {
        url = url.slice(1, -1).trim();
    }
    return url;
};

const normalizeActivityPayload = (payload = {}) => {
    const actionType = String(payload.action_type || payload.actionType || "")
        .trim()
        .toLowerCase();

    return {
        name: String(payload.name || "").trim(),
        activity_type: String(payload.activity_type || payload.activityType || "custom")
            .trim()
            .toLowerCase(),
        title: String(payload.title || "").trim(),
        body: String(payload.body || "").trim(),
        button_text: String(payload.button_text || payload.buttonText || "").trim(),
        action_type: Object.values(CURIOUS_CAT_ACTIONS).includes(actionType)
            ? actionType
            : CURIOUS_CAT_ACTIONS.modal,
        target_url: String(payload.target_url || payload.targetUrl || "").trim() || null,
        image_url: String(payload.image_url || payload.imageUrl || "").trim() || null,
        copy_text: String(payload.copy_text || payload.copyText || "").trim() || null,
        reward_points:
            payload.reward_points === "" ||
            payload.rewardPoints === "" ||
            payload.reward_points == null && payload.rewardPoints == null
                ? null
                : Number.parseInt(String(payload.reward_points ?? payload.rewardPoints), 10),
        priority: Number.parseInt(String(payload.priority ?? 0), 10),
        is_active:
            payload.is_active === undefined && payload.isActive === undefined
                ? true
                : payload.is_active === true || payload.isActive === true,
        starts_at:
            payload.starts_at == null && payload.startsAt == null
                ? null
                : Number.parseInt(String(payload.starts_at ?? payload.startsAt), 10),
        ends_at:
            payload.ends_at == null && payload.endsAt == null
                ? null
                : Number.parseInt(String(payload.ends_at ?? payload.endsAt), 10),
    };
};

export const initCuriousCatDatabase = async () => {
    if (!isPostgresEnabled()) return;

    await query(`
        CREATE TABLE IF NOT EXISTS curious_cat_activities (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            activity_type TEXT NOT NULL DEFAULT 'custom',
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            button_text TEXT NOT NULL,
            action_type TEXT NOT NULL DEFAULT 'modal',
            target_url TEXT,
            image_url TEXT,
            copy_text TEXT,
            reward_points INTEGER,
            priority INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            starts_at BIGINT,
            ends_at BIGINT,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
    `);

    await query(`
        CREATE INDEX IF NOT EXISTS idx_curious_cat_activities_active_priority
        ON curious_cat_activities(is_active, priority DESC, updated_at DESC);
    `);
};

const ensureCuriousCatSchema = async () => {
    if (!isPostgresEnabled()) return;
    if (!schemaPromise) {
        schemaPromise = initCuriousCatDatabase().catch((error) => {
            schemaPromise = null;
            throw error;
        });
    }
    await schemaPromise;
};

export const listCuriousCatActivities = async ({ includeInactive = false } = {}) => {
    if (!isPostgresEnabled()) return [];
    await ensureCuriousCatSchema();

    const now = Date.now();
    const where = includeInactive
        ? ""
        : `WHERE is_active = true
           AND (starts_at IS NULL OR starts_at <= $1)
           AND (ends_at IS NULL OR ends_at >= $1)`;
    const params = includeInactive ? [] : [now];

    const result = await query(
        `
        SELECT *
        FROM curious_cat_activities
        ${where}
        ORDER BY priority DESC, updated_at DESC, id DESC;
        `,
        params,
    );

    return result.rows;
};

export const createCuriousCatActivity = async (payload = {}) => {
    if (!isPostgresEnabled()) return null;
    await ensureCuriousCatSchema();

    const data = normalizeActivityPayload(payload);
    const now = Date.now();

    const result = await query(
        `
        INSERT INTO curious_cat_activities (
            name,
            activity_type,
            title,
            body,
            button_text,
            action_type,
            target_url,
            image_url,
            copy_text,
            reward_points,
            priority,
            is_active,
            starts_at,
            ends_at,
            created_at,
            updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
        RETURNING *;
        `,
        [
            data.name,
            data.activity_type,
            data.title,
            data.body,
            data.button_text,
            data.action_type,
            data.target_url,
            data.image_url,
            data.copy_text,
            Number.isFinite(data.reward_points) ? data.reward_points : null,
            Number.isFinite(data.priority) ? data.priority : 0,
            data.is_active,
            Number.isFinite(data.starts_at) ? data.starts_at : null,
            Number.isFinite(data.ends_at) ? data.ends_at : null,
            now,
        ],
    );

    return result.rows[0] || null;
};

export const updateCuriousCatActivity = async (id, payload = {}) => {
    if (!isPostgresEnabled()) return null;
    await ensureCuriousCatSchema();

    const data = normalizeActivityPayload(payload);
    const now = Date.now();

    const result = await query(
        `
        UPDATE curious_cat_activities
        SET name = $2,
            activity_type = $3,
            title = $4,
            body = $5,
            button_text = $6,
            action_type = $7,
            target_url = $8,
            image_url = $9,
            copy_text = $10,
            reward_points = $11,
            priority = $12,
            is_active = $13,
            starts_at = $14,
            ends_at = $15,
            updated_at = $16
        WHERE id = $1
        RETURNING *;
        `,
        [
            id,
            data.name,
            data.activity_type,
            data.title,
            data.body,
            data.button_text,
            data.action_type,
            data.target_url,
            data.image_url,
            data.copy_text,
            Number.isFinite(data.reward_points) ? data.reward_points : null,
            Number.isFinite(data.priority) ? data.priority : 0,
            data.is_active,
            Number.isFinite(data.starts_at) ? data.starts_at : null,
            Number.isFinite(data.ends_at) ? data.ends_at : null,
            now,
        ],
    );

    return result.rows[0] || null;
};

export const deleteCuriousCatActivity = async (id) => {
    if (!isPostgresEnabled()) return null;
    await ensureCuriousCatSchema();

    const result = await query(
        `
        DELETE FROM curious_cat_activities
        WHERE id = $1
        RETURNING *;
        `,
        [id],
    );

    return result.rows[0] || null;
};

export const listBlindBoxLinks = async ({
    page = 1,
    limit = 20,
    lifetimeHours = 48,
} = {}) => {
    if (!isPostgresEnabled()) {
        return {
            links: [],
            pagination: {
                page: 1,
                limit: clampLimit(limit, 20, 50),
                total: 0,
                pages: 0,
            },
        };
    }

    const safeLimit = clampLimit(limit, 20, 50);
    const safePage = normalizePage(page);
    const offset = (safePage - 1) * safeLimit;
    const safeLifetimeHours =
        Number.isFinite(Number(lifetimeHours)) && Number(lifetimeHours) > 0
            ? Number(lifetimeHours)
            : 48;
    const now = Date.now();
    const lifetimeMs = safeLifetimeHours * 60 * 60 * 1000;
    const cutoff = now - lifetimeMs;

    const result = await query(
        `
        WITH latest_unique AS (
            SELECT DISTINCT ON (source_url)
                id,
                source_url,
                source_host,
                service,
                COALESCE(completed_at, submitted_at) AS completed_at
            FROM download_attempts
            WHERE status = $1
              AND source_url IS NOT NULL
              AND source_url <> ''
              AND COALESCE(completed_at, submitted_at) >= $2
            ORDER BY source_url, COALESCE(completed_at, submitted_at) DESC, id DESC
        ),
        counted AS (
            SELECT COUNT(*) OVER() AS total, *
            FROM latest_unique
        )
        SELECT *
        FROM counted
        ORDER BY completed_at ASC, id ASC
        LIMIT $3 OFFSET $4;
        `,
        [DOWNLOAD_ATTEMPT_STATUS.success, cutoff, safeLimit, offset],
    );

    const total = Number(result.rows[0]?.total || 0);
    const links = result.rows
        .map((row) => {
            const completedAt = Number(row.completed_at);
            const expiresAt = completedAt + lifetimeMs;
            return {
                id: row.id,
                url: normalizeBlindBoxUrl(row.source_url),
                host: row.source_host,
                service: row.service,
                expires_at: expiresAt,
                remaining_ms: Math.max(0, expiresAt - now),
            };
        })
        .filter((row) => row.remaining_ms > 0)
        .sort((a, b) => a.remaining_ms - b.remaining_ms);

    return {
        links,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: safeLimit ? Math.ceil(total / safeLimit) : 0,
        },
    };
};
