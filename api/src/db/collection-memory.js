import { getClient, query } from "./pg-client.js";

const MAX_KEY_LENGTH = 512;
const MAX_ITEM_KEY_LENGTH = 512;
const MAX_ITEMS_PER_REQUEST = 500;

export const parseCollectionKey = (collectionKey) => {
    if (typeof collectionKey !== "string") return null;
    const trimmed = collectionKey.trim();
    if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return null;

    const parts = trimmed.split(":");
    if (parts.length !== 3) return null;

    const [service, kind, collectionId] = parts.map((p) => p.trim());
    if (!service || !kind || !collectionId) return null;

    return { service, kind, collectionId, collectionKey: trimmed };
};

export const getDownloadedItemKeysForCollection = async ({
    userId,
    collectionKey,
}) => {
    const parsed = parseCollectionKey(collectionKey);
    if (!parsed) return { memory: null, itemKeys: [] };

    const memoryRes = await query(
        `
        SELECT
            id,
            collection_key,
            service,
            kind,
            collection_id,
            title,
            source_url,
            last_marked_at
        FROM user_collection_memories
        WHERE user_id = $1 AND collection_key = $2
        LIMIT 1
        `,
        [userId, parsed.collectionKey],
    );

    const memory = memoryRes.rows?.[0] ?? null;
    if (!memory) {
        return { memory: null, itemKeys: [] };
    }

    const itemsRes = await query(
        `
        SELECT item_key
        FROM user_collection_memory_items
        WHERE memory_id = $1
        ORDER BY downloaded_at DESC
        `,
        [memory.id],
    );

    const itemKeys = (itemsRes.rows || [])
        .map((row) => row?.item_key)
        .filter((key) => typeof key === "string" && key.length > 0);

    return { memory, itemKeys };
};

export const markDownloadedItemsForCollection = async ({
    userId,
    collectionKey,
    title,
    sourceUrl,
    items,
}) => {
    const parsed = parseCollectionKey(collectionKey);
    if (!parsed) {
        return { ok: false, code: "INVALID_COLLECTION_KEY" };
    }

    const now = Date.now();

    const normalizedItems = Array.isArray(items) ? items : [];
    const dedup = new Map();

    for (const item of normalizedItems) {
        const itemKey =
            typeof item?.itemKey === "string" ? item.itemKey.trim() : "";
        if (!itemKey || itemKey.length > MAX_ITEM_KEY_LENGTH) continue;

        const itemUrl = typeof item?.url === "string" ? item.url.trim() : "";
        const itemTitle = typeof item?.title === "string" ? item.title.trim() : "";

        dedup.set(itemKey, {
            itemKey,
            url: itemUrl || null,
            title: itemTitle || null,
        });

        if (dedup.size >= MAX_ITEMS_PER_REQUEST) {
            break;
        }
    }

    const rows = [...dedup.values()];
    if (!rows.length) {
        return { ok: true, added: 0, updated: 0 };
    }

    const client = await getClient();

    try {
        await client.query("BEGIN");

        const memoryRes = await client.query(
            `
            INSERT INTO user_collection_memories (
                user_id,
                collection_key,
                service,
                kind,
                collection_id,
                title,
                source_url,
                first_seen_at,
                last_opened_at,
                last_marked_at,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (user_id, collection_key)
            DO UPDATE SET
                service = EXCLUDED.service,
                kind = EXCLUDED.kind,
                collection_id = EXCLUDED.collection_id,
                title = COALESCE(EXCLUDED.title, user_collection_memories.title),
                source_url = COALESCE(EXCLUDED.source_url, user_collection_memories.source_url),
                last_opened_at = EXCLUDED.last_opened_at,
                last_marked_at = EXCLUDED.last_marked_at,
                updated_at = EXCLUDED.updated_at
            RETURNING id;
            `,
            [
                userId,
                parsed.collectionKey,
                parsed.service,
                parsed.kind,
                parsed.collectionId,
                typeof title === "string" && title.trim() ? title.trim() : null,
                typeof sourceUrl === "string" && sourceUrl.trim() ? sourceUrl.trim() : null,
                now,
                now,
                now,
                now,
                now,
            ],
        );

        const memoryId = memoryRes.rows?.[0]?.id;
        if (!memoryId) {
            await client.query("ROLLBACK");
            return { ok: false, code: "FAILED_TO_UPSERT_MEMORY" };
        }

        const values = [];
        const params = [];

        let paramIndex = 1;
        for (const row of rows) {
            values.push(
                `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
            );
            params.push(
                memoryId,
                row.itemKey,
                row.url,
                row.title,
                now,
                now,
                now,
            );
        }

        const insertRes = await client.query(
            `
            INSERT INTO user_collection_memory_items (
                memory_id,
                item_key,
                item_url,
                item_title,
                downloaded_at,
                created_at,
                updated_at
            ) VALUES ${values.join(", ")}
            ON CONFLICT (memory_id, item_key)
            DO UPDATE SET
                item_url = COALESCE(EXCLUDED.item_url, user_collection_memory_items.item_url),
                item_title = COALESCE(EXCLUDED.item_title, user_collection_memory_items.item_title),
                downloaded_at = EXCLUDED.downloaded_at,
                updated_at = EXCLUDED.updated_at
            RETURNING (xmax = 0) AS inserted;
            `,
            params,
        );

        const insertedFlags = insertRes.rows || [];
        let added = 0;
        let updated = 0;

        for (const row of insertedFlags) {
            if (row?.inserted === true) {
                added += 1;
            } else {
                updated += 1;
            }
        }

        await client.query("COMMIT");
        return { ok: true, added, updated };
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {}
        throw error;
    } finally {
        client.release();
    }
};

export const clearCollectionMemoryForUser = async ({ userId, collectionKey }) => {
    const parsed = parseCollectionKey(collectionKey);
    if (!parsed) return { ok: false, code: "INVALID_COLLECTION_KEY" };

    const res = await query(
        `DELETE FROM user_collection_memories WHERE user_id = $1 AND collection_key = $2`,
        [userId, parsed.collectionKey],
    );

    return { ok: true, deleted: res.rowCount || 0 };
};
