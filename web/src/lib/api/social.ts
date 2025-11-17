// 社交媒体 API 客户端
import { currentApiURL } from '$lib/api/api-url';

const getApiBase = () => `${currentApiURL()}/social`;

// 类型定义
export interface SocialAccount {
    id: number;
    platform: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
    profile_url?: string;
    description?: string;
    follower_count: number;
    category: string;
    tags: string[];
    priority: number;
    is_active: boolean;
    video_count?: number;
    created_at: number;
    updated_at: number;
}

export interface SocialVideo {
    id: number;
    account_id: number;
    account?: {
        username: string;
        display_name?: string;
        avatar_url?: string;
        platform: string;
    };
    platform: string;
    video_id?: string;
    title?: string;
    description?: string;
    video_url: string;
    thumbnail_url?: string;
    duration?: number;
    view_count: number;
    like_count: number;
    publish_date?: number;
    tags: string[];
    is_featured: boolean;
    is_active: boolean;
    display_order: number;
    created_at: number;
    updated_at: number;
}

export interface ApiResponse<T> {
    status: 'success' | 'error';
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

export interface PaginatedResponse<T> {
    [key: string]: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

export interface LoginResponse {
    token: string;
    user: {
        id: number;
        username: string;
        email?: string;
    };
}

export interface Stats {
    total_accounts: number;
    total_videos: number;
    by_platform: Record<string, number>;
    by_category: Record<string, number>;
}

export interface GroupedVideos {
    account: {
        id: number;
        name: string;
        platform: string;
        username: string;
        avatar_url?: string;
    };
    videos: {
        id: number;
        url: string;
        title?: string;
        created_at: number;
    }[];
}

// 辅助函数：获取存储的 token
const getToken = (): string | null => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('admin_token');
    }
    return null;
};

// 辅助函数：设置 token
export const setToken = (token: string): void => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('admin_token', token);
    }
};

// 辅助函数：清除 token
export const clearToken = (): void => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('admin_token');
    }
};

// 通用请求函数
const request = async <T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> => {
    const token = getToken();
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${getApiBase()}${endpoint}`, {
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            // 401 错误自动清除 token
            if (response.status === 401) {
                clearToken();
            }
        }

        return data;
    } catch (error) {
        console.error('API request failed:', error);
        return {
            status: 'error',
            error: {
                code: 'NETWORK_ERROR',
                message: 'Failed to connect to server',
            },
        };
    }
};

// ==================== 认证 API ====================

export const auth = {
    /**
     * 管理员登录
     */
    login: async (username: string, password: string): Promise<ApiResponse<LoginResponse>> => {
        const response = await request<LoginResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });

        if (response.status === 'success' && response.data) {
            setToken(response.data.token);
        }

        return response;
    },

    /**
     * 登出
     */
    logout: (): void => {
        clearToken();
    },

    /**
     * 验证登录状态
     */
    verify: async (): Promise<ApiResponse<{ user: any }>> => {
        return request('/auth/verify');
    },

    /**
     * 检查是否已登录
     */
    isLoggedIn: (): boolean => {
        return getToken() !== null;
    },
};

// ==================== 账号 API ====================

export const accounts = {
    /**
     * 获取账号列表
     */
    list: async (params?: {
        platform?: string;
        category?: string;
        is_active?: boolean;
        search?: string;
        page?: number;
        limit?: number;
        sort?: string;
        order?: string;
    }): Promise<ApiResponse<PaginatedResponse<SocialAccount>>> => {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
        }

        const query = queryParams.toString();
        return request(`/accounts${query ? `?${query}` : ''}`);
    },

    /**
     * 获取账号详情
     */
    get: async (id: number): Promise<ApiResponse<SocialAccount>> => {
        return request(`/accounts/${id}`);
    },

    /**
     * 创建账号
     */
    create: async (data: Partial<SocialAccount>): Promise<ApiResponse<SocialAccount>> => {
        return request('/accounts', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * 更新账号
     */
    update: async (id: number, data: Partial<SocialAccount>): Promise<ApiResponse<SocialAccount>> => {
        return request(`/accounts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * 删除账号
     */
    delete: async (id: number): Promise<ApiResponse<{ message: string }>> => {
        return request(`/accounts/${id}`, {
            method: 'DELETE',
        });
    },

    /**
     * 获取统计信息
     */
    stats: async (): Promise<ApiResponse<Stats>> => {
        return request('/accounts/stats');
    },
};

// ==================== 视频 API ====================

export const videos = {
    /**
     * 获取视频列表
     */
    list: async (params?: {
        account_id?: number;
        platform?: string;
        is_featured?: boolean;
        is_active?: boolean;
        search?: string;
        page?: number;
        limit?: number;
        sort?: string;
        order?: string;
    }): Promise<ApiResponse<PaginatedResponse<SocialVideo>>> => {
        const queryParams = new URLSearchParams();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined) {
                    queryParams.append(key, String(value));
                }
            });
        }

        const query = queryParams.toString();
        return request(`/videos${query ? `?${query}` : ''}`);
    },

    /**
     * 获取精选视频
     */
    featured: async (limit = 20): Promise<ApiResponse<SocialVideo[]>> => {
        return request(`/videos/featured?limit=${limit}`);
    },

    /**
     * 获取按博主分组的视频
     */
    grouped: async (platform?: string): Promise<ApiResponse<GroupedVideos[]>> => {
        const queryParams = new URLSearchParams();
        if (platform) {
            queryParams.append('platform', platform);
        }
        const query = queryParams.toString();
        return request(`/videos/grouped${query ? `?${query}` : ''}`);
    },

    /**
     * 获取视频详情
     */
    get: async (id: number): Promise<ApiResponse<SocialVideo>> => {
        return request(`/videos/${id}`);
    },

    /**
     * 创建视频
     */
    create: async (data: Partial<SocialVideo>): Promise<ApiResponse<SocialVideo>> => {
        return request('/videos', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * 更新视频
     */
    update: async (id: number, data: Partial<SocialVideo>): Promise<ApiResponse<SocialVideo>> => {
        return request(`/videos/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * 删除视频
     */
    delete: async (id: number): Promise<ApiResponse<{ message: string }>> => {
        return request(`/videos/${id}`, {
            method: 'DELETE',
        });
    },

    /**
     * 切换精选状态
     */
    toggleFeatured: async (id: number): Promise<ApiResponse<SocialVideo>> => {
        return request(`/videos/${id}/toggle-featured`, {
            method: 'POST',
        });
    },
};

// 默认导出
export default {
    auth,
    accounts,
    videos,
};
