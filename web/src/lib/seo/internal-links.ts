export type FeaturedDownloadLink = {
    slug: string;
    platform: string;
};

export type FeaturedGuideLink = {
    slug: string;
    platform: string;
};

type CrossLinkEntry = {
    platform: string;
    downloadSlug: string;
    guideSlug?: string;
    homeKey?: string;
};

const crossLinkEntries: CrossLinkEntry[] = [
    {
        platform: 'Douyin',
        downloadSlug: 'douyin-no-watermark',
        guideSlug: 'douyin-download-guide',
        homeKey: 'douyin',
    },
    {
        platform: 'TikTok',
        downloadSlug: 'tiktok-no-watermark',
        guideSlug: 'tiktok-download-guide',
    },
    {
        platform: 'Bilibili',
        downloadSlug: 'bilibili-video-download',
        guideSlug: 'bilibili-download-guide',
        homeKey: 'bilibili',
    },
    {
        platform: 'Kuaishou',
        downloadSlug: 'kuaishou-no-watermark',
        guideSlug: 'kuaishou-download-guide',
        homeKey: 'kuaishou',
    },
    {
        platform: 'Xiaohongshu',
        downloadSlug: 'xiaohongshu-video-download',
        guideSlug: 'xiaohongshu-download-guide',
        homeKey: 'xiaohongshu',
    },
    {
        platform: 'Instagram',
        downloadSlug: 'instagram-video-download',
        guideSlug: 'instagram-download-guide',
        homeKey: 'instagram',
    },
    {
        platform: 'Facebook',
        downloadSlug: 'facebook-video-download',
        guideSlug: 'facebook-download-guide',
        homeKey: 'facebook',
    },
    {
        platform: 'X (Twitter)',
        downloadSlug: 'twitter-x-video-download',
        guideSlug: 'x-twitter-download-guide',
        homeKey: 'twitter',
    },
    {
        platform: 'Snapchat',
        downloadSlug: 'snapchat-video-download',
        guideSlug: 'snapchat-download-guide',
    },
    {
        platform: 'Pinterest',
        downloadSlug: 'pinterest-video-download',
        guideSlug: 'pinterest-download-guide',
    },
    {
        platform: 'YouTube',
        downloadSlug: 'youtube-shorts-download',
    },
    {
        platform: 'Vimeo',
        downloadSlug: 'vimeo-video-download',
    },
    {
        platform: 'Reddit',
        downloadSlug: 'reddit-video-download',
    },
    {
        platform: 'SoundCloud',
        downloadSlug: 'soundcloud-audio-download',
    },
];

const entryByDownloadSlug = new Map(
    crossLinkEntries.map((entry) => [entry.downloadSlug, entry]),
);

export const homePlatformToDownloadSlug: Record<string, string> = Object.fromEntries(
    crossLinkEntries
        .filter((entry): entry is CrossLinkEntry & { homeKey: string } => Boolean(entry.homeKey))
        .map((entry) => [entry.homeKey, entry.downloadSlug]),
);

export const featuredDownloadLinks: FeaturedDownloadLink[] = crossLinkEntries.map((entry) => ({
    slug: entry.downloadSlug,
    platform: entry.platform,
}));

export const featuredGuideLinks: FeaturedGuideLink[] = crossLinkEntries
    .filter((entry): entry is CrossLinkEntry & { guideSlug: string } => Boolean(entry.guideSlug))
    .map((entry) => ({
        slug: entry.guideSlug,
        platform: entry.platform,
    }));

export const topicalRelatedDownloadSlugs: Record<string, string[]> = {
    'tiktok-no-watermark': [
        'douyin-no-watermark',
        'kuaishou-no-watermark',
        'xiaohongshu-video-download',
        'instagram-reels-download',
        'youtube-shorts-download',
        'snapchat-video-download',
    ],
    'douyin-no-watermark': [
        'tiktok-no-watermark',
        'kuaishou-no-watermark',
        'bilibili-video-download',
        'xiaohongshu-video-download',
        'snapchat-video-download',
        'instagram-reels-download',
    ],
    'bilibili-video-download': [
        'douyin-no-watermark',
        'kuaishou-no-watermark',
        'xiaohongshu-video-download',
        'youtube-shorts-download',
        'twitter-x-video-download',
        'vimeo-video-download',
    ],
    'kuaishou-no-watermark': [
        'douyin-no-watermark',
        'tiktok-no-watermark',
        'xiaohongshu-video-download',
        'bilibili-video-download',
        'instagram-reels-download',
        'snapchat-video-download',
    ],
    'xiaohongshu-video-download': [
        'douyin-no-watermark',
        'kuaishou-no-watermark',
        'bilibili-video-download',
        'instagram-video-download',
        'instagram-reels-download',
        'pinterest-video-download',
    ],
    'instagram-reels-download': [
        'instagram-video-download',
        'tiktok-no-watermark',
        'snapchat-video-download',
        'facebook-video-download',
        'pinterest-video-download',
        'youtube-shorts-download',
    ],
    'youtube-shorts-download': [
        'tiktok-no-watermark',
        'douyin-no-watermark',
        'instagram-reels-download',
        'facebook-video-download',
        'vimeo-video-download',
        'snapchat-video-download',
    ],
    'facebook-video-download': [
        'instagram-video-download',
        'twitter-x-video-download',
        'pinterest-video-download',
        'reddit-video-download',
        'snapchat-video-download',
        'youtube-shorts-download',
    ],
    'instagram-video-download': [
        'instagram-reels-download',
        'facebook-video-download',
        'twitter-x-video-download',
        'pinterest-video-download',
        'snapchat-video-download',
        'reddit-video-download',
    ],
    'twitter-x-video-download': [
        'facebook-video-download',
        'instagram-video-download',
        'reddit-video-download',
        'pinterest-video-download',
        'vimeo-video-download',
        'snapchat-video-download',
    ],
    'reddit-video-download': [
        'twitter-x-video-download',
        'facebook-video-download',
        'instagram-video-download',
        'pinterest-video-download',
        'vimeo-video-download',
        'snapchat-video-download',
    ],
    'pinterest-video-download': [
        'instagram-video-download',
        'facebook-video-download',
        'twitter-x-video-download',
        'reddit-video-download',
        'snapchat-video-download',
        'xiaohongshu-video-download',
    ],
    'snapchat-video-download': [
        'instagram-reels-download',
        'tiktok-no-watermark',
        'douyin-no-watermark',
        'facebook-video-download',
        'pinterest-video-download',
        'youtube-shorts-download',
    ],
    'vimeo-video-download': [
        'youtube-shorts-download',
        'facebook-video-download',
        'twitter-x-video-download',
        'reddit-video-download',
        'pinterest-video-download',
        'instagram-video-download',
    ],
    'soundcloud-audio-download': [
        'youtube-shorts-download',
        'twitter-x-video-download',
        'reddit-video-download',
        'instagram-video-download',
        'facebook-video-download',
        'vimeo-video-download',
    ],
};

const prioritizeDownloads = (
    anchorSlug: string | null,
    limit: number,
    excludeSlugs: string[] = [],
): FeaturedDownloadLink[] => {
    const excluded = new Set(excludeSlugs.filter(Boolean));
    if (anchorSlug) excluded.add(anchorSlug);

    const orderedCandidates = [
        ...(anchorSlug ? topicalRelatedDownloadSlugs[anchorSlug] ?? [] : []),
        ...featuredDownloadLinks.map((item) => item.slug),
    ];

    const links: FeaturedDownloadLink[] = [];
    const seen = new Set<string>();

    for (const slug of orderedCandidates) {
        if (seen.has(slug) || excluded.has(slug)) continue;
        seen.add(slug);

        const entry = entryByDownloadSlug.get(slug);
        if (!entry) continue;

        links.push({ slug: entry.downloadSlug, platform: entry.platform });
        if (links.length >= limit) break;
    }

    return links;
};

export const getHubDownloadLinks = (limit = 8): FeaturedDownloadLink[] =>
    prioritizeDownloads(null, limit);

export const getRelatedDownloadLinks = (
    currentDownloadSlug: string,
    limit = 4,
): FeaturedDownloadLink[] => prioritizeDownloads(currentDownloadSlug, limit);

export const getHubGuideLinks = (limit = 6): FeaturedGuideLink[] =>
    featuredGuideLinks.slice(0, limit);

export const getRelatedGuideLinks = (
    currentGuideSlug: string,
    limit = 4,
): FeaturedGuideLink[] =>
    featuredGuideLinks
        .filter((item) => item.slug !== currentGuideSlug)
        .slice(0, limit);
