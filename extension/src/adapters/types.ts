export type PlatformId =
    | 'generic'
    | 'youtube-policy'
    | 'bilibili'
    | 'douyin'
    | 'tiktok'
    | 'instagram'
    | 'facebook'
    | 'twitter'
    | 'vimeo'
    | 'reddit'
    | 'xiaohongshu'
    | 'kuaishou'
    | 'toutiao'
    | 'haokan'
    | 'soundcloud'
    | 'pinterest'
    | 'snapchat'
    | 'dailymotion'
    | 'streamable'
    | 'tumblr'
    | 'twitch'
    | 'vk'
    | 'weibo'
    | 'naver'
    | 'rutube'
    | 'ok'
    | 'loom'
    | 'bluesky'
    | 'newgrounds'
    | 'cctv'
    | 'bjnews'
    | 'ourjiangsu'
    | 'zhshjn'
    | 'kugou'
    | 'analdin';

export type MediaKind = 'video' | 'audio' | 'image' | 'playlist' | 'subtitle' | 'link';

export type MediaSource = 'adapter' | 'network' | 'dom' | 'api' | 'fallback';

export type AdapterStatus =
    | 'ok'
    | 'empty'
    | 'needsPlayback'
    | 'needsLogin'
    | 'blockedByPlatform'
    | 'unsupportedContent'
    | 'fallbackOnly'
    | 'policyBlocked';

export type DetectedMedia = {
    id: string;
    kind: MediaKind;
    url: string;
    label: string;
    source: MediaSource;
    format?: string;
    sizeLabel?: string;
    qualityLabel?: string;
    thumbnailUrl?: string;
    thumbnailRect?: ViewportRect;
    durationLabel?: string;
    filename?: string;
    score?: number;
    requiresPageContext?: boolean;
};

export type AdapterResult = {
    platform: PlatformId;
    pageUrl: string;
    pageTitle: string;
    hostname: string;
    status: AdapterStatus;
    media: DetectedMedia[];
    warnings?: string[];
};

export type AdapterContext = {
    pageUrl: string;
    pageTitle: string;
    hostname: string;
    document: Document;
    performanceEntries: PerformanceResourceTiming[];
    genericScan: () => DetectedMedia[];
    tiktokFeedItems?: TikTokFeedItemSnapshot[];
    tiktokResourceItems?: TikTokResourceSnapshot[];
    instagramDomVideos?: InstagramDomVideoSnapshot[];
    instagramResourceItems?: InstagramResourceSnapshot[];
};

export type PlatformAdapter = {
    id: PlatformId;
    label: string;
    matches(url: URL): boolean;
    scan(context: AdapterContext): Promise<AdapterResult> | AdapterResult;
};

export type TikTokFeedItemSnapshot = {
    url: string;
    title?: string;
    author?: string;
    thumbnailUrl?: string;
    thumbnailRect?: ViewportRect;
    durationLabel?: string;
    visibleArea?: number;
    currentTime?: number;
    paused?: boolean;
    seenAt: number;
};

export type TikTokResourceSnapshot = {
    url: string;
    thumbnailUrl?: string;
    seenAt: number;
};

export type InstagramResourceSnapshot = {
    url: string;
    thumbnailUrl?: string;
    seenAt: number;
};

export type InstagramDomVideoSnapshot = {
    url: string;
    thumbnailUrl?: string;
    thumbnailRect?: ViewportRect;
    durationLabel?: string;
    visibleArea?: number;
    currentTime?: number;
    paused?: boolean;
    seenAt: number;
};

export type ViewportRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
