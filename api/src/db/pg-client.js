import pkg from 'pg';
const { Pool } = pkg;
import { env } from '../config.js';

let pool = null;

/**
 * 初始化 PostgreSQL 连接池
 */
export const initPool = () => {
    if (pool) {
        return pool;
    }

    const config = {
        host: env.dbHost,
        port: env.dbPort,
        user: env.dbUser,
        password: String(env.dbPassword || ''),
        database: env.dbName,
        // 连接池配置
        max: 20, // 最大连接数
        idleTimeoutMillis: 30000, // 空闲连接超时时间
        connectionTimeoutMillis: 2000, // 连接超时时间
    };

    pool = new Pool(config);

    // 监听错误事件
    pool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client', err);
    });

    console.log('✅ PostgreSQL connection pool initialized');
    return pool;
};

/**
 * 获取数据库连接池
 */
export const getPool = () => {
    if (!pool) {
        return initPool();
    }
    return pool;
};

/**
 * 执行查询
 * @param {string} text - SQL 查询语句
 * @param {Array} params - 查询参数
 */
export const query = async (text, params) => {
    const pool = getPool();
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // console.log('Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

/**
 * 获取单个客户端连接（用于事务）
 */
export const getClient = async () => {
    const pool = getPool();
    return await pool.connect();
};

/**
 * 关闭连接池
 */
export const closePool = async () => {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('✅ PostgreSQL connection pool closed');
    }
};
