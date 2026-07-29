export type GuidePage = {
    slug: string;
    landingSlug: string;
    platform: string;
    enTitle?: string;
    enDescription?: string;
    enStepsTitle?: string;
    enSteps?: string[];
    enFeaturesTitle?: string;
    enFeatures?: string[];
    enFaqs?: Array<{ q: string; a: string }>;
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
        slug: 'haokan-download-guide',
        landingSlug: 'haokan-video-download',
        platform: 'Haokan',
    },
    {
        slug: 'naver-download-guide',
        landingSlug: 'naver-video-download',
        platform: 'NAVER',
    },
    {
        slug: 'toutiao-download-guide',
        landingSlug: 'toutiao-video-download',
        platform: 'Toutiao',
    },
    {
        slug: 'weibo-download-guide',
        landingSlug: 'weibo-video-download',
        platform: 'Weibo',
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
        slug: 'youtube-download-guide',
        landingSlug: 'youtube-download',
        platform: 'YouTube',
    },
    {
        slug: 'youtube-shorts-download-guide',
        landingSlug: 'youtube-shorts-download',
        platform: 'YouTube Shorts',
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
        slug: 'reddit-download-guide',
        landingSlug: 'reddit-video-download',
        platform: 'Reddit',
    },
    {
        slug: 'snapchat-download-guide',
        landingSlug: 'snapchat-video-download',
        platform: 'Snapchat',
    },
    {
        slug: 'vimeo-download-guide',
        landingSlug: 'vimeo-video-download',
        platform: 'Vimeo',
    },
    {
        slug: 'soundcloud-download-guide',
        landingSlug: 'soundcloud-audio-download',
        platform: 'SoundCloud',
    },
    {
        slug: 'how-to-download-multiple-videos',
        landingSlug: 'batch-video-downloader',
        platform: 'Multiple Videos',
        enTitle: 'How to Download Multiple Videos at Once',
        enDescription:
            'Learn how to prepare multiple public video links, review a batch queue, retry failed items, and save completed files without repeating finished work.',
        enStepsTitle: 'Prepare and run a multi-link batch',
        enSteps: [
            'Collect only the public video URLs you own, have permission to use, or are otherwise allowed to save.',
            'Place one URL on each line so duplicate, incomplete, or unsupported links are easy to spot.',
            'Paste the list into FreeSaveVideo and review the detected count before starting.',
            'Choose the available format for each item, start the queue, and keep the device awake.',
            'Retry failed items individually. Do not restart videos that are already marked as completed.',
        ],
        enFeaturesTitle: 'A reliable multiple-video checklist',
        enFeatures: [
            'Start with a small batch when links come from several platforms.',
            'Split a job when the interface reports the current batch limit.',
            'Use a stable Wi-Fi connection for long videos and large queues.',
            'Check the selected folder first when automatic saving is enabled.',
            'Keep failed tasks in the queue until you have copied their error details or retried them.',
        ],
        enFaqs: [
            {
                q: 'Should I paste an entire block of text?',
                a: 'Use one clean public URL per line. Removing captions and unrelated text makes the batch easier to validate.',
            },
            {
                q: 'Can links from different supported platforms be combined?',
                a: 'Yes, multiple supported URLs can be detected together. A smaller same-platform batch is easier to troubleshoot if a source changes.',
            },
            {
                q: 'Why should I keep the device awake?',
                a: 'Browsers can pause network and file operations when a computer sleeps or a phone locks, which can stop later queue items.',
            },
            {
                q: 'Do I lose completed items after one failure?',
                a: 'No. Completed and failed tasks are tracked separately so you can retry the failed item without repeating the successful ones.',
            },
            {
                q: 'Where are manually saved files stored?',
                a: 'They normally appear in the browser download location. Open the browser download history if the location is unclear.',
            },
        ],
    },
    {
        slug: 'download-videos-to-folder',
        landingSlug: 'batch-video-downloader',
        platform: 'Videos to a Folder',
        enTitle: 'How to Download Multiple Videos to a Folder',
        enDescription:
            'Choose a destination folder for a video batch, understand browser compatibility, avoid duplicate filename overwrites, and find files after the queue finishes.',
        enStepsTitle: 'Save a batch into one destination folder',
        enSteps: [
            'Use a compatible desktop browser and paste the public video links you want to process.',
            'Before starting the batch, choose the folder auto-save option and approve the destination folder.',
            'Keep that browser tab and device awake while completed files are written to the selected folder.',
            'If folder access is unavailable, use manual saving and check the browser Downloads folder after each item.',
            'Review the queue when it finishes and retry any item that is not marked as downloaded.',
        ],
        enFeaturesTitle: 'Folder and filename behavior',
        enFeatures: [
            'Folder selection is requested only when the browser supports direct file-system access.',
            'Completed files are written as each task finishes rather than waiting for the entire batch.',
            'Duplicate filenames receive a number so an earlier file is not silently overwritten.',
            'Mobile browsers usually use their standard Downloads location instead of a selected folder.',
            'The selected folder applies to the current batch; confirm it again for a later session when prompted.',
        ],
        enFaqs: [
            {
                q: 'Why do I not see the choose-folder option?',
                a: 'The File System Access API is not available in every browser, especially on mobile. Use manual saving or a compatible desktop browser.',
            },
            {
                q: 'Does FreeSaveVideo upload my destination folder?',
                a: 'No. Folder access is handled locally by the browser and is used only to write the files you choose to save.',
            },
            {
                q: 'What happens when two videos have the same title?',
                a: 'The auto-save flow adds a number to the later filename instead of overwriting the existing file.',
            },
            {
                q: 'Where should I look if the chosen folder appears empty?',
                a: 'Check whether auto-save was enabled, review failed tasks, then inspect the browser download history in case the browser used its default Downloads folder.',
            },
            {
                q: 'Can I close the tab after selecting a folder?',
                a: 'Keep the tab open and the device awake until the queue finishes, otherwise pending downloads may pause or fail.',
            },
        ],
    },
];

export const guideSlugs = guidePages.map((page) => page.slug);

export const getGuidePage = (slug: string): GuidePage | undefined =>
    guidePages.find((page) => page.slug === slug);
