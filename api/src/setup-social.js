import bcrypt from 'bcrypt';
import { createAdminUser, getAdminByUsername } from './db/social-media.js';
import { initDatabase } from './db/social-media.js';

/**
 * 初始化社交媒体模块
 */
export const initSocialMedia = async () => {
    console.log('🚀 Initializing social media module...');

    // 初始化数据库表
    await initDatabase();

    // 创建默认管理员账号
    const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const defaultEmail = process.env.ADMIN_EMAIL || '';

    const existingAdmin = await getAdminByUsername(defaultUsername);

    if (!existingAdmin) {
        const passwordHash = bcrypt.hashSync(defaultPassword, 10);
        await createAdminUser(defaultUsername, passwordHash, defaultEmail);

        console.log(`✅ Default admin user created:`);
        console.log(`   Username: ${defaultUsername}`);
        console.log(`   Password: ${defaultPassword}`);
        console.log(`   ⚠️  Please change the password immediately!`);
    } else {
        console.log(`✅ Admin user already exists: ${defaultUsername}`);
    }

    console.log('✅ Social media module initialized successfully\n');
};
