export type GuidePage = {
    slug: string;
    landingSlug: string;
    platform: string;
};

export const guidePages: GuidePage[] = [
    {
        slug: 'tiktok-download-guide',
        landingSlug: 'tiktok-no-watermark',
        platform: 'TikTok',
    },
    {
        slug: 'tiktok-collection-download-guide',
        landingSlug: 'tiktok-collection-download',
        platform: 'TikTok Playlist',
    },
    {
        slug: 'tiktok-mp3-download-guide',
        landingSlug: 'tiktok-mp3-download',
        platform: 'TikTok MP3',
    },
    {
        slug: 'douyin-download-guide',
        landingSlug: 'douyin-no-watermark',
        platform: 'Douyin',
    },
    {
        slug: 'douyin-collection-download-guide',
        landingSlug: 'douyin-collection-download',
        platform: 'Douyin Collection',
    },
    {
        slug: 'douyin-mp3-download-guide',
        landingSlug: 'douyin-mp3-download',
        platform: 'Douyin MP3',
    },
    {
        slug: 'kuaishou-download-guide',
        landingSlug: 'kuaishou-no-watermark',
        platform: 'Kuaishou',
    },
    {
        slug: 'xiaohongshu-download-guide',
        landingSlug: 'xiaohongshu-video-download',
        platform: 'Xiaohongshu',
    },
    {
        slug: 'bilibili-download-guide',
        landingSlug: 'bilibili-video-download',
        platform: 'Bilibili',
    },
    {
        slug: 'instagram-download-guide',
        landingSlug: 'instagram-video-download',
        platform: 'Instagram',
    },
    {
        slug: 'facebook-download-guide',
        landingSlug: 'facebook-video-download',
        platform: 'Facebook',
    },
    {
        slug: 'x-twitter-download-guide',
        landingSlug: 'twitter-x-video-download',
        platform: 'X (Twitter)',
    },
    {
        slug: 'pinterest-download-guide',
        landingSlug: 'pinterest-video-download',
        platform: 'Pinterest',
    },
    {
        slug: 'snapchat-download-guide',
        landingSlug: 'snapchat-video-download',
        platform: 'Snapchat',
    },
];

export const guideSlugs = guidePages.map((page) => page.slug);

export const getGuidePage = (slug: string): GuidePage | undefined =>
    guidePages.find((page) => page.slug === slug);
