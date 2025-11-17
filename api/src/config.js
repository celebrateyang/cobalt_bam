import { getVersion } from "@imput/version-info";
import { loadEnvs, validateEnvs, setupEnvWatcher } from "./core/env.js";

const version = await getVersion();

const env = loadEnvs();

const genericUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const cobaltUserAgent = `cobalt/${version} (+https://github.com/imputnet/cobalt)`;

// 扩展环境变量以包含社交媒体配置
if (!env.jwtSecret) {
    env.jwtSecret = process.env.JWT_SECRET || 'cobalt-social-media-secret-key-change-in-production';
}
if (!env.dbPath) {
    env.dbPath = process.env.DB_PATH || './db.sqlite3';
}
if (!env.adminUsername) {
    env.adminUsername = process.env.ADMIN_USERNAME || 'admin';
}
if (!env.adminPassword) {
    env.adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
}
if (!env.adminEmail) {
    env.adminEmail = process.env.ADMIN_EMAIL || '';
}

export const canonicalEnv = Object.freeze(structuredClone(process.env));
export const setTunnelPort = (port) => env.tunnelPort = port;
export const isCluster = env.instanceCount > 1;
export const updateEnv = (newEnv) => {
    // tunnelPort is special and needs to get carried over here
    newEnv.tunnelPort = env.tunnelPort;

    for (const key in env) {
        env[key] = newEnv[key];
    }
}

await validateEnvs(env);

if (env.envFile) {
    setupEnvWatcher();
}

export {
    env,
    genericUserAgent,
    cobaltUserAgent,
}
