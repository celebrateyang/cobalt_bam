import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, loginAdmin } from '../middleware/admin-auth.js';
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
    getFeaturedVideos,
    toggleFeatured,
    getStats
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

// ==================== 认证路由 ====================

/**
 * POST /api/social/auth/login
 * 管理员登录
 */
router.post('/auth/login', publicLimiter, (req, res) => {
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
        
        const result = loginAdmin(username, password);
        
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
router.get('/accounts', publicLimiter, (req, res) => {
    try {
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
        
        const result = getAccounts(filters);
        
        res.json({
            status: 'success',
            data: result
        });
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
router.get('/accounts/stats', publicLimiter, (req, res) => {
    try {
        const stats = getStats();
        
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
router.get('/accounts/:id', publicLimiter, (req, res) => {
    try {
        const account = getAccountById(parseInt(req.params.id));
        
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
router.post('/accounts', requireAuth, adminLimiter, (req, res) => {
    try {
        const { platform, username, display_name, avatar_url, profile_url, 
                description, follower_count, category, tags, priority, is_active } = req.body;
        
        if (!platform || !username) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Platform and username are required'
                }
            });
        }
        
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
            is_active
        };
        
        const account = createAccount(accountData);
        
        res.status(201).json({
            status: 'success',
            data: account
        });
    } catch (error) {
        console.error('Create account error:', error);
        
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
router.put('/accounts/:id', requireAuth, adminLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;
        
        const account = updateAccount(id, updates);
        
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
router.delete('/accounts/:id', requireAuth, adminLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const success = deleteAccount(id);
        
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

// ==================== 视频路由 ====================

/**
 * GET /api/social/videos
 * 获取视频列表（公开）
 */
router.get('/videos', publicLimiter, (req, res) => {
    try {
        const filters = {
            account_id: req.query.account_id,
            platform: req.query.platform,
            is_featured: req.query.is_featured !== undefined ? req.query.is_featured === 'true' : undefined,
            is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
            search: req.query.search,
            page: req.query.page,
            limit: req.query.limit,
            sort: req.query.sort,
            order: req.query.order
        };
        
        const result = getVideos(filters);
        
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
router.get('/videos/grouped', publicLimiter, (req, res) => {
    try {
        const filters = {
            platform: req.query.platform,
            is_active: true // 只显示活跃的视频
        };
        
        // 获取所有视频
        const result = getVideos({ ...filters, limit: 1000 });
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
router.get('/videos/featured', publicLimiter, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const result = getFeaturedVideos(limit);
        
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
router.get('/videos/:id', publicLimiter, (req, res) => {
    try {
        const video = getVideoById(parseInt(req.params.id));
        
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
router.post('/videos', requireAuth, adminLimiter, (req, res) => {
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
        const account = getAccountById(account_id);
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
        
        const video = createVideo(videoData);
        
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
router.put('/videos/:id', requireAuth, adminLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;
        
        const video = updateVideo(id, updates);
        
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
router.delete('/videos/:id', requireAuth, adminLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const success = deleteVideo(id);
        
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
 * POST /api/social/videos/:id/toggle-featured
 * 切换精选状态（需要认证）
 */
router.post('/videos/:id/toggle-featured', requireAuth, adminLimiter, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const video = toggleFeatured(id);
        
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
