import express from 'express';
import rateLimit from 'express-rate-limit';
import { Readable, Transform } from 'node:stream';
import { env } from '../config.js';
import { requireAuth, loginAdmin } from '../middleware/admin-auth.js';
import { fetchInstagramCreatorItemsDirect, syncAccountVideos } from '../processing/social/sync.js';
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
    getTrendingVideos,
    getResourceCategories,
    getResourceCategoryById,
    createResourceCategory,
    updateResourceCategory,
    deleteResourceCategory,
    getResourceLinks,
    getResourceLinkById,
    createResourceLink,
    updateResourceLink,
    deleteResourceLink
} from '../db/social-media.js';

const router = express.Router();

const MEDIA_PROXY_MAX_BYTES = 10 * 1024 * 1024;
const MEDIA_PROXY_TIMEOUT_MS = 10 * 1000;
const MEDIA_PROXY_ALLOWED_HOSTS = ['fbcdn.net', 'cdninstagram.com'];

const isAllowedMediaHost = (hostname) => {
    const host = String(hostname || '').toLowerCase();
    return MEDIA_PROXY_ALLOWED_HOSTS.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
};

const safeSingleQueryValue = (value) => {
    if (Array.isArray(value)) return value[0];
    return value;
};

const pickCategoryName = (category, locale) => {
    if (!category?.names) return category?.slug || `category-${category?.id ?? "unknown"}`;
    return (
        category.names[locale] ||
        category.names.en ||
        category.names.zh ||
        category.slug ||
        `category-${category.id}`
    );
};

const buildResourceTree = ({ categories, links, locale }) => {
    const nodesById = new Map();
    const roots = [];

    categories.forEach((category) => {
        const id = Number(category.id);
        const parentId =
            category.parent_id === null || category.parent_id === undefined
                ? null
                : Number(category.parent_id);
        nodesById.set(id, {
            id,
            parent_id: parentId,
            slug: category.slug || "",
            sort_order: Number(category.sort_order) || 0,
            name: pickCategoryName(category, locale),
            children: [],
            links: [],
        });
    });

    links.forEach((link) => {
        const categoryId = Number(link.category_id);
        const node = nodesById.get(categoryId);
        if (!node) return;
        node.links.push({
            id: Number(link.id),
            category_id: categoryId,
            title: link.title,
            url: link.url,
            description: link.description || "",
            sort_order: link.sort_order || 0,
            is_active: link.is_active !== false,
            created_at: link.created_at,
            updated_at: link.updated_at,
        });
    });

    nodesById.forEach((node) => {
        if (node.parent_id && nodesById.has(node.parent_id)) {
            nodesById.get(node.parent_id).children.push(node);
        } else {
            roots.push(node);
        }
    });

    const sortNodes = (node) => {
        node.children.sort((a, b) => b.sort_order - a.sort_order);
        node.links.sort((a, b) => b.sort_order - a.sort_order);
        node.children.forEach(sortNodes);
    };

    roots.forEach(sortNodes);

    const prune = (node) => {
        node.children = node.children.map(prune).filter(Boolean);
        const hasChildren = node.children.length > 0;
        const hasLinks = node.links.length > 0;
        if (!hasChildren && !hasLinks) return null;
        return node;
    };

    return roots.map(prune).filter(Boolean);
};

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

const requireInstagramUpstreamKey = (req, res, next) => {
    const expectedKey = env.instagramUpstreamApiKey;
    if (!expectedKey) return next();

    const auth = String(req.headers.authorization || "");
    if (auth === `Api-Key ${expectedKey}`) return next();

    return res.status(401).json({
        status: 'error',
        error: {
            code: 'UNAUTHORIZED',
            message: 'invalid upstream api key'
        }
    });
};

/**
 * POST /social/internal/instagram/items
 * Internal helper for upstream sync: fetch recent + pinned items for a creator.
 */
router.post('/internal/instagram/items', adminLimiter, requireInstagramUpstreamKey, async (req, res) => {
    try {
        const username = req.body?.username;
        if (typeof username !== 'string' || username.trim().length === 0) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'username is required'
                }
            });
        }

        const recentLimit = req.body?.recentLimit;
        const pinnedLimit = req.body?.pinnedLimit;

        const options = {
            recentLimit: typeof recentLimit === 'number' ? recentLimit : undefined,
            pinnedLimit: typeof pinnedLimit === 'number' ? pinnedLimit : undefined,
        };

        const logId = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
        console.log(`[ig-upstream:${logId}] request username=${username.trim()}`);

        const items = await fetchInstagramCreatorItemsDirect(username.trim(), options);

        console.log(`[ig-upstream:${logId}] response items=${items.length}`);

        return res.json({
            status: 'success',
            data: { items }
        });
    } catch (error) {
        console.error('Upstream instagram items error:', error);
        return res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: error instanceof Error ? error.message : 'Failed to fetch instagram items'
            }
        });
    }
});

// ==================== 认证路由 ====================

/**
 * POST /api/social/auth/login
 * 管理员登录
 */
const mediaProxyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    message: {
        status: 'error',
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
        }
    }
});

const fetchImageWithRedirects = async (url, signal) => {
    let current = url;

    for (let i = 0; i < 3; i++) {
        const res = await fetch(current, {
            redirect: 'manual',
            signal,
            headers: {
                accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'accept-language': 'en-US',
                'user-agent': 'Mozilla/5.0'
            }
        });

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (!location) return res;

            const next = new URL(location, current);
            if (next.protocol !== 'https:' || next.username || next.password || next.port) {
                throw new Error('Media proxy blocked redirect');
            }
            if (!isAllowedMediaHost(next.hostname)) {
                throw new Error('Media proxy blocked redirect host');
            }

            current = next.toString();
            continue;
        }

        return res;
    }

    throw new Error('Media proxy too many redirects');
};

router.get('/media/proxy', mediaProxyLimiter, async (req, res) => {
    const raw = safeSingleQueryValue(req.query.url);

    if (typeof raw !== 'string' || raw.length === 0) {
        return res.status(400).json({
            status: 'error',
            error: {
                code: 'INVALID_INPUT',
                message: 'url is required'
            }
        });
    }

    if (raw.length > 2048) {
        return res.status(400).json({
            status: 'error',
            error: {
                code: 'INVALID_INPUT',
                message: 'url is too long'
            }
        });
    }

    let target;
    try {
        target = new URL(raw);
    } catch {
        return res.status(400).json({
            status: 'error',
            error: {
                code: 'INVALID_INPUT',
                message: 'url is invalid'
            }
        });
    }

    if (
        target.protocol !== 'https:' ||
        target.username ||
        target.password ||
        target.port
    ) {
        return res.status(400).json({
            status: 'error',
            error: {
                code: 'INVALID_INPUT',
                message: 'url is not allowed'
            }
        });
    }

    if (!isAllowedMediaHost(target.hostname)) {
        return res.status(403).json({
            status: 'error',
            error: {
                code: 'FORBIDDEN',
                message: 'host is not allowed'
            }
        });
    }

    const abortController = new AbortController();
    const timeout = setTimeout(
        () => abortController.abort(),
        MEDIA_PROXY_TIMEOUT_MS,
    );

    res.on('close', () => abortController.abort());

    try {
        const upstream = await fetchImageWithRedirects(
            target.toString(),
            abortController.signal,
        );

        if (!upstream.ok || !upstream.body) {
            upstream.body?.cancel().catch(() => undefined);
            return res.status(404).end();
        }

        const contentType = upstream.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('image/')) {
            upstream.body.cancel().catch(() => undefined);
            return res.status(415).end();
        }

        const contentLength = upstream.headers.get('content-length');
        if (contentLength) {
            const length = Number(contentLength);
            if (Number.isFinite(length) && length > MEDIA_PROXY_MAX_BYTES) {
                upstream.body.cancel().catch(() => undefined);
                return res.status(413).end();
            }
        }

        res.setHeader('Content-Type', contentType);
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }
        res.setHeader(
            'Cache-Control',
            'public, max-age=86400, stale-while-revalidate=604800',
        );
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        let bytesSeen = 0;
        const limiter = new Transform({
            transform(chunk, _encoding, callback) {
                bytesSeen += chunk.length;
                if (bytesSeen > MEDIA_PROXY_MAX_BYTES) {
                    callback(new Error('Media proxy response too large'));
                    return;
                }
                callback(null, chunk);
            },
        });

        const upstreamStream = Readable.fromWeb(upstream.body);

        upstreamStream.on('error', () => {
            abortController.abort();
            res.end();
        });

        limiter.on('error', () => {
            abortController.abort();
            upstreamStream.destroy();
            if (!res.headersSent) res.status(413);
            res.end();
        });

        upstreamStream.pipe(limiter).pipe(res);
    } catch (error) {
        console.error('Media proxy error:', error);
        if (!res.headersSent) {
            res.status(502).end();
        } else {
            res.end();
        }
    } finally {
        clearTimeout(timeout);
    }
});

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
        const result = await getAccounts(filters);  // ← 添加了 await！
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
    const logId = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');

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
            logId,
        });

        res.json({
            status: 'success',
            data: result
        });
    } catch (error) {
        console.error(`[social-sync:${logId}] Sync account error:`, error);

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

// ==================== Resources ====================

/**
 * GET /api/social/resources/tree
 * Public resource tree
 */
router.get('/resources/tree', publicLimiter, async (req, res) => {
    try {
        const locale = String(req.query.locale || 'en');
        const categories = await getResourceCategories();
        const links = await getResourceLinks();
        const tree = buildResourceTree({ categories, links, locale });

        res.json({
            status: 'success',
            data: {
                categories: tree
            }
        });
    } catch (error) {
        console.error('Get resource tree error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve resources'
            }
        });
    }
});

/**
 * GET /api/social/admin/resources/categories
 * Admin resource categories
 */
router.get('/admin/resources/categories', requireAuth, adminLimiter, async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';
        const categories = await getResourceCategories({ includeInactive });

        res.json({
            status: 'success',
            data: { categories }
        });
    } catch (error) {
        console.error('Get resource categories error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve categories'
            }
        });
    }
});

/**
 * POST /api/social/admin/resources/categories
 * Admin create resource category
 */
router.post('/admin/resources/categories', requireAuth, adminLimiter, async (req, res) => {
    try {
        const { parent_id, slug, sort_order, is_active, names } = req.body || {};

        const nameValues = names && typeof names === 'object' ? Object.values(names) : [];
        const hasName = nameValues.some((value) => typeof value === 'string' && value.trim().length > 0);
        if (!hasName) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Category name is required'
                }
            });
        }

        const category = await createResourceCategory({
            parent_id: parent_id ?? null,
            slug,
            sort_order,
            is_active,
            names,
        });

        res.status(201).json({
            status: 'success',
            data: category
        });
    } catch (error) {
        console.error('Create resource category error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to create category'
            }
        });
    }
});

/**
 * PUT /api/social/admin/resources/categories/:id
 * Admin update resource category
 */
router.put('/admin/resources/categories/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await getResourceCategoryById(id);
        if (!existing) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Category not found'
                }
            });
        }

        const updated = await updateResourceCategory(id, req.body || {});
        res.json({
            status: 'success',
            data: updated
        });
    } catch (error) {
        console.error('Update resource category error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to update category'
            }
        });
    }
});

/**
 * DELETE /api/social/admin/resources/categories/:id
 * Admin delete resource category
 */
router.delete('/admin/resources/categories/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const deleted = await deleteResourceCategory(id);

        if (!deleted) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Category not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: { message: 'Category deleted' }
        });
    } catch (error) {
        console.error('Delete resource category error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to delete category'
            }
        });
    }
});

/**
 * GET /api/social/admin/resources/links
 * Admin resource links
 */
router.get('/admin/resources/links', requireAuth, adminLimiter, async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';
        const categoryId = safeSingleQueryValue(req.query.category_id);
        const links = await getResourceLinks({
            category_id: categoryId !== undefined ? Number(categoryId) : undefined,
            includeInactive,
        });

        res.json({
            status: 'success',
            data: { links }
        });
    } catch (error) {
        console.error('Get resource links error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to retrieve links'
            }
        });
    }
});

/**
 * POST /api/social/admin/resources/links
 * Admin create resource link
 */
router.post('/admin/resources/links', requireAuth, adminLimiter, async (req, res) => {
    try {
        const { category_id, title, url, description, sort_order, is_active } = req.body || {};

        if (!category_id || !title || !url) {
            return res.status(400).json({
                status: 'error',
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Category, title and url are required'
                }
            });
        }

        const link = await createResourceLink({
            category_id,
            title,
            url,
            description,
            sort_order,
            is_active,
        });

        res.status(201).json({
            status: 'success',
            data: link
        });
    } catch (error) {
        console.error('Create resource link error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to create link'
            }
        });
    }
});

/**
 * PUT /api/social/admin/resources/links/:id
 * Admin update resource link
 */
router.put('/admin/resources/links/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await getResourceLinkById(id);
        if (!existing) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Link not found'
                }
            });
        }

        const updated = await updateResourceLink(id, req.body || {});
        res.json({
            status: 'success',
            data: updated
        });
    } catch (error) {
        console.error('Update resource link error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to update link'
            }
        });
    }
});

/**
 * DELETE /api/social/admin/resources/links/:id
 * Admin delete resource link
 */
router.delete('/admin/resources/links/:id', requireAuth, adminLimiter, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const deleted = await deleteResourceLink(id);

        if (!deleted) {
            return res.status(404).json({
                status: 'error',
                error: {
                    code: 'NOT_FOUND',
                    message: 'Link not found'
                }
            });
        }

        res.json({
            status: 'success',
            data: { message: 'Link deleted' }
        });
    } catch (error) {
        console.error('Delete resource link error:', error);
        res.status(500).json({
            status: 'error',
            error: {
                code: 'SERVER_ERROR',
                message: 'Failed to delete link'
            }
        });
    }
});

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
        console.log(
            `[toggle-featured] request id=${id} user=${req.user?.id ?? "unknown"} host=${req.headers.host}`,
        );
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

        console.log(
            `[toggle-featured] response id=${video.id} is_featured=${video.is_featured}`,
        );
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
