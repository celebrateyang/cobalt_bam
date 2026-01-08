import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, loginAdmin } from '../middleware/admin-auth.js';
import { syncAccountVideos } from '../processing/social/sync.js';
import {
    createAccount,
    getAccounts,
    getAccountById,
    updateAccount,
    deleteAccount,
    createVideo,
    getVideos,
    getVideoById,
    updateVideo,
    deleteVideo,
    deleteVideos,
    getFeaturedVideos,
    toggleFeatured,
    getStats,
    recordVideoEvent,
    getTrendingVideos
} from '../db/social-media.js';

const router = express.Router();

// 公开 API 限流
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100,
    message: {
        status: 'error',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
        }
    }
});

// 管理员 API 限流
// Discover 热榜事件上报限流（更宽松，避免影响下载）
const eventLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    message: {
        status: 'error',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
        }
    }
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: {
        status: 'error',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
        }
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 5, // 只允许5次登录尝试
    skipSuccessfulRequests: true, // 成功的登录不计入限制
    message: {
        status: 'error',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts, please try again later'
        }
    }
});

// ==================== 认证路由 ====================

/**
 * POST /api/social/auth/login
 * 管理员登录
 */
router.post('/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Username and password are required'
                }
            });
        }

        const result = await loginAdmin(username, password);

        if (!result.success) {
            return res.status(401).json({
                status: 'error',
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: result.error
                }
            });
        }

        res.json({
            status: 'success',
            data: {
                token: result.token,
                user: result.user
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'An error occurred during login'
            }
        });
    }
});

/**
 * GET /api/social/auth/verify
 * 验证登录状态
 */
router.get('/auth/verify', requireAuth, (req, res) => {
    res.json({
        status: 'success',
        data: {
            user: req.user
        }
    });
});

// ==================== 账号路由 ====================

/**
 * GET /api/social/accounts
 * 获取账号列表（公开）
 */
router.get('/accounts', publicLimiter, async (req, res) => {
    try {
        console.log('========== GET ACCOUNTS REQUEST ==========');
        console.log('Query params:', req.query);
        const filters = {
            platform: req.query.platform,
            category: req.query.category,
            is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
            search: req.query.search,
            page: req.query.page,
            limit: req.query.limit,
            sort: req.query.sort,
            order: req.query.order
        };

        console.log('Filters:', filters);
        const result = await getAccounts(filters);  // ← 添加了 await！
        console.log('Accounts count:', result.accounts ? result.accounts.length : 0);

        res.json({
            status: 'success',
            data: result
        });
        console.log('✅ Response sent successfully');
        console.log('========== END GET ACCOUNTS ==========');
    } catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve accounts'
            }
        });
    }
});

/**
 * GET /api/social/accounts/stats
 * 获取统计信息（公开）
 */
router.get('/accounts/stats', publicLimiter, async (req, res) => {
    try {
        const stats = await getStats();

        res.json({
            status: 'success',
            data: stats
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve statistics'
            }
        });
    }
});

/**
 * GET /api/social/accounts/:id
 * 获取账号详情（公开）
 */
router.get('/accounts/:id', publicLimiter, async (req, res) => {
    try {
        const account = await getAccountById(parseInt(req.params.id));

        if (!account) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Account not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: account
        });
    } catch (error) {
        console.error('Get account error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve account'
            }
        });
    }
});

/**
 * POST /api/social/accounts
 * 创建账号（需要认证）
 */
router.post('/accounts', requireAuth, adminLimiter, async (req, res) => {
    try {
        console.log('========== CREATE ACCOUNT REQUEST ==========');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('User:', req.user);

        const { platform, username, display_name, avatar_url, profile_url,
            description, follower_count, category, tags, priority, is_active, sync_enabled } = req.body;

        console.log('Extracted fields:', { platform, username, display_name, follower_count, category });

        if (!platform || !username) {
            console.log('❌ Validation failed: Missing platform or username');
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Platform and username are required'
                }
            });
        }

        console.log('✅ Validation passed');

        const accountData = {
            platform,
            username,
            display_name,
            avatar_url,
            profile_url,
            description,
            follower_count,
            category,
            tags,
            priority,
            is_active,
            sync_enabled,
        };

        console.log('Creating account with data:', JSON.stringify(accountData, null, 2));
        const account = await createAccount(accountData);
        console.log('✅ Account created successfully:', account);

        res.status(201).json({
            status: 'success',
            data: account
        });
        console.log('========== END CREATE ACCOUNT ==========');
    } catch (error) {
        console.error('❌ Create account error:', error);

        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({
                status: 'error',
                error: {
                    code: 'DUPLICATE',
                    message: 'Account with this platform and username already exists'
                }
            });
        }

        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to create account'
            }
        });
    }
});

/**
 * PUT /api/social/accounts/:id
 * 更新账号（需要认证）
 */
router.put('/accounts/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;

        const account = await updateAccount(id, updates);

        if (!account) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Account not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: account
        });
    } catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to update account'
            }
        });
    }
});

/**
 * DELETE /api/social/accounts/:id
 * 删除账号（需要认证）
 */
router.delete('/accounts/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const success = await deleteAccount(id);

        if (!success) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Account not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: { message: 'Account deleted successfully' }
        });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to delete account'
            }
        });
    }
});

/**
 * POST /api/social/accounts/:id/sync
 * 同步白名单创作者（需要认证）
 */
router.post('/accounts/:id/sync', requireAuth, adminLimiter, async (req, res) => {
    const now = Date.now();

    try {
        const id = parseInt(req.params.id);
        const account = await getAccountById(id);

        if (!account) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Account not found'
                }
            });
        }

        const result = await syncAccountVideos(account, {
            recentLimit: req.body?.recentLimit,
            pinnedLimit: req.body?.pinnedLimit,
        });

        res.json({
            status: 'success',
            data: result
        });
    } catch (error) {
        console.error('Sync account error:', error);

        try {
            const id = parseInt(req.params.id);
            await updateAccount(id, {
                sync_last_run_at: now,
                sync_error: error instanceof Error ? error.message : String(error),
            });
        } catch {
            // ignore secondary failures
        }

        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to sync account'
            }
        });
    }
});

// ==================== 视频路由 ====================

/**
 * GET /api/social/videos
 * 获取视频列表（公开）
 */
router.get('/videos', publicLimiter, async (req, res) => {
    try {
        const filters = {
            account_id: req.query.account_id,
            platform: req.query.platform,
            is_featured: req.query.is_featured !== undefined ? req.query.is_featured === 'true' : undefined,
            is_pinned: req.query.is_pinned !== undefined ? req.query.is_pinned === 'true' : undefined,
            is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
            search: req.query.search,
            page: req.query.page,
            limit: req.query.limit,
            sort: req.query.sort,
            order: req.query.order
        };

        const result = await getVideos(filters);

        res.json({
            status: 'success',
            data: result
        });
    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve videos'
            }
        });
    }
});

/**
 * GET /api/social/videos/grouped
 * 获取按博主分组的视频列表（公开）
 */
router.get('/videos/grouped', publicLimiter, async (req, res) => {
    try {
        const filters = {
            platform: req.query.platform,
            is_active: true // 只显示活跃的视频
        };

        // 获取所有视频
        const result = await getVideos({ ...filters, limit: 1000 });
        const videos = result.videos || [];

        console.log(`[Grouped] Found ${videos.length} videos`); // 调试日志

        // 按账号分组
        const grouped = {};
        videos.forEach(video => {
            const accountId = video.account_id;
            if (!grouped[accountId]) {
                grouped[accountId] = {
                    account: {
                        id: video.account_id,
                        name: video.account?.display_name || video.account?.username || 'Unknown',
                        platform: video.platform,
                        username: video.account?.username || 'unknown',
                        avatar_url: video.account?.avatar_url
                    },
                    videos: []
                };
            }
            grouped[accountId].videos.push({
                id: video.id,
                url: video.video_url,
                title: video.title,
                created_at: video.created_at
            });
        });

        // 转换为数组并按账号名称排序
        const groupedArray = Object.values(grouped).sort((a, b) =>
            a.account.name.localeCompare(b.account.name, 'zh-CN')
        );

        console.log(`[Grouped] Returning ${groupedArray.length} account groups`); // 调试日志

        res.json({
            status: 'success',
            data: groupedArray
        });
    } catch (error) {
        console.error('Get grouped videos error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve grouped videos'
            }
        });
    }
});

/**
 * GET /api/social/videos/featured
 * 获取精选视频列表（公开）
 */
router.get('/videos/featured', publicLimiter, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const result = await getFeaturedVideos(limit);

        res.json({
            status: 'success',
            data: result.videos
        });
    } catch (error) {
        console.error('Get featured videos error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve featured videos'
            }
        });
    }
});

/**
 * GET /api/social/videos/:id
 * 获取视频详情（公开）
 */
/**
 * GET /api/social/videos/trending
 * 获取站内热榜（按 download_click 聚合）
 */
router.get('/videos/trending', publicLimiter, async (req, res) => {
    try {
        const allowedPlatforms = new Set(['tiktok', 'instagram']);
        const platform = typeof req.query.platform === 'string' && allowedPlatforms.has(req.query.platform)
            ? req.query.platform
            : undefined;

        const daysRaw = parseInt(req.query.days);
        const limitRaw = parseInt(req.query.limit);
        const days = Math.min(30, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 7));
        const limit = Math.min(60, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));

        const videos = await getTrendingVideos({
            platform,
            days,
            limit,
            event_type: 'download_click',
        });

        res.json({
            status: 'success',
            data: {
                videos,
                meta: {
                    days,
                    event_type: 'download_click',
                }
            }
        });
    } catch (error) {
        console.error('Get trending videos error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve trending videos'
            }
        });
    }
});

/**
 * POST /api/social/videos/:id/event
 * 上报站内行为事件（用于热榜）
 */
router.post('/videos/:id/event', eventLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Invalid video id'
                }
            });
        }

        const allowedTypes = new Set(['download_click', 'creator_batch_open']);
        const type = req.body?.type;

        if (typeof type !== 'string' || !allowedTypes.has(type)) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Invalid event type'
                }
            });
        }

        const eventCount = await recordVideoEvent(id, type);
        if (eventCount === null) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Video not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: {
                event_count: eventCount
            }
        });
    } catch (error) {
        console.error('Record video event error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to record event'
            }
        });
    }
});

router.get('/videos/:id', publicLimiter, async (req, res) => {
    try {
        const video = await getVideoById(parseInt(req.params.id));

        if (!video) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Video not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: video
        });
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve video'
            }
        });
    }
});

/**
 * POST /api/social/videos
 * 创建视频（需要认证）
 */
router.post('/videos', requireAuth, adminLimiter, async (req, res) => {
    try {
        const { account_id, platform, video_id, title, description, video_url,
            thumbnail_url, duration, view_count, like_count, publish_date,
            tags, is_featured, is_active, display_order } = req.body;

        if (!account_id || !video_url) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Account ID and video URL are required'
                }
            });
        }

        // 验证账号是否存在
        const account = await getAccountById(account_id);
        if (!account) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Invalid account ID'
                }
            });
        }

        const videoData = {
            account_id,
            platform: platform || account.platform,
            video_id,
            title,
            description,
            video_url,
            thumbnail_url,
            duration,
            view_count,
            like_count,
            publish_date,
            tags,
            is_featured,
            is_active,
            display_order
        };

        const video = await createVideo(videoData);

        res.status(201).json({
            status: 'success',
            data: video
        });
    } catch (error) {
        console.error('Create video error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to create video'
            }
        });
    }
});

/**
 * PUT /api/social/videos/:id
 * 更新视频（需要认证）
 */
router.put('/videos/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;

        const video = await updateVideo(id, updates);

        if (!video) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Video not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: video
        });
    } catch (error) {
        console.error('Update video error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to update video'
            }
        });
    }
});

/**
 * DELETE /api/social/videos/:id
 * 删除视频（需要认证）
 */
router.delete('/videos/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const success = await deleteVideo(id);

        if (!success) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Video not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: { message: 'Video deleted successfully' }
        });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to delete video'
            }
        });
    }
});

/**
 * POST /api/social/videos/batch-delete
 * 批量删除视频（需要认证）
 */
router.post('/videos/batch-delete', requireAuth, adminLimiter, async (req, res) => {
    try {
        const ids = req.body?.ids;
        if (!Array.isArray(ids)) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'ids must be an array'
                }
            });
        }

        const normalized = Array.from(
            new Set(
                ids
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value > 0),
            ),
        );

        if (!normalized.length) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'ids array is empty'
                }
            });
        }

        if (normalized.length > 200) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'too many ids (max 200)'
                }
            });
        }

        const deleted = await deleteVideos(normalized);

        res.json({
            status: 'success',
            data: {
                deleted
            }
        });
    } catch (error) {
        console.error('Batch delete videos error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to batch delete videos'
            }
        });
    }
});

/**
 * POST /api/social/videos/:id/toggle-featured
 * 切换精选状态（需要认证）
 */
router.post('/videos/:id/toggle-featured', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const video = await toggleFeatured(id);

        if (!video) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Video not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: video
        });
    } catch (error) {
        console.error('Toggle featured error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to toggle featured status'
            }
        });
    }
});

export default router;
