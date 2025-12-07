import type { RequestHandler } from './$types';

const site = 'https://freesavevideo.online'; // 您的域名
const languages = ['en', 'zh', 'th', 'ru', 'ja', 'es', 'vi', 'ko', 'fr', 'de'];

// 定义所有需要包含在 sitemap 中的页面路径
const pages = [
    '',           // 首页
    'clipboard',  // 文件传输
    'discover',   // 发现
    'youtube-tampermonkey', // Tampermonkey tutorial
    'about',      // 关于
    'donate',     // 捐赠
    'settings',   // 设置
    'remux',      // Remux
    'history',    // 历史记录
    'faq',        // FAQ
    'guide',      // 指南
];

// 关于页面的子页面
const aboutPages = [
    'about/privacy',
    'about/terms',
    'about/credits',
];

function generateSitemap(): string {
    const urls: string[] = [];
    const now = new Date().toISOString();
    
    // 为每种语言生成所有页面的 URL
    for (const lang of languages) {
        // 添加普通页面
        for (const page of pages) {
            const path = page ? `/${lang}/${page}` : `/${lang}`;
            const priority = page === '' ? '1.0' : '0.8';
            const changefreq = page === '' ? 'daily' : 'weekly';
            
            urls.push(`
    <url>
        <loc>${site}${path}</loc>
        <lastmod>${now}</lastmod>
        <changefreq>${changefreq}</changefreq>
        <priority>${priority}</priority>
    </url>`);
        }
        
        // 添加关于页面的子页面
        for (const aboutPage of aboutPages) {
            urls.push(`
    <url>
        <loc>${site}/${lang}/${aboutPage}</loc>
        <lastmod>${now}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.6</priority>
    </url>`);
        }
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`;
}

export const GET: RequestHandler = () => {
    const sitemap = generateSitemap();
    
    return new Response(sitemap, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        }
    });
};

// 关键：启用预渲染，在构建时生成静态 sitemap.xml
export const prerender = true;
