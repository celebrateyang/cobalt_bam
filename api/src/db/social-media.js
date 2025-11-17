import Database from "better-sqlite3";
import { env } from "../config.js";

// 初始化数据库
export const initDatabase = () => {
    const db = new Database(env.dbPath || './db.sqlite3');
    db.pragma('journal_mode = WAL'); // 启用 WAL 模式提高性能
    
    // 创建社交媒体账号表
    db.exec(`
        CREATE TABLE IF NOT EXISTS social_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            is_active INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(platform, username)
        );
    `);
    
    // 创建账号表索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_accounts_platform ON social_accounts(platform);
        CREATE INDEX IF NOT EXISTS idx_accounts_category ON social_accounts(category);
        CREATE INDEX IF NOT EXISTS idx_accounts_priority ON social_accounts(priority DESC);
        CREATE INDEX IF NOT EXISTS idx_accounts_active ON social_accounts(is_active);
    `);
    
    // 创建社交媒体视频表
    db.exec(`
        CREATE TABLE IF NOT EXISTS social_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            publish_date INTEGER,
            tags TEXT,
            is_featured INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            display_order INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
        );
    `);
    
    // 创建视频表索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_videos_account ON social_videos(account_id);
        CREATE INDEX IF NOT EXISTS idx_videos_platform ON social_videos(platform);
        CREATE INDEX IF NOT EXISTS idx_videos_featured ON social_videos(is_featured);
        CREATE INDEX IF NOT EXISTS idx_videos_active ON social_videos(is_active);
        CREATE INDEX IF NOT EXISTS idx_videos_display_order ON social_videos(display_order DESC);
        CREATE INDEX IF NOT EXISTS idx_videos_created_at ON social_videos(created_at DESC);
    `);
    
    // 创建管理员用户表
    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email TEXT,
            is_active INTEGER DEFAULT 1,
            last_login_at INTEGER,
            created_at INTEGER NOT NULL
        );
    `);
    
    db.close();
    console.log('✅ Social media database initialized');
};

// 获取数据库连接
export const getDB = () => {
    const db = new Database(env.dbPath || './db.sqlite3');
    db.pragma('journal_mode = WAL');
    return db;
};

// ==================== 账号管理函数 ====================

/**
 * 创建账号
 */
export const createAccount = (accountData) => {
    const db = getDB();
    try {
        const now = Date.now();
        const tags = JSON.stringify(accountData.tags || []);
        
        const stmt = db.prepare(`
            INSERT INTO social_accounts (
                platform, username, display_name, avatar_url, profile_url,
                description, follower_count, category, tags, priority,
                is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
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
            accountData.is_active !== false ? 1 : 0,
            now,
            now
        );
        
        const account = getAccountById(result.lastInsertRowid);
        return account;
    } finally {
        db.close();
    }
};

/**
 * 获取账号列表
 */
export const getAccounts = (filters = {}) => {
    const db = getDB();
    try {
        let sql = `
            SELECT a.*, 
                   COUNT(v.id) as video_count
            FROM social_accounts a
            LEFT JOIN social_videos v ON a.id = v.account_id AND v.is_active = 1
            WHERE 1=1
        `;
        const params = [];
        
        if (filters.platform) {
            sql += ' AND a.platform = ?';
            params.push(filters.platform);
        }
        
        if (filters.category) {
            sql += ' AND a.category = ?';
            params.push(filters.category);
        }
        
        if (filters.is_active !== undefined) {
            sql += ' AND a.is_active = ?';
            params.push(filters.is_active ? 1 : 0);
        }
        
        if (filters.search) {
            sql += ' AND (a.username LIKE ? OR a.display_name LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm);
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
        
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const stmt = db.prepare(sql);
        const accounts = stmt.all(...params);
        
        // 解析 tags JSON
        accounts.forEach(account => {
            account.tags = JSON.parse(account.tags || '[]');
            account.is_active = Boolean(account.is_active);
        });
        
        // 获取总数
        let countSql = 'SELECT COUNT(*) as total FROM social_accounts WHERE 1=1';
        const countParams = [];
        
        if (filters.platform) {
            countSql += ' AND platform = ?';
            countParams.push(filters.platform);
        }
        if (filters.category) {
            countSql += ' AND category = ?';
            countParams.push(filters.category);
        }
        if (filters.is_active !== undefined) {
            countSql += ' AND is_active = ?';
            countParams.push(filters.is_active ? 1 : 0);
        }
        if (filters.search) {
            countSql += ' AND (username LIKE ? OR display_name LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            countParams.push(searchTerm, searchTerm);
        }
        
        const { total } = db.prepare(countSql).get(...countParams);
        
        return {
            accounts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    } finally {
        db.close();
    }
};

/**
 * 根据 ID 获取账号
 */
export const getAccountById = (id) => {
    const db = getDB();
    try {
        const stmt = db.prepare(`
            SELECT a.*,
                   COUNT(v.id) as video_count
            FROM social_accounts a
            LEFT JOIN social_videos v ON a.id = v.account_id AND v.is_active = 1
            WHERE a.id = ?
            GROUP BY a.id
        `);
        
        const account = stmt.get(id);
        if (account) {
            account.tags = JSON.parse(account.tags || '[]');
            account.is_active = Boolean(account.is_active);
        }
        return account;
    } finally {
        db.close();
    }
};

/**
 * 更新账号
 */
export const updateAccount = (id, updates) => {
    const db = getDB();
    try {
        const fields = [];
        const values = [];
        
        const allowedFields = [
            'platform', 'username', 'display_name', 'avatar_url', 'profile_url',
            'description', 'follower_count', 'category', 'priority', 'is_active'
        ];
        
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                if (field === 'is_active') {
                    values.push(updates[field] ? 1 : 0);
                } else {
                    values.push(updates[field]);
                }
            }
        });
        
        if (updates.tags !== undefined) {
            fields.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
        }
        
        fields.push('updated_at = ?');
        values.push(Date.now());
        
        values.push(id);
        
        const stmt = db.prepare(`
            UPDATE social_accounts
            SET ${fields.join(', ')}
            WHERE id = ?
        `);
        
        stmt.run(...values);
        return getAccountById(id);
    } finally {
        db.close();
    }
};

/**
 * 删除账号
 */
export const deleteAccount = (id) => {
    const db = getDB();
    try {
        const stmt = db.prepare('DELETE FROM social_accounts WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    } finally {
        db.close();
    }
};

// ==================== 视频管理函数 ====================

/**
 * 创建视频
 */
export const createVideo = (videoData) => {
    const db = getDB();
    try {
        const now = Date.now();
        const tags = JSON.stringify(videoData.tags || []);
        
        const stmt = db.prepare(`
            INSERT INTO social_videos (
                account_id, platform, video_id, title, description,
                video_url, thumbnail_url, duration, view_count, like_count,
                publish_date, tags, is_featured, is_active, display_order,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
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
            videoData.is_featured ? 1 : 0,
            videoData.is_active !== false ? 1 : 0,
            videoData.display_order || 0,
            now,
            now
        );
        
        return getVideoById(result.lastInsertRowid);
    } finally {
        db.close();
    }
};

/**
 * 获取视频列表
 */
export const getVideos = (filters = {}) => {
    const db = getDB();
    try {
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
        
        if (filters.account_id) {
            sql += ' AND v.account_id = ?';
            params.push(filters.account_id);
        }
        
        if (filters.platform) {
            sql += ' AND v.platform = ?';
            params.push(filters.platform);
        }
        
        if (filters.is_featured !== undefined) {
            sql += ' AND v.is_featured = ?';
            params.push(filters.is_featured ? 1 : 0);
        }
        
        if (filters.is_active !== undefined) {
            sql += ' AND v.is_active = ?';
            params.push(filters.is_active ? 1 : 0);
        }
        
        if (filters.search) {
            sql += ' AND (v.title LIKE ? OR v.description LIKE ? OR a.username LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
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
        
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const stmt = db.prepare(sql);
        const videos = stmt.all(...params);
        
        // 解析 JSON 和组装账号信息
        videos.forEach(video => {
            video.tags = JSON.parse(video.tags || '[]');
            video.is_featured = Boolean(video.is_featured);
            video.is_active = Boolean(video.is_active);
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
        
        if (filters.account_id) {
            countSql += ' AND v.account_id = ?';
            countParams.push(filters.account_id);
        }
        if (filters.platform) {
            countSql += ' AND v.platform = ?';
            countParams.push(filters.platform);
        }
        if (filters.is_featured !== undefined) {
            countSql += ' AND v.is_featured = ?';
            countParams.push(filters.is_featured ? 1 : 0);
        }
        if (filters.is_active !== undefined) {
            countSql += ' AND v.is_active = ?';
            countParams.push(filters.is_active ? 1 : 0);
        }
        if (filters.search) {
            countSql += ' AND (v.title LIKE ? OR v.description LIKE ? OR a.username LIKE ?)';
            const searchTerm = `%${filters.search}%`;
            countParams.push(searchTerm, searchTerm, searchTerm);
        }
        
        const { total } = db.prepare(countSql).get(...countParams);
        
        return {
            videos,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    } finally {
        db.close();
    }
};

/**
 * 根据 ID 获取视频
 */
export const getVideoById = (id) => {
    const db = getDB();
    try {
        const stmt = db.prepare(`
            SELECT v.*,
                   a.username as account_username,
                   a.display_name as account_display_name,
                   a.avatar_url as account_avatar_url
            FROM social_videos v
            INNER JOIN social_accounts a ON v.account_id = a.id
            WHERE v.id = ?
        `);
        
        const video = stmt.get(id);
        if (video) {
            video.tags = JSON.parse(video.tags || '[]');
            video.is_featured = Boolean(video.is_featured);
            video.is_active = Boolean(video.is_active);
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
    } finally {
        db.close();
    }
};

/**
 * 更新视频
 */
export const updateVideo = (id, updates) => {
    const db = getDB();
    try {
        const fields = [];
        const values = [];
        
        const allowedFields = [
            'video_id', 'title', 'description', 'video_url', 'thumbnail_url',
            'duration', 'view_count', 'like_count', 'publish_date',
            'is_featured', 'is_active', 'display_order'
        ];
        
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                if (field === 'is_featured' || field === 'is_active') {
                    values.push(updates[field] ? 1 : 0);
                } else {
                    values.push(updates[field]);
                }
            }
        });
        
        if (updates.tags !== undefined) {
            fields.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
        }
        
        fields.push('updated_at = ?');
        values.push(Date.now());
        
        values.push(id);
        
        const stmt = db.prepare(`
            UPDATE social_videos
            SET ${fields.join(', ')}
            WHERE id = ?
        `);
        
        stmt.run(...values);
        return getVideoById(id);
    } finally {
        db.close();
    }
};

/**
 * 删除视频
 */
export const deleteVideo = (id) => {
    const db = getDB();
    try {
        const stmt = db.prepare('DELETE FROM social_videos WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    } finally {
        db.close();
    }
};

/**
 * 获取精选视频
 */
export const getFeaturedVideos = (limit = 20) => {
    return getVideos({
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
export const toggleFeatured = (id) => {
    const db = getDB();
    try {
        const video = getVideoById(id);
        if (!video) return null;
        
        const stmt = db.prepare(`
            UPDATE social_videos
            SET is_featured = ?, updated_at = ?
            WHERE id = ?
        `);
        
        stmt.run(video.is_featured ? 0 : 1, Date.now(), id);
        return getVideoById(id);
    } finally {
        db.close();
    }
};

// ==================== 统计函数 ====================

/**
 * 获取统计信息
 */
export const getStats = () => {
    const db = getDB();
    try {
        const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM social_accounts WHERE is_active = 1').get().count;
        const totalVideos = db.prepare('SELECT COUNT(*) as count FROM social_videos WHERE is_active = 1').get().count;
        
        const byPlatform = {};
        const platforms = db.prepare(`
            SELECT platform, COUNT(*) as count 
            FROM social_accounts 
            WHERE is_active = 1 
            GROUP BY platform
        `).all();
        platforms.forEach(p => {
            byPlatform[p.platform] = p.count;
        });
        
        const byCategory = {};
        const categories = db.prepare(`
            SELECT category, COUNT(*) as count 
            FROM social_accounts 
            WHERE is_active = 1 
            GROUP BY category
        `).all();
        categories.forEach(c => {
            byCategory[c.category] = c.count;
        });
        
        return {
            total_accounts: totalAccounts,
            total_videos: totalVideos,
            by_platform: byPlatform,
            by_category: byCategory
        };
    } finally {
        db.close();
    }
};

// ==================== 管理员用户函数 ====================

/**
 * 创建管理员用户
 */
export const createAdminUser = (username, passwordHash, email = '') => {
    const db = getDB();
    try {
        const stmt = db.prepare(`
            INSERT INTO admin_users (username, password_hash, email, created_at)
            VALUES (?, ?, ?, ?)
        `);
        
        const result = stmt.run(username, passwordHash, email, Date.now());
        return result.lastInsertRowid;
    } finally {
        db.close();
    }
};

/**
 * 根据用户名获取管理员
 */
export const getAdminByUsername = (username) => {
    const db = getDB();
    try {
        const stmt = db.prepare('SELECT * FROM admin_users WHERE username = ?');
        return stmt.get(username);
    } finally {
        db.close();
    }
};

/**
 * 更新最后登录时间
 */
export const updateLastLogin = (userId) => {
    const db = getDB();
    try {
        const stmt = db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?');
        stmt.run(Date.now(), userId);
    } finally {
        db.close();
    }
};
