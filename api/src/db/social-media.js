import { query, getClient, initPool } from "./pg-client.js";
import { env } from "../config.js";

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
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_platform ON social_accounts(platform);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_category ON social_accounts(category);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_priority ON social_accounts(priority DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_accounts_active ON social_accounts(is_active);`);

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
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_account ON social_videos(account_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_platform ON social_videos(platform);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_featured ON social_videos(is_featured);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_active ON social_videos(is_active);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_display_order ON social_videos(display_order DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_videos_created_at ON social_videos(created_at DESC);`);

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

    const result = await query(`
        INSERT INTO social_accounts (
            platform, username, display_name, avatar_url, profile_url,
            description, follower_count, category, tags, priority,
            is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
    const sortField = filters.sort || 'priority';
    const sortOrder = filters.order || 'DESC';
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
        'description', 'follower_count', 'category', 'priority', 'is_active'
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
            created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
        now,
        now
    ]);

    return await getVideoById(result.rows[0].id);
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
    const sortField = filters.sort || 'display_order';
    const sortOrder = filters.order || 'DESC';

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
        'is_featured', 'is_active', 'display_order'
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

    await query(`
        UPDATE social_videos
        SET is_featured = $1, updated_at = $2
        WHERE id = $3
    `, [!video.is_featured, Date.now(), id]);

    return await getVideoById(id);
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
