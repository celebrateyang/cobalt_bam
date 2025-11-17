import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { env } from '../config.js';
import { getAdminByUsername, updateLastLogin } from '../db/social-media.js';

const SECRET_KEY = env.jwtSecret || 'cobalt-social-media-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d'; // 7天过期

/**
 * 生成 JWT Token
 */
export const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            username: user.username,
            email: user.email
        },
        SECRET_KEY,
        { expiresIn: TOKEN_EXPIRY }
    );
};

/**
 * 验证 JWT Token
 */
export const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (error) {
        return null;
    }
};

/**
 * 验证密码
 */
export const verifyPassword = (password, hash) => {
    return bcrypt.compareSync(password, hash);
};

/**
 * 哈希密码
 */
export const hashPassword = (password) => {
    return bcrypt.hashSync(password, 10);
};

/**
 * 登录处理
 */
export const loginAdmin = (username, password) => {
    const admin = getAdminByUsername(username);
    
    if (!admin) {
        return {
            success: false,
            error: 'Invalid username or password'
        };
    }
    
    if (!admin.is_active) {
        return {
            success: false,
            error: 'Account is disabled'
        };
    }
    
    if (!verifyPassword(password, admin.password_hash)) {
        return {
            success: false,
            error: 'Invalid username or password'
        };
    }
    
    // 更新最后登录时间
    updateLastLogin(admin.id);
    
    // 生成 token
    const token = generateToken(admin);
    
    return {
        success: true,
        token,
        user: {
            id: admin.id,
            username: admin.username,
            email: admin.email
        }
    };
};

/**
 * 认证中间件 - 验证 JWT Token
 */
export const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'error',
            error: {
                code: 'UNAUTHORIZED',
                message: 'Missing or invalid authorization header'
            }
        });
    }
    
    const token = authHeader.substring(7); // 移除 "Bearer " 前缀
    const decoded = verifyToken(token);
    
    if (!decoded) {
        return res.status(401).json({
            status: 'error',
            error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid or expired token'
            }
        });
    }
    
    // 将用户信息附加到请求对象
    req.user = decoded;
    next();
};

/**
 * 可选认证中间件 - Token 存在则验证，不存在则跳过
 */
export const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = verifyToken(token);
        
        if (decoded) {
            req.user = decoded;
        }
    }
    
    next();
};
