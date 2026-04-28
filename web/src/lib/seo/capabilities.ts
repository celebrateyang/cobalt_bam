export type CapabilityService = {
    id: string;
    name: string;
    category: 'video' | 'audio' | 'media' | 'social';
    publicOnly: boolean;
    audioMode: boolean;
    noWatermark: boolean;
    batchFriendly: boolean;
    collectionFriendly: boolean;
    landingSlug?: string;
    guideSlug?: string;
    notes: string[];
};

export type ToolCapability = {
    id: string;
    name: string;
    path: string;
    category: string;
    localProcessing: boolean;
    description: string;
    features: string[];
};

export const siteCapabilities = {
    name: 'FreeSaveVideo',
    canonicalUrl: 'https://freesavevideo.online/',
    summary:
        'FreeSaveVideo is a browser-based media downloader and media toolkit for public online videos, local media conversion, whiteboard recording, file transfer, discovery, and random 1v1 video chat.',
    policy: [
        'Only publicly accessible online content is supported.',
        'Users should respect copyright, creator rights, and platform rules.',
        'Local media tools process files in the browser when possible and do not need server upload.',
    ],
    coreFeatures: [
        'online video download',
        'batch download',
        'collection and playlist parsing',
        'audio-only download when available',
        'mute mode when available',
        'MP4 to MP3 and audio extraction',
        'video format conversion',
        'whiteboard and teleprompter recording',
        'cross-device file and text transfer',
        'Discover video feed',
        'random 1v1 video chat',
    ],
} as const;

export const capabilityServices: CapabilityService[] = [
    {
        id: 'youtube',
        name: 'YouTube',
        category: 'video',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: true,
        landingSlug: 'youtube-shorts-download',
        notes: ['Supports watch, embed, Shorts-style links, video and audio options when available.'],
    },
    {
        id: 'tiktok',
        name: 'TikTok',
        category: 'video',
        publicOnly: true,
        audioMode: true,
        noWatermark: true,
        batchFriendly: true,
        collectionFriendly: true,
        landingSlug: 'tiktok-no-watermark',
        guideSlug: 'tiktok-download-guide',
        notes: ['Supports video, photo, short links, audio extraction, and playlist-oriented pages.'],
    },
    {
        id: 'douyin',
        name: 'Douyin',
        category: 'video',
        publicOnly: true,
        audioMode: true,
        noWatermark: true,
        batchFriendly: true,
        collectionFriendly: true,
        landingSlug: 'douyin-no-watermark',
        guideSlug: 'douyin-download-guide',
        notes: ['Supports video, note, slides, share links, collections, and MP3-oriented workflows.'],
    },
    {
        id: 'bilibili',
        name: 'Bilibili',
        category: 'video',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: true,
        landingSlug: 'bilibili-video-download',
        guideSlug: 'bilibili-download-guide',
        notes: ['Supports video pages, multi-part videos, bangumi pages, and collection-style workflows.'],
    },
    {
        id: 'kuaishou',
        name: 'Kuaishou',
        category: 'video',
        publicOnly: true,
        audioMode: true,
        noWatermark: true,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'kuaishou-no-watermark',
        guideSlug: 'kuaishou-download-guide',
        notes: ['Supports short-video, video, and share links.'],
    },
    {
        id: 'xiaohongshu',
        name: 'Xiaohongshu',
        category: 'media',
        publicOnly: true,
        audioMode: true,
        noWatermark: true,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'xiaohongshu-video-download',
        guideSlug: 'xiaohongshu-download-guide',
        notes: ['Supports public explore, discovery item, and share links.'],
    },
    {
        id: 'instagram',
        name: 'Instagram',
        category: 'social',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'instagram-video-download',
        guideSlug: 'instagram-download-guide',
        notes: ['Supports posts, Reels, stories, share links, and ddinstagram.com links.'],
    },
    {
        id: 'facebook',
        name: 'Facebook',
        category: 'social',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'facebook-video-download',
        guideSlug: 'facebook-download-guide',
        notes: ['Supports reels, videos, share links, fb.watch, mobile and web links.'],
    },
    {
        id: 'twitter',
        name: 'X / Twitter',
        category: 'social',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'twitter-x-video-download',
        guideSlug: 'x-twitter-download-guide',
        notes: ['Supports status links, media links, x.com, vxtwitter.com, and fixvx.com links.'],
    },
    {
        id: 'vimeo',
        name: 'Vimeo',
        category: 'video',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'vimeo-video-download',
        notes: ['Supports video pages, player links, channels, groups, and password URL forms when available.'],
    },
    {
        id: 'soundcloud',
        name: 'SoundCloud',
        category: 'audio',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'soundcloud-audio-download',
        notes: ['Supports public track and short links when downloadable audio is available.'],
    },
    {
        id: 'snapchat',
        name: 'Snapchat',
        category: 'social',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'snapchat-video-download',
        guideSlug: 'snapchat-download-guide',
        notes: ['Supports Spotlight, story, username, and short links.'],
    },
    {
        id: 'pinterest',
        name: 'Pinterest',
        category: 'media',
        publicOnly: true,
        audioMode: false,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'pinterest-video-download',
        guideSlug: 'pinterest-download-guide',
        notes: ['Supports Pin links, URL shortener links, videos, images, and GIFs when available.'],
    },
    {
        id: 'reddit',
        name: 'Reddit',
        category: 'social',
        publicOnly: true,
        audioMode: true,
        noWatermark: false,
        batchFriendly: true,
        collectionFriendly: false,
        landingSlug: 'reddit-video-download',
        notes: ['Supports post, comment, share, user, subreddit, and reddit video links.'],
    },
];

export const additionalSupportedServices = [
    'Bluesky',
    'CCTV',
    'Dailymotion',
    'Loom',
    'Newgrounds',
    'OK.ru',
    'Rutube',
    'Streamable',
    'Tumblr',
    'Twitch Clips',
    'VK',
] as const;

export const toolCapabilities: ToolCapability[] = [
    {
        id: 'remux',
        name: 'Video converter and audio extractor',
        path: '/remux',
        category: 'Local media processing',
        localProcessing: true,
        description:
            'Extract audio from local video files and convert video formats such as AVI to MP4 directly in the browser.',
        features: ['MP4 to MP3', 'M4A and WAV export', 'AVI to MP4', 'MP4/WebM output', 'batch local processing'],
    },
    {
        id: 'videorecord',
        name: 'Whiteboard and teleprompter recorder',
        path: '/videorecord',
        category: 'Browser recording',
        localProcessing: true,
        description:
            'Create slides, use a whiteboard and teleprompter, add camera/microphone, and export recordings from the browser.',
        features: ['whiteboard recording', 'teleprompter', 'camera overlay', 'MP4/WebM export', 'microphone audio'],
    },
    {
        id: 'clipboard',
        name: 'Cross-device file and text transfer',
        path: '/clipboard',
        category: 'File transfer',
        localProcessing: true,
        description:
            'Transfer files and text between devices using browser sessions, QR/code joining, and WebRTC data channels.',
        features: ['file transfer', 'text sharing', 'QR join', 'personal session', 'random session'],
    },
    {
        id: 'discover',
        name: 'Discover',
        path: '/discover',
        category: 'Content discovery',
        localProcessing: false,
        description:
            'Browse curated and synced public videos from enabled social accounts and trending-style sections.',
        features: ['featured videos', 'creator accounts', 'public video feed'],
    },
    {
        id: 'random-chat',
        name: 'Random 1v1 video chat',
        path: '/random-chat',
        category: 'Social video',
        localProcessing: false,
        description:
            'Match with one online user for a time-limited browser video chat session.',
        features: ['1v1 matching', '10-minute sessions', 'country and language preferences', 'WebRTC media'],
    },
];

export const capabilityPayload = {
    generatedFrom: [
        'api/src/processing/service-config.js',
        'web/src/lib/seo/landing-pages.ts',
        'web/src/routes/[lang]/remux/+page.svelte',
        'web/src/routes/[lang]/videorecord/+page.svelte',
        'web/src/routes/[lang]/clipboard/+page.svelte',
        'web/src/routes/[lang]/random-chat/+page.svelte',
    ],
    site: siteCapabilities,
    services: capabilityServices,
    additionalSupportedServices,
    tools: toolCapabilities,
};
