export type FeaturedDownloadLink = {
    slug: string;
    platform: string;
};

export const homePlatformToDownloadSlug: Record<string, string> = {
    douyin: "douyin-no-watermark",
    bilibili: "bilibili-video-download",
    kuaishou: "kuaishou-no-watermark",
    xiaohongshu: "xiaohongshu-video-download",
    instagram: "instagram-video-download",
    facebook: "facebook-video-download",
    twitter: "twitter-x-video-download",
};

export const featuredDownloadLinks: FeaturedDownloadLink[] = [
    { slug: "douyin-no-watermark", platform: "Douyin" },
    { slug: "tiktok-no-watermark", platform: "TikTok" },
    { slug: "bilibili-video-download", platform: "Bilibili" },
    { slug: "kuaishou-no-watermark", platform: "Kuaishou" },
    { slug: "xiaohongshu-video-download", platform: "Xiaohongshu" },
    { slug: "instagram-video-download", platform: "Instagram" },
    { slug: "facebook-video-download", platform: "Facebook" },
    { slug: "twitter-x-video-download", platform: "X (Twitter)" },
    { slug: "snapchat-video-download", platform: "Snapchat" },
    { slug: "pinterest-video-download", platform: "Pinterest" },
];

export const featuredGuideLinks = [
    { slug: "douyin-download-guide", platform: "Douyin" },
    { slug: "tiktok-download-guide", platform: "TikTok" },
    { slug: "bilibili-download-guide", platform: "Bilibili" },
    { slug: "kuaishou-download-guide", platform: "Kuaishou" },
    { slug: "xiaohongshu-download-guide", platform: "Xiaohongshu" },
    { slug: "instagram-download-guide", platform: "Instagram" },
    { slug: "facebook-download-guide", platform: "Facebook" },
    { slug: "x-twitter-download-guide", platform: "X (Twitter)" },
] as const;
