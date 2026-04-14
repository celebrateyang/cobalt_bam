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
        platform: 'TikTok Playlist',
        downloadSlug: 'tiktok-collection-download',
        guideSlug: 'tiktok-collection-download-guide',
    },
    {
        platform: 'TikTok MP3',
        downloadSlug: 'tiktok-mp3-download',
        guideSlug: 'tiktok-mp3-download-guide',
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
    {
        platform: 'Douyin Collection',
        downloadSlug: 'douyin-collection-download',
        guideSlug: 'douyin-collection-download-guide',
    },
    {
        platform: 'Douyin MP3',
        downloadSlug: 'douyin-mp3-download',
        guideSlug: 'douyin-mp3-download-guide',
    },
];

const entryByDownloadSlug = new Map(
    crossLinkEntries.map((entry) => [entry.downloadSlug, entry]),
);

const strategicDownloadOrder = [
    'douyin-no-watermark',
    'tiktok-no-watermark',
    'bilibili-video-download',
    'xiaohongshu-video-download',
    'kuaishou-no-watermark',
    'douyin-collection-download',
    'tiktok-collection-download',
    'douyin-mp3-download',
    'tiktok-mp3-download',
    'instagram-reels-download',
    'instagram-video-download',
    'youtube-shorts-download',
    'facebook-video-download',
    'twitter-x-video-download',
    'snapchat-video-download',
    'pinterest-video-download',
    'reddit-video-download',
    'vimeo-video-download',
    'soundcloud-audio-download',
] as const;

const strategicDownloadPriority = new Map(
    strategicDownloadOrder.map((slug, index) => [slug, index]),
);

const getDownloadPriorityValue = (slug: string) =>
    strategicDownloadPriority.get(slug) ?? strategicDownloadPriority.size + 100;

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

export const getDownloadPriority = (slug: string): number => getDownloadPriorityValue(slug);

export const getGuidePriority = (slug: string): number => {
    const linkedEntry = crossLinkEntries.find((entry) => entry.guideSlug === slug);
    return linkedEntry
        ? getDownloadPriorityValue(linkedEntry.downloadSlug)
        : strategicDownloadPriority.size + 100;
};

export const topicalRelatedDownloadSlugs: Record<string, string[]> = {
    'tiktok-no-watermark': [
        'tiktok-collection-download',
        'tiktok-mp3-download',
        'douyin-no-watermark',
        'kuaishou-no-watermark',
        'xiaohongshu-video-download',
        'instagram-reels-download',
        'youtube-shorts-download',
    ],
    'tiktok-collection-download': [
        'tiktok-no-watermark',
        'tiktok-mp3-download',
        'douyin-collection-download',
        'douyin-no-watermark',
        'kuaishou-no-watermark',
        'instagram-reels-download',
        'youtube-shorts-download'
    ],
    'tiktok-mp3-download': [
        'tiktok-no-watermark',
        'tiktok-collection-download',
        'douyin-mp3-download',
        'douyin-no-watermark',
        'soundcloud-audio-download',
        'youtube-shorts-download',
    ],
    'douyin-no-watermark': [
        'douyin-collection-download',
        'douyin-mp3-download',
        'tiktok-no-watermark',
        'kuaishou-no-watermark',
        'bilibili-video-download',
        'xiaohongshu-video-download',
        'instagram-reels-download'
    ],
    'douyin-collection-download': [
        'douyin-no-watermark',
        'douyin-mp3-download',
        'tiktok-collection-download',
        'tiktok-no-watermark',
        'kuaishou-no-watermark',
        'bilibili-video-download',
        'xiaohongshu-video-download',
    ],
    'douyin-mp3-download': [
        'douyin-no-watermark',
        'douyin-collection-download',
        'tiktok-mp3-download',
        'tiktok-no-watermark',
        'soundcloud-audio-download',
        'bilibili-video-download',
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
        ...strategicDownloadOrder,
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
    [...featuredGuideLinks]
        .sort((a, b) => getGuidePriority(a.slug) - getGuidePriority(b.slug))
        .slice(0, limit);

export const getRelatedGuideLinks = (
    currentGuideSlug: string,
    limit = 4,
): FeaturedGuideLink[] =>
    [...featuredGuideLinks]
        .filter((item) => item.slug !== currentGuideSlug)
        .sort((a, b) => getGuidePriority(a.slug) - getGuidePriority(b.slug))
        .slice(0, limit);
