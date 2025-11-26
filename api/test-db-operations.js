import { initDatabase, createAccount, createVideo, getAccounts, getVideos, getStats } from './src/db/social-media.js';
import { closePool } from './src/db/pg-client.js';

console.log('🧪 Testing PostgreSQL database operations...\n');

async function runTests() {
    try {
        // 1. 初始化数据库
        console.log('1️⃣  Testing database initialization...');
        await initDatabase();
        console.log('✅ Database tables created\n');

        // 2. 创建测试账号
        console.log('2️⃣  Testing account creation...');
        const account = await createAccount({
            platform: 'bilibili',
            username: 'test_user',
            display_name: '测试用户',
            avatar_url: 'https://example.com/avatar.jpg',
            profile_url: 'https://space.bilibili.com/12345',
            description: '这是一个测试账号',
            follower_count: 10000,
            category: 'tech',
            tags: ['技术', '编程'],
            priority: 5
        });
        console.log('✅ Account created:', account.id, '-', account.display_name, '\n');

        // 3. 获取账号列表
        console.log('3️⃣  Testing account listing...');
        const accountsResult = await getAccounts({ limit: 10 });
        console.log(`✅ Found ${accountsResult.accounts.length} accounts`);
        console.log(`   Total: ${accountsResult.pagination.total}\n`);

        // 4. 创建测试视频
        console.log('4️⃣  Testing video creation...');
        const video = await createVideo({
            account_id: account.id,
            platform: 'bilibili',
            video_id: 'BV1234567890',
            title: '测试视频标题',
            description: '这是一个测试视频描述',
            video_url: 'https://www.bilibili.com/video/BV1234567890',
            thumbnail_url: 'https://example.com/thumb.jpg',
            duration: 600,
            view_count: 5000,
            like_count: 200,
            tags: ['测试', '演示'],
            is_featured: true,
            display_order: 10
        });
        console.log('✅ Video created:', video.id, '-', video.title, '\n');

        // 5. 获取视频列表
        console.log('5️⃣  Testing video listing...');
        const videosResult = await getVideos({ limit: 10 });
        console.log(`✅ Found ${videosResult.videos.length} videos`);
        console.log(`   Total: ${videosResult.pagination.total}\n`);

        // 6. 测试搜索功能
        console.log('6️⃣  Testing search...');
        const searchResult = await getAccounts({ search: '测试' });
        console.log(`✅ Search found ${searchResult.accounts.length} accounts\n`);

        // 7. 获取统计信息
        console.log('7️⃣  Testing statistics...');
        const stats = await getStats();
        console.log('✅ Statistics:');
        console.log(`   Total accounts: ${stats.total_accounts}`);
        console.log(`   Total videos: ${stats.total_videos}`);
        console.log(`   By platform:`, stats.by_platform);
        console.log(`   By category:`, stats.by_category, '\n');

        console.log('🎉 All tests passed!\n');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    } finally {
        await closePool();
        process.exit(0);
    }
}

runTests();
