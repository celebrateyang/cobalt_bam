import { query, getClient, initPool } from "./pg-client.js";
import { env } from "../config.js";

const normalizeOrderDirection = (value, fallback = "DESC") => {
    if (typeof value !== "string") return fallback;
    const normalized = value.toUpperCase();
    return normalized === "ASC" || normalized === "DESC" ? normalized : fallback;
};

const normalizeSortField = (value, allowed, fallback) => {
    if (typeof value !== "string") return fallback;
    return allowed.includes(value) ? value : fallback;
};

// 初始化数据库
export const initDatabase = async () => {
    // 初始化连接池
    initPool();

    // 创建社交媒体账号表
    await query(`
        CREATE TABLE IF NOT EXISTS social_accounts (
            id SERIAL PRIMARY KEY,
            platform TEXT NOT NULL,
            username TEXT NOT NULL,
            display_name TEXT,
            avatar_url TEXT,
            profile_url TEXT,
            description TEXT,
            follower_count INTEGER DEFAULT 0,
            category TEXT DEFAULT 'other',
            tags TEXT,
            priority INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            UNIQUE(platform, username)
        );
    `);

    // 创建账号表索引
    // 迁移：白名单同步字段
    await query(
        `ALTER TABLE social_accounts
            ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT false;`,
    );
    await query(
        `ALTER TABLE social_accounts
            ADD COLUMN IF NOT EXISTS sync_last_run_at BIGINT;`,
    );
    await query(
        `ALTER TABLE social_accounts
            ADD COLUMN IF NOT EXISTS sync_error TEXT;`,
    );

    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_platform ON social_accounts(platform);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_category ON social_accounts(category);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_priority ON social_accounts(priority DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_active ON social_accounts(is_active);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_sync_enabled ON social_accounts(sync_enabled);`);

    // 创建社交媒体视频表
    await query(`
        CREATE TABLE IF NOT EXISTS social_videos (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            video_id TEXT,
            title TEXT,
            description TEXT,
            video_url TEXT NOT NULL,
            thumbnail_url TEXT,
            duration INTEGER,
            view_count INTEGER DEFAULT 0,
            like_count INTEGER DEFAULT 0,
            publish_date BIGINT,
            tags TEXT,
            is_featured BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            display_order INTEGER DEFAULT 0,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
        );
    `);

    // 创建视频表索引
    // 迁移：视频同步 + 置顶字段
    await query(
        `ALTER TABLE social_videos
            ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';`,
    );
    await query(
        `ALTER TABLE social_videos
            ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;`,
    );
    await query(
        `ALTER TABLE social_videos
            ADD COLUMN IF NOT EXISTS pinned_order INTEGER DEFAULT 0;`,
    );
    await query(
        `ALTER TABLE social_videos
            ADD COLUMN IF NOT EXISTS synced_at BIGINT;`,
    );

    await query(`CREATE INDEX IF NOT EXISTS idx_videos_account ON social_videos(account_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_platform ON social_videos(platform);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_featured ON social_videos(is_featured);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_active ON social_videos(is_active);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_display_order ON social_videos(display_order DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_created_at ON social_videos(created_at DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_pinned ON social_videos(is_pinned, pinned_order DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_source ON social_videos(source);`);

    // ==================== 资源分类/链接 ====================
    await query(`
        CREATE TABLE IF NOT EXISTS resource_categories (
            id SERIAL PRIMARY KEY,
            parent_id INTEGER,
            slug TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES resource_categories(id) ON DELETE CASCADE
        );
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS resource_category_i18n (
            category_id INTEGER NOT NULL,
            locale TEXT NOT NULL,
            name TEXT NOT NULL,
            PRIMARY KEY (category_id, locale),
            FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE CASCADE
        );
    `);
    await query(`
        CREATE TABLE IF NOT EXISTS resource_links (
            id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            description TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE CASCADE
        );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_resource_categories_parent ON resource_categories(parent_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_resource_categories_active ON resource_categories(is_active);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_resource_categories_sort ON resource_categories(sort_order DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_resource_links_category ON resource_links(category_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_resource_links_active ON resource_links(is_active);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_resource_links_sort ON resource_links(sort_order DESC);`);

    // ==================== 站内行为统计（热榜） ====================
    await query(`
        CREATE TABLE IF NOT EXISTS social_video_events_daily (
            video_id INTEGER NOT NULL,
            event_date DATE NOT NULL,
            event_type TEXT NOT NULL,
            event_count INTEGER NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (video_id, event_date, event_type),
            FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
        );
    `);
    await query(
        `CREATE INDEX IF NOT EXISTS idx_video_events_type_date ON social_video_events_daily(event_type, event_date DESC);`,
    );

    // 创建管理员用户表
    await query(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email TEXT,
            is_active BOOLEAN DEFAULT true,
            last_login_at BIGINT,
            created_at BIGINT NOT NULL
        );
    `);

    console.log('✅ Social media database initialized');
};

// ==================== 账号管理函数 ====================

/**
 * 创建账号
 */
export const createAccount = async (accountData) => {
    const now = Date.now();
    const tags = JSON.stringify(accountData.tags || []);
    const syncEnabled = accountData?.sync_enabled === false ? false : true;

    const result = await query(`
        INSERT INTO social_accounts (
            platform, username, display_name, avatar_url, profile_url,
            description, follower_count, category, tags, priority,
            is_active, sync_enabled, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
    `, [
        accountData.platform,
        accountData.username,
        accountData.display_name || '',
        accountData.avatar_url || '',
        accountData.profile_url || '',
        accountData.description || '',
        accountData.follower_count || 0,
        accountData.category || 'other',
        tags,
        accountData.priority || 0,
        accountData.is_active !== false,
        syncEnabled,
        now,
        now
    ]);

    const account = await getAccountById(result.rows[0].id);
    return account;
};

/**
 * 获取账号列表
 */
export const getAccounts = async (filters = {}) => {
    let sql = `
        SELECT a.*, 
               COUNT(v.id) as video_count
        FROM social_accounts a
        LEFT JOIN social_videos v ON a.id = v.account_id AND v.is_active = true
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.platform) {
        sql += ` AND a.platform = $${paramIndex}`;
        params.push(filters.platform);
        paramIndex++;
    }

    if (filters.category) {
        sql += ` AND a.category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
    }

    if (filters.is_active !== undefined) {
        sql += ` AND a.is_active = $${paramIndex}`;
        params.push(filters.is_active);
        paramIndex++;
    }

    if (filters.search) {
        sql += ` AND (a.username ILIKE $${paramIndex} OR a.display_name ILIKE $${paramIndex + 1})`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
        paramIndex += 2;
    }

    sql += ' GROUP BY a.id';

    // 排序
    // 排序（白名单，避免 SQL 注入）
    const sortField = normalizeSortField(
        filters.sort,
        ["priority", "created_at", "updated_at", "follower_count", "username", "platform", "category"],
        "priority",
    );
    const sortOrder = normalizeOrderDirection(filters.order, "DESC");
    sql += ` ORDER BY a.${sortField} ${sortOrder}, a.created_at DESC`;

    // 分页
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const offset = (page - 1) * limit;

    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    const accounts = result.rows;

    // 解析 tags JSON
    accounts.forEach(account => {
        account.tags = JSON.parse(account.tags || '[]');
        account.video_count = parseInt(account.video_count);
    });

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM social_accounts WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (filters.platform) {
        countSql += ` AND platform = $${countParamIndex}`;
        countParams.push(filters.platform);
        countParamIndex++;
    }
    if (filters.category) {
        countSql += ` AND category = $${countParamIndex}`;
        countParams.push(filters.category);
        countParamIndex++;
    }
    if (filters.is_active !== undefined) {
        countSql += ` AND is_active = $${countParamIndex}`;
        countParams.push(filters.is_active);
        countParamIndex++;
    }
    if (filters.search) {
        countSql += ` AND (username ILIKE $${countParamIndex} OR display_name ILIKE $${countParamIndex + 1})`;
        const searchTerm = `%${filters.search}%`;
        countParams.push(searchTerm, searchTerm);
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
        accounts,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * 根据 ID 获取账号
 */
export const getAccountById = async (id) => {
    const result = await query(`
        SELECT a.*,
               COUNT(v.id) as video_count
        FROM social_accounts a
        LEFT JOIN social_videos v ON a.id = v.account_id AND v.is_active = true
        WHERE a.id = $1
        GROUP BY a.id
    `, [id]);

    const account = result.rows[0];
    if (account) {
        account.tags = JSON.parse(account.tags || '[]');
        account.video_count = parseInt(account.video_count);
    }
    return account;
};

/**
 * 更新账号
 */
export const updateAccount = async (id, updates) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
        'platform', 'username', 'display_name', 'avatar_url', 'profile_url',
        'description', 'follower_count', 'category', 'priority', 'is_active',
        'sync_enabled', 'sync_last_run_at', 'sync_error',
    ];

    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            fields.push(`${field} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex++;
        }
    });

    if (updates.tags !== undefined) {
        fields.push(`tags = $${paramIndex}`);
        values.push(JSON.stringify(updates.tags));
        paramIndex++;
    }

    fields.push(`updated_at = $${paramIndex}`);
    values.push(Date.now());
    paramIndex++;

    values.push(id);

    await query(`
        UPDATE social_accounts
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
    `, values);

    return await getAccountById(id);
};

/**
 * 删除账号
 */
export const deleteAccount = async (id) => {
    const result = await query('DELETE FROM social_accounts WHERE id = $1', [id]);
    return result.rowCount > 0;
};

// ==================== 视频管理函数 ====================

/**
 * 创建视频
 */
export const createVideo = async (videoData) => {
    const now = Date.now();
    const tags = JSON.stringify(videoData.tags || []);

    const result = await query(`
        INSERT INTO social_videos (
            account_id, platform, video_id, title, description,
            video_url, thumbnail_url, duration, view_count, like_count,
            publish_date, tags, is_featured, is_active, display_order,
            source, is_pinned, pinned_order, synced_at,
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING id
    `, [
        videoData.account_id,
        videoData.platform,
        videoData.video_id || '',
        videoData.title || '',
        videoData.description || '',
        videoData.video_url,
        videoData.thumbnail_url || '',
        videoData.duration || null,
        videoData.view_count || 0,
        videoData.like_count || 0,
        videoData.publish_date || null,
        tags,
        videoData.is_featured ? true : false,
        videoData.is_active !== false,
        videoData.display_order || 0,
        videoData.source || 'manual',
        videoData.is_pinned ? true : false,
        videoData.pinned_order || 0,
        videoData.synced_at || null,
        now,
        now
    ]);

    return await getVideoById(result.rows[0].id);
};

export const upsertVideoFromSync = async (videoData) => {
    const now = Date.now();

    const platform = videoData?.platform;
    const videoId = videoData?.video_id;
    const videoUrl = videoData?.video_url;

    if (!platform || !videoUrl) {
        throw new Error("upsertVideoFromSync requires platform and video_url");
    }

    let existingId = null;

    if (videoId) {
        const existing = await query(
            `SELECT id FROM social_videos WHERE platform = $1 AND video_id = $2 LIMIT 1`,
            [platform, videoId],
        );
        existingId = existing.rows?.[0]?.id ?? null;
    }

    if (!existingId) {
        const existing = await query(
            `SELECT id FROM social_videos WHERE video_url = $1 LIMIT 1`,
            [videoUrl],
        );
        existingId = existing.rows?.[0]?.id ?? null;
    }

    if (!existingId) {
        const created = await createVideo({
            ...videoData,
            source: videoData.source || "sync",
            synced_at: videoData.synced_at || now,
        });
        return { video: created, action: "created" };
    }

    const tags = JSON.stringify(videoData.tags || []);

    await query(
        `
        UPDATE social_videos
        SET video_id = COALESCE(NULLIF($1, ''), video_id),
            title = $2,
            description = $3,
            video_url = $4,
            thumbnail_url = $5,
            duration = $6,
            publish_date = COALESCE($7, publish_date),
            tags = $8,
            source = $9,
            is_pinned = $10,
            pinned_order = $11,
            synced_at = $12,
            updated_at = $13
        WHERE id = $14
        `,
        [
            videoData.video_id || "",
            videoData.title || "",
            videoData.description || "",
            videoUrl,
            videoData.thumbnail_url || "",
            videoData.duration ?? null,
            videoData.publish_date ?? null,
            tags,
            videoData.source || "sync",
            videoData.is_pinned ? true : false,
            videoData.pinned_order || 0,
            videoData.synced_at || now,
            now,
            existingId,
        ],
    );

    const updated = await getVideoById(existingId);
    return { video: updated, action: "updated" };
};

/**
 * 获取视频列表
 */
export const getVideos = async (filters = {}) => {
    let sql = `
        SELECT v.*,
               a.username as account_username,
               a.display_name as account_display_name,
               a.avatar_url as account_avatar_url,
               a.platform as account_platform
        FROM social_videos v
        INNER JOIN social_accounts a ON v.account_id = a.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.account_id) {
        sql += ` AND v.account_id = $${paramIndex}`;
        params.push(filters.account_id);
        paramIndex++;
    }

    if (filters.platform) {
        sql += ` AND v.platform = $${paramIndex}`;
        params.push(filters.platform);
        paramIndex++;
    }

    if (filters.is_featured !== undefined) {
        sql += ` AND v.is_featured = $${paramIndex}`;
        params.push(filters.is_featured);
        paramIndex++;
    }

    if (filters.is_pinned !== undefined) {
        sql += ` AND v.is_pinned = $${paramIndex}`;
        params.push(filters.is_pinned);
        paramIndex++;
    }

    if (filters.is_active !== undefined) {
        sql += ` AND v.is_active = $${paramIndex}`;
        params.push(filters.is_active);
        paramIndex++;
    }

    if (filters.search) {
        sql += ` AND (v.title ILIKE $${paramIndex} OR v.description ILIKE $${paramIndex + 1} OR a.username ILIKE $${paramIndex + 2})`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
        paramIndex += 3;
    }

    // 排序
    // 排序（白名单，避免 SQL 注入）
    const sortField = normalizeSortField(
        filters.sort,
        [
            "display_order",
            "pinned_order",
            "created_at",
            "updated_at",
            "publish_date",
            "view_count",
            "like_count",
        ],
        "display_order",
    );
    const sortOrder = normalizeOrderDirection(filters.order, "DESC");

    if (sortField === 'display_order') {
        sql += ` ORDER BY v.display_order DESC, v.created_at DESC`;
    } else {
        sql += ` ORDER BY v.${sortField} ${sortOrder}`;
    }

    // 分页
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const offset = (page - 1) * limit;

    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    const videos = result.rows;

    // 解析 JSON 和组装账号信息
    videos.forEach(video => {
        video.tags = JSON.parse(video.tags || '[]');
        video.account = {
            username: video.account_username,
            display_name: video.account_display_name,
            avatar_url: video.account_avatar_url,
            platform: video.account_platform
        };
        delete video.account_username;
        delete video.account_display_name;
        delete video.account_avatar_url;
        delete video.account_platform;
    });

    // 获取总数
    let countSql = `
        SELECT COUNT(*) as total 
        FROM social_videos v
        INNER JOIN social_accounts a ON v.account_id = a.id
        WHERE 1=1
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (filters.account_id) {
        countSql += ` AND v.account_id = $${countParamIndex}`;
        countParams.push(filters.account_id);
        countParamIndex++;
    }
    if (filters.platform) {
        countSql += ` AND v.platform = $${countParamIndex}`;
        countParams.push(filters.platform);
        countParamIndex++;
    }
    if (filters.is_featured !== undefined) {
        countSql += ` AND v.is_featured = $${countParamIndex}`;
        countParams.push(filters.is_featured);
        countParamIndex++;
    }
    if (filters.is_pinned !== undefined) {
        countSql += ` AND v.is_pinned = $${countParamIndex}`;
        countParams.push(filters.is_pinned);
        countParamIndex++;
    }
    if (filters.is_active !== undefined) {
        countSql += ` AND v.is_active = $${countParamIndex}`;
        countParams.push(filters.is_active);
        countParamIndex++;
    }
    if (filters.search) {
        countSql += ` AND (v.title ILIKE $${countParamIndex} OR v.description ILIKE $${countParamIndex + 1} OR a.username ILIKE $${countParamIndex + 2})`;
        const searchTerm = `%${filters.search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm);
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
        videos,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

/**
 * 根据 ID 获取视频
 */
export const getVideoById = async (id) => {
    const result = await query(`
        SELECT v.*,
               a.username as account_username,
               a.display_name as account_display_name,
               a.avatar_url as account_avatar_url
        FROM social_videos v
        INNER JOIN social_accounts a ON v.account_id = a.id
        WHERE v.id = $1
    `, [id]);

    const video = result.rows[0];
    if (video) {
        video.tags = JSON.parse(video.tags || '[]');
        video.account = {
            username: video.account_username,
            display_name: video.account_display_name,
            avatar_url: video.account_avatar_url
        };
        delete video.account_username;
        delete video.account_display_name;
        delete video.account_avatar_url;
    }
    return video;
};

/**
 * 更新视频
 */
export const updateVideo = async (id, updates) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
        'video_id', 'title', 'description', 'video_url', 'thumbnail_url',
        'duration', 'view_count', 'like_count', 'publish_date',
        'is_featured', 'is_active', 'display_order',
        'source', 'is_pinned', 'pinned_order', 'synced_at',
    ];

    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            fields.push(`${field} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex++;
        }
    });

    if (updates.tags !== undefined) {
        fields.push(`tags = $${paramIndex}`);
        values.push(JSON.stringify(updates.tags));
        paramIndex++;
    }

    fields.push(`updated_at = $${paramIndex}`);
    values.push(Date.now());
    paramIndex++;

    values.push(id);

    await query(`
        UPDATE social_videos
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
    `, values);

    return await getVideoById(id);
};

/**
 * 删除视频
 */
export const deleteVideo = async (id) => {
    const result = await query('DELETE FROM social_videos WHERE id = $1', [id]);
    return result.rowCount > 0;
};

/**
 * 批量删除视频
 * @param {number[]} ids
 * @returns {number} deleted count
 */
export const deleteVideos = async (ids = []) => {
    if (!Array.isArray(ids)) return 0;

    const normalized = Array.from(
        new Set(
            ids
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value > 0),
        ),
    );

    if (!normalized.length) return 0;

    const result = await query(
        'DELETE FROM social_videos WHERE id = ANY($1::int[])',
        [normalized],
    );
    return result.rowCount;
};

/**
 * 获取精选视频
 */
export const getFeaturedVideos = async (limit = 20) => {
    return await getVideos({
        is_featured: true,
        is_active: true,
        limit,
        sort: 'display_order',
        order: 'DESC'
    });
};

/**
 * 切换精选状态
 */
export const toggleFeatured = async (id) => {
    const video = await getVideoById(id);
    if (!video) return null;

    console.log(
        `[toggle-featured] db before id=${id} is_featured=${video.is_featured}`,
    );
    await query(`
        UPDATE social_videos
        SET is_featured = $1, updated_at = $2
        WHERE id = $3
    `, [!video.is_featured, Date.now(), id]);

    const updated = await getVideoById(id);
    console.log(
        `[toggle-featured] db after id=${id} is_featured=${updated?.is_featured ?? "unknown"}`,
    );
    return updated;
};

// ==================== 统计函数 ====================

/**
 * 获取统计信息
 */
export const getStats = async () => {
    const totalAccountsResult = await query('SELECT COUNT(*) as count FROM social_accounts WHERE is_active = true');
    const totalAccounts = parseInt(totalAccountsResult.rows[0].count);

    const totalVideosResult = await query('SELECT COUNT(*) as count FROM social_videos WHERE is_active = true');
    const totalVideos = parseInt(totalVideosResult.rows[0].count);

    const byPlatform = {};
    const platformsResult = await query(`
        SELECT platform, COUNT(*) as count 
        FROM social_accounts 
        WHERE is_active = true 
        GROUP BY platform
    `);
    platformsResult.rows.forEach(p => {
        byPlatform[p.platform] = parseInt(p.count);
    });

    const byCategory = {};
    const categoriesResult = await query(`
        SELECT category, COUNT(*) as count 
        FROM social_accounts 
        WHERE is_active = true 
        GROUP BY category
    `);
    categoriesResult.rows.forEach(c => {
        byCategory[c.category] = parseInt(c.count);
    });

    return {
        total_accounts: totalAccounts,
        total_videos: totalVideos,
        by_platform: byPlatform,
        by_category: byCategory
    };
};

// ==================== 管理员用户函数 ====================

/**
 * 创建管理员用户
 */

// ==================== Resource categories/links ====================

const mapCategoryNames = async (categories = []) => {
    const ids = categories.map((c) => c.id);
    if (!ids.length) {
        return categories.map((c) => ({ ...c, names: {} }));
    }

    const namesResult = await query(
        `SELECT category_id, locale, name FROM resource_category_i18n WHERE category_id = ANY($1::int[])`,
        [ids],
    );

    const namesById = {};
    namesResult.rows.forEach((row) => {
        if (!namesById[row.category_id]) {
            namesById[row.category_id] = {};
        }
        namesById[row.category_id][row.locale] = row.name;
    });

    return categories.map((c) => ({
        ...c,
        names: namesById[c.id] || {},
    }));
};

export const getResourceCategories = async ({ includeInactive = false } = {}) => {
    let sql = `SELECT * FROM resource_categories WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (!includeInactive) {
        sql += ` AND is_active = $${paramIndex}`;
        params.push(true);
        paramIndex++;
    }

    sql += ` ORDER BY sort_order DESC, id ASC`;

    const result = await query(sql, params);
    return await mapCategoryNames(result.rows);
};

export const getResourceCategoryById = async (id) => {
    const result = await query(`SELECT * FROM resource_categories WHERE id = $1`, [id]);
    if (!result.rows.length) return null;
    const [withNames] = await mapCategoryNames(result.rows);
    return withNames || null;
};

export const createResourceCategory = async (categoryData) => {
    const now = Date.now();
    const parentId =
        categoryData.parent_id === null || categoryData.parent_id === undefined
            ? null
            : Number(categoryData.parent_id);

    const result = await query(
        `
        INSERT INTO resource_categories (
            parent_id, slug, sort_order, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
            parentId,
            categoryData.slug || '',
            categoryData.sort_order || 0,
            categoryData.is_active !== false,
            now,
            now,
        ],
    );

    const created = result.rows[0];

    const names = categoryData.names || {};
    for (const [locale, name] of Object.entries(names)) {
        if (typeof name !== "string") continue;
        const trimmed = name.trim();
        if (!trimmed) continue;
        await query(
            `
            INSERT INTO resource_category_i18n (category_id, locale, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (category_id, locale)
            DO UPDATE SET name = EXCLUDED.name
            `,
            [created.id, locale, trimmed],
        );
    }

    return await getResourceCategoryById(created.id);
};

export const updateResourceCategory = async (id, updates = {}) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ["parent_id", "slug", "sort_order", "is_active"];
    allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
            fields.push(`${field} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex++;
        }
    });

    fields.push(`updated_at = $${paramIndex}`);
    values.push(Date.now());
    paramIndex++;

    values.push(id);

    await query(
        `
        UPDATE resource_categories
        SET ${fields.join(", ")}
        WHERE id = $${paramIndex}
        `,
        values,
    );

    const names = updates.names || {};
    for (const [locale, name] of Object.entries(names)) {
        if (typeof name !== "string") continue;
        const trimmed = name.trim();
        if (!trimmed) {
            await query(
                `DELETE FROM resource_category_i18n WHERE category_id = $1 AND locale = $2`,
                [id, locale],
            );
            continue;
        }
        await query(
            `
            INSERT INTO resource_category_i18n (category_id, locale, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (category_id, locale)
            DO UPDATE SET name = EXCLUDED.name
            `,
            [id, locale, trimmed],
        );
    }

    return await getResourceCategoryById(id);
};

export const deleteResourceCategory = async (id) => {
    const result = await query(`DELETE FROM resource_categories WHERE id = $1`, [id]);
    return result.rowCount > 0;
};

export const getResourceLinks = async ({ category_id, includeInactive = false } = {}) => {
    let sql = `SELECT * FROM resource_links WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (category_id !== undefined) {
        sql += ` AND category_id = $${paramIndex}`;
        params.push(Number(category_id));
        paramIndex++;
    }

    if (!includeInactive) {
        sql += ` AND is_active = $${paramIndex}`;
        params.push(true);
        paramIndex++;
    }

    sql += ` ORDER BY sort_order DESC, id ASC`;

    const result = await query(sql, params);
    return result.rows;
};

export const getResourceLinkById = async (id) => {
    const result = await query(`SELECT * FROM resource_links WHERE id = $1`, [id]);
    return result.rows[0] || null;
};

export const createResourceLink = async (linkData) => {
    const now = Date.now();

    const result = await query(
        `
        INSERT INTO resource_links (
            category_id, title, url, description, sort_order, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
            linkData.category_id,
            linkData.title || '',
            linkData.url || '',
            linkData.description || '',
            linkData.sort_order || 0,
            linkData.is_active !== false,
            now,
            now,
        ],
    );

    return result.rows[0];
};

export const updateResourceLink = async (id, updates = {}) => {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
        "category_id",
        "title",
        "url",
        "description",
        "sort_order",
        "is_active",
    ];

    allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
            fields.push(`${field} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex++;
        }
    });

    fields.push(`updated_at = $${paramIndex}`);
    values.push(Date.now());
    paramIndex++;

    values.push(id);

    await query(
        `
        UPDATE resource_links
        SET ${fields.join(", ")}
        WHERE id = $${paramIndex}
        `,
        values,
    );

    return await getResourceLinkById(id);
};

export const deleteResourceLink = async (id) => {
    const result = await query(`DELETE FROM resource_links WHERE id = $1`, [id]);
    return result.rowCount > 0;
};

export const createAdminUser = async (username, passwordHash, email = '') => {
    const result = await query(`
        INSERT INTO admin_users (username, password_hash, email, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id
    `, [username, passwordHash, email, Date.now()]);

    return result.rows[0].id;
};

/**
 * 根据用户名获取管理员
 */
export const getAdminByUsername = async (username) => {
    const result = await query('SELECT * FROM admin_users WHERE username = $1', [username]);
    return result.rows[0];
};

/**
 * 更新最后登录时间
 */
export const updateLastLogin = async (userId) => {
    await query('UPDATE admin_users SET last_login_at = $1 WHERE id = $2', [Date.now(), userId]);
};

// ==================== Discover 热榜（站内行为） ====================

/**
 * 记录站内行为事件（按天聚合）。
 * 返回最新 event_count；若 video 不存在/不可用则返回 null。
 */
export const recordVideoEvent = async (videoId, eventType, occurredAt = Date.now()) => {
    const eventDate = new Date(occurredAt).toISOString().slice(0, 10);
    const now = Date.now();

    const result = await query(
        `
            INSERT INTO social_video_events_daily (video_id, event_date, event_type, event_count, updated_at)
            SELECT v.id, $2, $3, 1, $4
            FROM social_videos v
            WHERE v.id = $1 AND v.is_active = true
            ON CONFLICT (video_id, event_date, event_type)
            DO UPDATE SET
                event_count = social_video_events_daily.event_count + 1,
                updated_at = EXCLUDED.updated_at
            RETURNING event_count
        `,
        [videoId, eventDate, eventType, now],
    );

    if (!result.rows.length) return null;
    return parseInt(result.rows[0].event_count);
};

/**
 * 获取热榜视频：按 days 内 event_type 的 event_count 求和降序。
 */
export const getTrendingVideos = async ({
    platform,
    days = 7,
    limit = 20,
    event_type = "download_click",
} = {}) => {
    const safeDays = Math.min(30, Math.max(1, parseInt(days) || 7));
    const safeLimit = Math.min(60, Math.max(1, parseInt(limit) || 20));

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - (safeDays - 1));
    const startDateString = startDate.toISOString().slice(0, 10);

    const result = await query(
        `
            WITH scores AS (
                SELECT video_id, SUM(event_count) AS trend_score
                FROM social_video_events_daily
                WHERE event_type = $1 AND event_date >= $2
                GROUP BY video_id
            )
            SELECT v.*,
                   a.username as account_username,
                   a.display_name as account_display_name,
                   a.avatar_url as account_avatar_url,
                   a.platform as account_platform,
                   COALESCE(s.trend_score, 0) as trend_score
            FROM social_videos v
            INNER JOIN social_accounts a ON v.account_id = a.id
            LEFT JOIN scores s ON s.video_id = v.id
            WHERE v.is_active = true
              AND COALESCE(s.trend_score, 0) > 0
              AND ($3::text IS NULL OR v.platform = $3)
            ORDER BY COALESCE(s.trend_score, 0) DESC, v.created_at DESC
            LIMIT $4
        `,
        [event_type, startDateString, platform || null, safeLimit],
    );

    const videos = result.rows;

    videos.forEach((video) => {
        video.tags = JSON.parse(video.tags || "[]");
        video.trend_score = parseInt(video.trend_score);
        video.account = {
            username: video.account_username,
            display_name: video.account_display_name,
            avatar_url: video.account_avatar_url,
            platform: video.account_platform,
        };
        delete video.account_username;
        delete video.account_display_name;
        delete video.account_avatar_url;
        delete video.account_platform;
    });

    return videos;
};
