export type SeoLandingFaqItem = {
    q: string;
    a: string;
};

export type SeoLandingLocaleContent = {
    metaTitle: string;
    metaDescription: string;
    metaKeywords: string[];
    h1: string;
    lede: string;
    stepsTitle: string;
    steps: string[];
    featuresTitle: string;
    features: string[];
    faqTitle: string;
    faqs: SeoLandingFaqItem[];
    disclaimer: string;
};

export type SeoLandingPage = {
    slug: string;
    locales: Record<string, SeoLandingLocaleContent>;
};

const EN_BRAND = 'bamboo download';
const ZH_BRAND = '竹子下载';

const en = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...page,
    disclaimer:
        'Only download publicly accessible content. Respect copyrights and give credit to creators.',
});

const zh = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...page,
    disclaimer:
        '仅支持下载公开可访问内容；请尊重版权与平台规则，二次创作请注明来源并获得授权。',
});

export const seoLandingPages: SeoLandingPage[] = [
    {
        slug: 'tiktok-no-watermark',
        locales: {
            zh: zh({
                metaTitle: `TikTok无水印下载（高清/批量）- ${ZH_BRAND}`,
                metaDescription:
                    'TikTok无水印下载工具：复制链接→粘贴→一键保存。支持高清、原声、批量解析，免安装在线使用。',
                metaKeywords: [
                    'tiktok无水印下载',
                    'tiktok去水印',
                    'tiktok视频下载',
                    'tiktok下载器',
                    'tiktok保存视频',
                    'TikTok downloader no watermark',
                ],
                h1: 'TikTok无水印下载',
                lede: '3步保存 TikTok 视频/图集：复制链接 → 粘贴 → 下载。',
                stepsTitle: '如何下载 TikTok 无水印视频',
                steps: [
                    '在 TikTok 打开视频，点击“分享”并复制链接。',
                    '把链接粘贴到下方输入框，点击下载。',
                    '选择清晰度/是否原声，保存到本地相册或文件。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '无水印/高清下载，适合剪辑与收藏。',
                    '支持视频、图集与音频（以解析结果为准）。',
                    '批量解析多个链接（适合攒素材）。',
                    '免安装，手机/电脑浏览器都能用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: 'TikTok 无水印下载安全吗？',
                        a: '无需安装 App，直接在网页完成解析与下载；建议仅保存你有权使用的公开内容。',
                    },
                    {
                        q: '下载失败/一直转圈怎么办？',
                        a: '先确认链接是否可在浏览器正常打开；再换网络或稍后重试。部分地区/账号内容可能受限制。',
                    },
                    {
                        q: '可以批量下载吗？',
                        a: '支持一次粘贴多条链接进行批量解析（数量限制以页面提示为准）。',
                    },
                    {
                        q: '会不会被封号？',
                        a: '我们不进行账号登录与自动操作；但频繁下载同一内容仍可能触发平台风控，建议合理使用。',
                    },
                ],
            }),
            en: en({
                metaTitle: `TikTok No Watermark Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download TikTok videos without watermark: copy link → paste → save. Supports HD and batch link parsing. No app needed.',
                metaKeywords: [
                    'tiktok no watermark',
                    'tiktok downloader',
                    'tiktok video download',
                    'download tiktok without watermark',
                    'tiktok hd downloader',
                ],
                h1: 'TikTok No Watermark Downloader',
                lede: 'Copy link → paste → download. Works on mobile and desktop.',
                stepsTitle: 'How to download TikTok without watermark',
                steps: [
                    'Open a TikTok video and copy the share link.',
                    'Paste the link into the box below and click download.',
                    'Pick the quality option (if available) and save the file.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'No watermark, HD options when available.',
                    'Supports batch parsing multiple links.',
                    'Works in browser — no app install.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Is it safe to use?',
                        a: 'You can download in your browser without installing extra apps. Only save content you have rights to use.',
                    },
                    {
                        q: 'Why does it fail sometimes?',
                        a: 'Some videos are region/age/account restricted or temporarily blocked. Try again later or switch networks.',
                    },
                    {
                        q: 'Can I download multiple links?',
                        a: 'Yes, you can paste multiple links for batch parsing (limits may apply).',
                    },
                ],
            }),
        },
    },
    {
        slug: 'douyin-no-watermark',
        locales: {
            zh: zh({
                metaTitle: `抖音无水印下载（高清/批量）- ${ZH_BRAND}`,
                metaDescription:
                    '抖音无水印下载：复制分享链接→粘贴→一键保存。支持高清画质、原声、批量解析，手机电脑都能用。',
                metaKeywords: [
                    '抖音无水印下载',
                    '抖音去水印',
                    '抖音视频下载',
                    '抖音链接解析',
                    '抖音保存视频',
                ],
                h1: '抖音无水印下载',
                lede: '无需安装，复制抖音链接即可在线解析下载。',
                stepsTitle: '抖音去水印保存步骤',
                steps: [
                    '在抖音打开视频，点击“分享”复制链接。',
                    '把链接粘贴到下方输入框，点击下载。',
                    '保存到本地相册/文件，并按需选择画质或音频。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '无水印/高清下载，适合二次剪辑与收藏。',
                    '支持批量解析多个抖音链接。',
                    '免安装，打开网页即可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '抖音链接怎么复制？',
                        a: '在视频页点击“分享”→“复制链接”，再粘贴到本页输入框。',
                    },
                    {
                        q: '解析失败怎么办？',
                        a: '部分内容可能触发风控或访问受限；可换网络、刷新页面或稍后重试。',
                    },
                    {
                        q: '能下载图文/合集吗？',
                        a: '是否支持取决于页面解析结果；如不支持可反馈链接便于适配。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Douyin No Watermark Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download Douyin videos without watermark: copy share link → paste → save. Supports HD options and batch parsing.',
                metaKeywords: [
                    'douyin no watermark',
                    'douyin downloader',
                    'download douyin video',
                    'remove douyin watermark',
                ],
                h1: 'Douyin No Watermark Downloader',
                lede: 'Copy share link → paste → download. No app required.',
                stepsTitle: 'How to download Douyin without watermark',
                steps: [
                    'Open a Douyin video and copy the share link.',
                    'Paste the link into the box below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'No watermark when available.',
                    'Batch parsing multiple links.',
                    'Works in browser — mobile and desktop.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why does it sometimes fail?',
                        a: 'Douyin may block automated access. Try again later or switch networks.',
                    },
                    {
                        q: 'Can I download photo posts?',
                        a: 'It depends on the content type and availability. Paste the link to see supported options.',
                    },
                ],
            }),
        },
    },
    {
        slug: 'kuaishou-no-watermark',
        locales: {
            zh: zh({
                metaTitle: `快手无水印下载（高清/批量）- ${ZH_BRAND}`,
                metaDescription:
                    '快手无水印下载：复制链接→粘贴→一键保存。支持高清画质、批量解析，免安装在线使用。',
                metaKeywords: [
                    '快手无水印下载',
                    '快手去水印',
                    '快手视频下载',
                    '快手链接解析',
                    '快手保存视频',
                ],
                h1: '快手无水印下载',
                lede: '在线解析快手链接，快速保存到手机或电脑。',
                stepsTitle: '快手去水印保存步骤',
                steps: [
                    '在快手打开视频，点击“分享”复制链接。',
                    '粘贴链接到下方输入框，点击下载。',
                    '选择清晰度（如可用）并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '无水印/高清下载（以解析结果为准）。',
                    '支持批量解析多个链接。',
                    '免安装，网页直接用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '快手无水印下载需要登录吗？',
                        a: '一般无需登录即可解析公开内容；如遇限制可尝试更换链接或稍后重试。',
                    },
                    {
                        q: '为什么会解析到水印版本？',
                        a: '不同视频/账号可能只提供带水印资源；可更换清晰度选项或反馈链接。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Kuaishou No Watermark Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Kuaishou videos without watermark (when available). Copy link → paste → save. Supports batch parsing.',
                metaKeywords: [
                    'kuaishou no watermark',
                    'kuaishou downloader',
                    'download kuaishou video',
                ],
                h1: 'Kuaishou No Watermark Downloader',
                lede: 'Paste a Kuaishou link to download in your browser.',
                stepsTitle: 'How it works',
                steps: [
                    'Copy the Kuaishou share link.',
                    'Paste it below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: ['Browser-based, no install.', 'Batch parsing supported.'],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Will it always be no watermark?',
                        a: 'Availability depends on the source content and platform response.',
                    },
                ],
            }),
        },
    },
    {
        slug: 'xiaohongshu-video-download',
        locales: {
            zh: zh({
                metaTitle: `小红书视频下载（去水印/高清）- ${ZH_BRAND}`,
                metaDescription:
                    '小红书视频下载：复制分享链接→粘贴→一键保存。支持去水印与高清画质（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    '小红书视频下载',
                    '小红书去水印',
                    '小红书保存视频',
                    '小红书链接解析',
                    'xhs视频下载',
                ],
                h1: '小红书视频下载',
                lede: '复制小红书分享链接，在线解析并保存到本地。',
                stepsTitle: '小红书视频保存步骤',
                steps: [
                    '在小红书打开笔记，点击“分享”复制链接。',
                    '粘贴链接到下方输入框，点击下载。',
                    '保存视频到本地相册/文件。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持视频链接解析与保存。',
                    '无需安装 App，网页直接用。',
                    '支持批量解析多个链接（如可用）。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '小红书链接粘贴后没有反应？',
                        a: '请确认复制的是“分享链接”，且链接可在浏览器打开；若仍失败可换网络或稍后重试。',
                    },
                    {
                        q: '能下载图文里的图片吗？',
                        a: '是否支持取决于内容类型与解析结果；粘贴链接后可查看可下载项。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Xiaohongshu Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Xiaohongshu videos: copy share link → paste → save. No app needed.',
                metaKeywords: [
                    'xiaohongshu video download',
                    'xhs video downloader',
                    'download xiaohongshu',
                ],
                h1: 'Xiaohongshu Video Downloader',
                lede: 'Paste a Xiaohongshu share link to download in your browser.',
                stepsTitle: 'How it works',
                steps: [
                    'Copy the share link from Xiaohongshu.',
                    'Paste it below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: ['Works in browser.', 'Fast and simple.'],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why does it fail?',
                        a: 'Some posts may be restricted or blocked. Try again later or switch networks.',
                    },
                ],
            }),
        },
    },
    {
        slug: 'instagram-reels-download',
        locales: {
            zh: zh({
                metaTitle: `Instagram Reels下载（无水印/高清）- ${ZH_BRAND}`,
                metaDescription:
                    'Instagram Reels下载：复制链接→粘贴→一键保存。支持无水印与高清画质（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'instagram reels下载',
                    'ins reels下载',
                    'instagram无水印下载',
                    'ins去水印',
                    'instagram视频下载',
                ],
                h1: 'Instagram Reels下载',
                lede: '一键保存 Reels：复制链接 → 粘贴 → 下载。',
                stepsTitle: '如何下载 Instagram Reels',
                steps: [
                    '在 Instagram 打开 Reels，复制分享链接。',
                    '粘贴到下方输入框，点击下载。',
                    '保存到本地（可选清晰度/音频）。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 Reels/视频/图片链接解析（以结果为准）。',
                    '支持批量解析多个链接。',
                    '免安装，浏览器即可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '私密账号/好友可见能下载吗？',
                        a: '仅支持公开可访问内容；私密内容无法解析下载。',
                    },
                    {
                        q: '为什么清晰度选项很少？',
                        a: '不同视频提供的资源不同；如只有单一清晰度属正常情况。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Instagram Reels Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download Instagram Reels: copy link → paste → save. Works in browser with HD options when available.',
                metaKeywords: [
                    'instagram reels download',
                    'instagram reels downloader',
                    'download reels',
                ],
                h1: 'Instagram Reels Downloader',
                lede: 'Copy link → paste → download. No app required.',
                stepsTitle: 'How to download Reels',
                steps: [
                    'Copy the Instagram Reels link.',
                    'Paste it below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Supports reels/videos/photos (when available).',
                    'Batch parsing supported.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download private content?',
                        a: 'No. Only publicly accessible content can be downloaded.',
                    },
                ],
            }),
        },
    },
    {
        slug: 'youtube-shorts-download',
        locales: {
            zh: zh({
                metaTitle: `YouTube Shorts下载（高清/音频）- ${ZH_BRAND}`,
                metaDescription:
                    'YouTube Shorts下载：复制链接→粘贴→一键保存。支持高清与音频提取（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'youtube shorts下载',
                    'shorts视频下载',
                    'youtube短视频下载',
                    'youtube下载',
                    'youtube音频提取',
                ],
                h1: 'YouTube Shorts下载',
                lede: '保存 Shorts 到本地：复制链接 → 粘贴 → 下载。',
                stepsTitle: '如何下载 YouTube Shorts',
                steps: [
                    '在 YouTube 打开 Shorts，复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择清晰度或仅音频（如可用）并保存。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 Shorts/视频链接解析（以结果为准）。',
                    '支持仅音频下载（如有资源）。',
                    '免安装，浏览器即可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '为什么有些 Shorts 无法下载？',
                        a: '可能是地区限制、版权限制或平台策略变更导致；可尝试更换链接或稍后重试。',
                    },
                    {
                        q: '能下载 4K/高帧率吗？',
                        a: '清晰度取决于原视频提供的资源与解析结果；如可用会在选项中展示。',
                    },
                ],
            }),
            en: en({
                metaTitle: `YouTube Shorts Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download YouTube Shorts: copy link → paste → save. Supports HD options and audio-only when available.',
                metaKeywords: [
                    'youtube shorts downloader',
                    'download youtube shorts',
                    'shorts video download',
                    'youtube audio download',
                ],
                h1: 'YouTube Shorts Downloader',
                lede: 'Paste a Shorts link and download in your browser.',
                stepsTitle: 'How it works',
                steps: [
                    'Copy the YouTube Shorts link.',
                    'Paste it below and click download.',
                    'Pick a quality option (if available) and save.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'HD options when available.',
                    'Audio-only option when available.',
                    'No install, works in browser.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why does it fail sometimes?',
                        a: 'Some Shorts are restricted or the platform changes delivery. Try again later.',
                    },
                ],
            }),
        },
    },
];

export const seoLandingSlugs = seoLandingPages.map((page) => page.slug);

export const getSeoLandingPage = (slug: string): SeoLandingPage | undefined =>
    seoLandingPages.find((page) => page.slug === slug);

export const getSeoLandingLocale = (
    page: SeoLandingPage,
    lang: string,
): SeoLandingLocaleContent => page.locales[lang] ?? page.locales.en;

