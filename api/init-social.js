import { initDatabase, createAdminUser, getAdminByUsername } from './src/db/social-media.js';
import { hashPassword } from './src/middleware/admin-auth.js';

console.log('🚀 Initializing Cobalt Social Media...\n');

// 主异步函数
async function initialize() {
    // 初始化数据库
    try {
        console.log('📦 Creating database tables...');
        await initDatabase();
        console.log('✅ Database tables created successfully\n');
    } catch (error) {
        console.error('❌ Failed to create database tables:', error);
        process.exit(1);
    }

    // 创建默认管理员账号
    const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const defaultEmail = process.env.ADMIN_EMAIL || '';

    try {
        console.log('👤 Checking for admin user...');

        const existingAdmin = await getAdminByUsername(defaultUsername);

        if (existingAdmin) {
            console.log(`ℹ️  Admin user "${defaultUsername}" already exists\n`);
        } else {
            console.log(`📝 Creating admin user "${defaultUsername}"...`);

            const passwordHash = hashPassword(defaultPassword);
            await createAdminUser(defaultUsername, passwordHash, defaultEmail);

            console.log('✅ Admin user created successfully');
            console.log(`   Username: ${defaultUsername}`);
            console.log(`   Password: ${defaultPassword}`);
            console.log(`   ⚠️  Please change the password after first login!\n`);
        }
    } catch (error) {
        console.error('❌ Failed to create admin user:', error);
        process.exit(1);
    }

    console.log('✨ Initialization complete!\n');
    console.log('📝 Next steps:');
    console.log('   1. Start the API server: pnpm start');
    console.log('   2. Start the web server: cd ../web && pnpm dev');
    console.log('   3. Visit http://localhost:5173/admin to login');
    console.log('   4. Visit http://localhost:5173/discover to see videos\n');

    process.exit(0);
}

// 运行初始化
initialize().catch(error => {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
});
