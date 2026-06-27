export type LearnFaq = {
    q: string;
    a: string;
};

export type LearnTable = {
    headers: string[];
    rows: string[][];
};

export type LearnPage = {
    slug: string;
    title: string;
    description: string;
    updatedAt: string;
    readingTime: string;
    category: string;
    summary: string;
    keyTakeaways: string[];
    sections: Array<{
        heading: string;
        body: string[];
        bullets?: string[];
    }>;
    table?: LearnTable;
    faqs: LearnFaq[];
    relatedDownloads: string[];
    relatedGuides: string[];
    keywords: string[];
};

export const learnPages: LearnPage[] = [
    {
        slug: 'save-online-videos-offline-study',
        title: 'How to save online videos for offline study',
        description:
            'A practical workflow for saving public online videos for study, with browser queues, batch links, file location notes, and copyright boundaries.',
        updatedAt: '2026-06-27',
        readingTime: '6 min read',
        category: 'Offline study',
        summary:
            'For offline study, use specific public video URLs, save only material you are allowed to keep, and prefer a browser workflow that supports queue retries and clear local file saving.',
        keyTakeaways: [
            'FreeSaveVideo works best with specific public video, post, playlist, or collection URLs instead of profile pages or search pages.',
            'Queue mode is useful for long videos, batch tasks, and unstable networks because tasks can retry or continue after interruption.',
            'Direct downloads go to the browser download folder; queue downloads finish first, then need a Save action or auto-save directory permission.',
        ],
        sections: [
            {
                heading: 'Start with the right link',
                body: [
                    'Most download failures begin with the wrong URL. A video detail page, short share link, Shorts URL, playlist URL, or supported collection URL is a better input than a channel homepage, search result, profile page, or comment page.',
                    'This matches the FreeSaveVideo parser design: platform services such as YouTube, TikTok, Douyin, Bilibili, Weibo, and Haokan each look for concrete media identifiers or public media metadata before they can return downloadable results.',
                ],
                bullets: [
                    'Good: a public video page, post URL, share URL, playlist, or collection.',
                    'Weak: profile pages, search pages, app install pages, private posts, deleted media, or paywalled pages.',
                    'For batches, paste multiple supported links or use a supported playlist or collection page.',
                ],
            },
            {
                heading: 'Use queue mode when reliability matters',
                body: [
                    'FreeSaveVideo has a task queue for downloads that take longer than a direct browser save. Recent project work added queue continuation, auto-save support, visible save paths, and friendlier explanations about where files go after completion.',
                    'That makes queue mode a better fit for study collections, lectures, multi-part videos, and unstable mobile networks.',
                ],
                bullets: [
                    'Keep the browser tab open until the queue task finishes.',
                    'If the browser supports the File System Access API, choose an auto-save directory for repeated batch work.',
                    'If auto-save is unavailable, click Save after the queue item completes.',
                ],
            },
            {
                heading: 'Respect content boundaries',
                body: [
                    'FreeSaveVideo is built around public links. It is not intended for private videos, membership-only media, DRM-protected content, or copyright infringement.',
                    'For offline study, the safest use cases are personal review, class notes, language practice, research clipping, and material you have permission to save.',
                ],
            },
        ],
        table: {
            headers: ['Study case', 'Best FreeSaveVideo workflow', 'Why'],
            rows: [
                ['One public lecture', 'Paste the video URL and save the result', 'Direct and simple when the source exposes one file'],
                ['Course playlist', 'Use playlist or batch mode when supported', 'Lets you review several items before saving'],
                ['Long mobile download', 'Use queue mode', 'Retries and continuation are more reliable than a single direct save'],
                ['Repeated study archive', 'Use auto-save directory when available', 'Keeps files organized and reduces manual save clicks'],
            ],
        },
        faqs: [
            {
                q: 'Where are offline study videos saved?',
                a: 'Direct downloads use the browser download folder. Queue downloads finish inside FreeSaveVideo first and then require Save, unless an auto-save directory has been granted in a compatible browser.',
            },
            {
                q: 'Can FreeSaveVideo save private course videos?',
                a: 'No. The public downloader is designed for publicly accessible links and should not be used for private, paywalled, or DRM-protected course material.',
            },
            {
                q: 'Why should I use a specific video URL?',
                a: 'Specific public media URLs expose the identifiers and metadata parsers need. Homepages, profiles, and search pages usually do not point to one downloadable media item.',
            },
        ],
        relatedDownloads: ['youtube-download', 'bilibili-video-download', 'vimeo-video-download'],
        relatedGuides: ['youtube-download-guide', 'bilibili-download-guide', 'vimeo-download-guide'],
        keywords: ['offline study video download', 'save public videos for study', 'batch video download'],
    },
    {
        slug: 'convert-video-to-audio-language-learning',
        title: 'How to convert video to audio for language learning',
        description:
            'How to turn public videos or local files into audio for listening practice using FreeSaveVideo audio mode and browser-side conversion tools.',
        updatedAt: '2026-06-27',
        readingTime: '5 min read',
        category: 'Audio learning',
        summary:
            'For language learning, use audio-only mode when a public platform exposes audio, or use the local remux tool for files already on your device.',
        keyTakeaways: [
            'Audio-only download depends on what the source platform exposes for that public link.',
            'The remux tool can extract audio from local video files in the browser, so private local files do not need an API upload when browser processing is available.',
            'Higher bitrates do not improve weak source audio; choose a practical format such as M4A or MP3 for device compatibility.',
        ],
        sections: [
            {
                heading: 'Choose between online audio mode and local conversion',
                body: [
                    'FreeSaveVideo has two different paths for audio learning. For public online links, supported platform parsers can return audio-only results when the source exposes them. For files already on your device, the remux page extracts audio locally in the browser when possible.',
                    'This distinction matters for privacy: local classroom clips, screen recordings, or downloaded study files can be processed without sending the source file to the API server when the browser tool supports the format.',
                ],
                bullets: [
                    'Use online audio mode for public YouTube, TikTok, Douyin, SoundCloud, and other supported links.',
                    'Use the remux tool for local MP4/WebM/AVI-style files already on your device.',
                    'Use queue mode for long public videos or unstable network conditions.',
                ],
            },
            {
                heading: 'Pick a format that matches the device',
                body: [
                    'M4A is usually a good balance for modern phones. MP3 is still useful for older players, classroom devices, and simple flashcard workflows. WAV is large and usually unnecessary for everyday listening practice.',
                    'FreeSaveVideo cannot improve the source recording. If the original video has noisy or low-bitrate speech, choosing a very high output bitrate mostly increases file size.',
                ],
            },
            {
                heading: 'Build a repeatable listening workflow',
                body: [
                    'For repeated practice, keep filenames readable, save files into a dedicated folder, and split playlists into manageable batches. Recent queue and auto-save work in the project is especially useful here because repeated Save clicks are easy to miss during batch processing.',
                ],
            },
        ],
        table: {
            headers: ['Goal', 'Recommended path', 'Notes'],
            rows: [
                ['Podcast-style listening', 'Audio-only online result', 'Best when the platform exposes a usable audio stream'],
                ['Private class recording', 'Local remux/audio extraction', 'Keeps local files in the browser workflow when supported'],
                ['Old MP3 player', 'MP3 output', 'Broad compatibility, larger than some modern codecs'],
                ['Phone listening', 'M4A output', 'Good compatibility and size balance'],
            ],
        },
        faqs: [
            {
                q: 'Can FreeSaveVideo always extract audio from a public video link?',
                a: 'No. Audio options depend on the platform metadata and the source media variants available for that public link.',
            },
            {
                q: 'Does local audio extraction upload my private file?',
                a: 'The remux and audio extraction tools prioritize browser-side processing when possible, so local files do not need an API upload for supported workflows.',
            },
            {
                q: 'Is MP3 always better for language learning?',
                a: 'Not always. MP3 is widely compatible, while M4A is often smaller at similar listening quality on modern devices.',
            },
        ],
        relatedDownloads: ['youtube-download', 'tiktok-mp3-download', 'soundcloud-audio-download'],
        relatedGuides: ['youtube-download-guide', 'tiktok-mp3-download-guide', 'soundcloud-download-guide'],
        keywords: ['convert video to audio', 'language learning audio', 'mp4 to mp3 browser'],
    },
    {
        slug: 'download-subtitles-learning-materials',
        title: 'How to download subtitles or learning materials from videos',
        description:
            'What to check before trying to save subtitles, captions, transcripts, or companion learning material from public video pages.',
        updatedAt: '2026-06-27',
        readingTime: '5 min read',
        category: 'Learning materials',
        summary:
            'Subtitles and companion materials are only available when the source page exposes them. Treat captions as metadata, not as something every downloader can always reconstruct.',
        keyTakeaways: [
            'A public video may expose video streams but not captions, transcripts, or attachments.',
            'When subtitles matter, check the source page first and save any official transcript or caption file if the platform provides one.',
            'FreeSaveVideo focuses on media parsing and local tools; available sidecar materials depend on each platform result.',
        ],
        sections: [
            {
                heading: 'Understand what a downloader can see',
                body: [
                    'Video pages can expose several different things: media streams, thumbnails, titles, audio tracks, caption tracks, and sometimes transcript or attachment links. These are not guaranteed to appear together.',
                    'FreeSaveVideo parsers return what the supported platform exposes for a public link. If a source hides captions behind an account, region rule, app-only endpoint, or DRM layer, a public downloader should not promise access.',
                ],
            },
            {
                heading: 'Use the source page as the source of truth',
                body: [
                    'Before building a study workflow around subtitles, open the original public page and confirm captions or transcripts exist. For long lectures, official transcripts are often more reliable than generated captions.',
                    'If the page has multi-language audio or captions, choose the language before saving any associated material. Some platforms expose only the selected locale.',
                ],
            },
            {
                heading: 'Combine media saving with local study tools',
                body: [
                    'When captions are not available as a separate file, students often combine saved audio with their own notes, speech recognition, or manual transcript tools. Keep those derived materials separate from the original media file so they are easy to revise.',
                ],
            },
        ],
        table: {
            headers: ['Material type', 'Availability signal', 'Best action'],
            rows: [
                ['Captions', 'CC button or caption menu on the source page', 'Use the official caption option when exposed'],
                ['Transcript', 'Transcript panel or text export on the source page', 'Save the transcript separately from the video'],
                ['Audio track', 'Audio options returned by the parser', 'Use audio-only mode or local extraction'],
                ['Slides or attachments', 'Links in the original post or description', 'Open and save from the source when permitted'],
            ],
        },
        faqs: [
            {
                q: 'Can FreeSaveVideo create subtitles if the source has none?',
                a: 'No. Subtitle generation is a separate speech-to-text task. FreeSaveVideo can only work with media or metadata exposed by supported public sources.',
            },
            {
                q: 'Why do some videos have audio but no subtitles?',
                a: 'Captions are separate metadata. A source can expose media streams without exposing caption tracks to public visitors.',
            },
            {
                q: 'What is the safest study workflow?',
                a: 'Use official captions or transcripts when the source provides them, and keep your own notes or generated transcripts clearly separate.',
            },
        ],
        relatedDownloads: ['youtube-download', 'bilibili-video-download', 'vimeo-video-download'],
        relatedGuides: ['youtube-download-guide', 'bilibili-download-guide', 'vimeo-download-guide'],
        keywords: ['download subtitles', 'video learning materials', 'save transcripts from video'],
    },
    {
        slug: 'video-download-errors-explained',
        title: 'Why online video downloads fail and how to fix them',
        description:
            'A concrete troubleshooting guide based on FreeSaveVideo parser behavior, queue mode, public-link limits, and source-platform restrictions.',
        updatedAt: '2026-06-27',
        readingTime: '7 min read',
        category: 'Troubleshooting',
        summary:
            'Most failures come from wrong link types, private or expired content, source-side rate limits, missing media variants, browser save permissions, or temporary parser changes on the platform.',
        keyTakeaways: [
            'First verify that the URL is a specific public media page, not a profile, search, feed, or app page.',
            'Retry with queue mode for long videos, HLS streams, batch tasks, and unstable source servers.',
            'If a platform has changed its page format or anti-bot behavior, a parser update may be required.',
        ],
        sections: [
            {
                heading: 'Check the link type first',
                body: [
                    'FreeSaveVideo routes URLs through platform matchers and service parsers. Those parsers need concrete media identifiers, source metadata, or supported embed data. A profile page or search result usually does not contain one clear downloadable target.',
                    'The project has platform-specific guidance for Douyin search and profile links, Weibo video address links, Haokan public video pages, and Bilibili multi-part content because each platform exposes media differently.',
                ],
            },
            {
                heading: 'Understand source-side failures',
                body: [
                    'A public link can still fail when the source platform expires a token, blocks a region, changes its page structure, hides media behind login, or serves incomplete metadata. Recent project work added generic HTML probing, yt-dlp fallback paths, TikTok-specific handling, and upstream failover tracing to reduce these failures.',
                    'When a failure is temporary, retrying later or switching networks can help. When a platform changes its page format, code needs to be updated.',
                ],
            },
            {
                heading: 'Separate parsing problems from saving problems',
                body: [
                    'Parsing means FreeSaveVideo found a usable media result. Saving means the browser or queue successfully wrote the file. If a queue item completes but you cannot find the file, check whether it still needs a Save click or whether auto-save directory permission was granted.',
                ],
            },
        ],
        table: {
            headers: ['Symptom', 'Likely cause', 'Fix'],
            rows: [
                ['No result', 'Wrong link type or private/deleted media', 'Copy a specific public video or post URL'],
                ['Only low quality', 'Source exposes limited variants', 'Change quality settings and parse again'],
                ['Long task stalls', 'Large media, HLS, or unstable source', 'Use queue mode and keep the tab open'],
                ['File not found after queue', 'Save step not completed', 'Click Save or enable auto-save directory'],
                ['Platform suddenly fails', 'Source page or anti-bot change', 'Retry later and report the failing public URL'],
            ],
        },
        faqs: [
            {
                q: 'Why does a link work in the app but not in a browser downloader?',
                a: 'Apps can use authenticated or private APIs. A public browser downloader should only use publicly accessible media and metadata.',
            },
            {
                q: 'Why does queue mode help?',
                a: 'Queue mode gives long or multi-step downloads more room for retries, continuation, and explicit saving than a single direct browser download.',
            },
            {
                q: 'What should I include in a bug report?',
                a: 'Include the public URL, platform name, whether direct or queue mode was used, the selected output settings, and the visible error message.',
            },
        ],
        relatedDownloads: ['tiktok-no-watermark', 'douyin-no-watermark', 'youtube-download'],
        relatedGuides: ['tiktok-download-guide', 'douyin-download-guide', 'youtube-download-guide'],
        keywords: ['video download failed', 'online downloader error', 'why video download fails'],
    },
    {
        slug: 'best-link-types-for-video-downloaders',
        title: 'Best link types for online video downloaders',
        description:
            'Which URLs work best in FreeSaveVideo and why public video pages, post URLs, playlists, and collection links parse more reliably than profiles or search pages.',
        updatedAt: '2026-06-27',
        readingTime: '5 min read',
        category: 'Link preparation',
        summary:
            'The best downloader input is a specific public media URL. Playlists and collections can work when the platform parser supports them; profiles and search pages are usually weak inputs.',
        keyTakeaways: [
            'Use a public video page, post page, short share link, playlist, or collection URL.',
            'Avoid profile pages, channel homepages, app install pages, search pages, comment pages, and private content.',
            'For collections, confirm the platform is supported for batch or playlist parsing before expecting multiple results.',
        ],
        sections: [
            {
                heading: 'Why URL shape matters',
                body: [
                    'FreeSaveVideo uses platform matchers and service-specific parsers. A URL with a video ID, post ID, playlist ID, or collection marker can be routed to the right parser. A broad page often cannot.',
                    'This is why the codebase keeps service patterns and service aliases separate from parsing logic: matching the right service is the first step, and extracting usable media metadata is the second step.',
                ],
            },
            {
                heading: 'What works well',
                body: [
                    'Specific public video pages work best because they map to one media item. Short share links can work when they redirect to a public media page. Playlist and collection URLs can work when FreeSaveVideo has a parser for that platform flow.',
                ],
                bullets: [
                    'YouTube watch URLs and Shorts-style URLs.',
                    'TikTok, Douyin, Kuaishou, Instagram, Facebook, X/Twitter, Reddit, Pinterest, and Vimeo public post URLs.',
                    'Bilibili video, bangumi, and multi-part pages when public.',
                    'Weibo public video pages or copied video address links, including supported short links.',
                ],
            },
            {
                heading: 'What usually fails',
                body: [
                    'Profile pages, search pages, feeds, private posts, deleted media, and app installer pages either point to too many items or do not expose public media metadata. They may be useful for discovery, but they are poor download inputs.',
                ],
            },
        ],
        table: {
            headers: ['URL type', 'Reliability', 'Reason'],
            rows: [
                ['Specific public video URL', 'High', 'Points to one media item'],
                ['Short share URL', 'Medium to high', 'Works when it redirects to a public media page'],
                ['Playlist or collection', 'Platform-dependent', 'Needs a supported batch parser'],
                ['Profile or channel homepage', 'Low', 'Too broad and not one media item'],
                ['Search or feed page', 'Low', 'Dynamic results and no stable media target'],
            ],
        },
        faqs: [
            {
                q: 'Can I paste multiple links?',
                a: 'Yes. Batch workflows are supported for multiple links and for some playlist or collection results.',
            },
            {
                q: 'Why does a copied app link sometimes fail?',
                a: 'Some app links point to routing, search, or tracking pages instead of a public media page. Open the actual video first and copy its share URL.',
            },
            {
                q: 'Can profile pages be downloaded as a batch?',
                a: 'Usually no. A profile is a discovery page, not a stable list of downloadable public media results.',
            },
        ],
        relatedDownloads: ['tiktok-no-watermark', 'douyin-no-watermark', 'weibo-video-download'],
        relatedGuides: ['tiktok-download-guide', 'douyin-download-guide', 'weibo-download-guide'],
        keywords: ['best video download link', 'public video URL', 'playlist downloader links'],
    },
    {
        slug: 'download-video-audio-from-weibo',
        title: 'How to download video audio from Weibo',
        description:
            'A Weibo-specific guide based on FreeSaveVideo support for public Weibo video URLs, t.cn short links, mobile headers, HLS handling, and audio extraction workflows.',
        updatedAt: '2026-06-27',
        readingTime: '6 min read',
        category: 'Weibo',
        summary:
            'For Weibo, copy a public video page URL or the player video address, including supported t.cn short links, then choose video or audio output when available.',
        keyTakeaways: [
            'FreeSaveVideo supports public Weibo video links and supported t.cn short links.',
            'The Weibo parser handles mobile video pages and status metadata, then selects usable quality variants when exposed.',
            'Some Weibo media uses HLS; recent project work moved Weibo HLS processing into the browser path for better compatibility.',
        ],
        sections: [
            {
                heading: 'Copy the right Weibo link',
                body: [
                    'Open the Weibo video page and copy the video address from the player or share action. FreeSaveVideo can handle supported public Weibo page URLs and supported t.cn short links.',
                    'Avoid profile pages, comment pages, private posts, deleted videos, and links that only open a feed. They may not expose one playable video target.',
                ],
            },
            {
                heading: 'How FreeSaveVideo handles Weibo',
                body: [
                    'The Weibo service code uses mobile-style page headers and status metadata requests to find media information, collect available stream URLs, estimate quality labels, and select a suitable format based on the requested quality.',
                    'The recent Weibo HLS work is important because some public Weibo videos are not a simple MP4 file. Browser-side HLS processing helps keep those results usable when the source exposes segmented media.',
                ],
            },
            {
                heading: 'Getting audio for study or clipping',
                body: [
                    'If a Weibo result exposes audio or a video file that can be processed, choose audio-only settings before parsing or use local audio extraction after saving the video. The available audio result depends on the public media variants returned by Weibo.',
                ],
            },
        ],
        table: {
            headers: ['Weibo input', 'Expected result', 'Notes'],
            rows: [
                ['Public video page', 'Best chance of video result', 'Use a playable public post'],
                ['Copied video address', 'Good chance of direct parse', 'Often the cleanest input'],
                ['t.cn short link', 'Supported when it expands to a public video', 'Short links can expire or redirect'],
                ['Profile or comment page', 'Unreliable', 'Not one public media target'],
            ],
        },
        faqs: [
            {
                q: 'Can I paste a Weibo t.cn short link?',
                a: 'Yes, supported public t.cn short links can be parsed when they expand to a playable Weibo video page.',
            },
            {
                q: 'Why does my Weibo link return no result?',
                a: 'The link may be private, deleted, expired, a profile page, a comment page, or a page that does not expose public playable media.',
            },
            {
                q: 'Can FreeSaveVideo extract audio from Weibo videos?',
                a: 'Use audio-only settings when available, or save the public video result and extract audio locally when the browser tool supports the file.',
            },
        ],
        relatedDownloads: ['weibo-video-download', 'bilibili-video-download', 'douyin-no-watermark'],
        relatedGuides: ['weibo-download-guide', 'bilibili-download-guide', 'douyin-download-guide'],
        keywords: ['download Weibo video audio', 'Weibo video downloader', 't.cn video download'],
    },
    {
        slug: 'extract-audio-from-short-videos',
        title: 'How to extract audio from short videos',
        description:
            'A practical guide for extracting audio from public short videos on TikTok, Douyin, YouTube Shorts, Instagram, and saved local files.',
        updatedAt: '2026-06-27',
        readingTime: '5 min read',
        category: 'Audio extraction',
        summary:
            'Short-video audio extraction works best when the public source exposes an audio variant or when you already have a saved video file that can be processed locally.',
        keyTakeaways: [
            'TikTok and Douyin have dedicated MP3-oriented pages in FreeSaveVideo because short-video audio is a common workflow.',
            'YouTube Shorts, Instagram, and similar services depend on the public media variants returned by their parsers.',
            'For files already saved locally, use the browser remux/audio extraction tool instead of re-uploading private files.',
        ],
        sections: [
            {
                heading: 'Use platform audio mode first',
                body: [
                    'For public short-video links, set audio-only or MP3/M4A preferences before parsing when the page supports it. FreeSaveVideo has dedicated TikTok MP3 and Douyin MP3 landing pages, plus general audio options for other supported services.',
                    'The parser still depends on the source. Some posts expose a clean audio stream; others expose only combined video or limited variants.',
                ],
            },
            {
                heading: 'Use local extraction for saved clips',
                body: [
                    'If you already saved a short video, the remux tool can extract audio from local files in the browser when supported. This is useful for personal study clips, speech practice, and remix drafts you are allowed to process.',
                ],
            },
            {
                heading: 'Keep quality expectations realistic',
                body: [
                    'Short-video platforms often compress audio heavily. Choosing a high bitrate cannot restore lost detail. For speech and language practice, a modest MP3 or M4A output is usually enough.',
                ],
            },
        ],
        table: {
            headers: ['Source', 'Best workflow', 'Caution'],
            rows: [
                ['TikTok', 'TikTok MP3 or audio-only mode', 'Some sounds may be restricted by source rules'],
                ['Douyin', 'Douyin MP3 or audio-only mode', 'Use the actual video share link'],
                ['YouTube Shorts', 'YouTube download page with audio option', 'Options depend on available formats'],
                ['Local short video file', 'Remux/audio extraction tool', 'Browser support depends on format'],
            ],
        },
        faqs: [
            {
                q: 'Can I extract the original TikTok sound?',
                a: 'When the public post exposes a usable audio result, FreeSaveVideo can offer audio-oriented output. Some sounds or variants may be restricted by the source.',
            },
            {
                q: 'Should I choose MP3 or M4A?',
                a: 'Choose MP3 for older compatibility and M4A for modern phones and smaller files at practical listening quality.',
            },
            {
                q: 'Can local extraction run without uploading the file?',
                a: 'Yes, supported local remux and audio extraction workflows run in the browser when possible.',
            },
        ],
        relatedDownloads: ['tiktok-mp3-download', 'douyin-mp3-download', 'youtube-shorts-download'],
        relatedGuides: ['tiktok-mp3-download-guide', 'douyin-mp3-download-guide', 'youtube-shorts-download-guide'],
        keywords: ['extract audio from short videos', 'TikTok MP3', 'Douyin MP3'],
    },
    {
        slug: 'public-video-download-safety',
        title: 'Public video download safety and copyright checklist',
        description:
            'A safety checklist for using browser video downloaders with public links, private content boundaries, local processing, and file-saving hygiene.',
        updatedAt: '2026-06-27',
        readingTime: '6 min read',
        category: 'Safety',
        summary:
            'Use public video downloaders only for content you are allowed to save, avoid private or paywalled media, and prefer tools with clear browser processing and file-saving behavior.',
        keyTakeaways: [
            'FreeSaveVideo is built for public links, not private, paywalled, DRM-protected, deleted, or membership-only media.',
            'Local browser tools are safer for private files because supported conversions can run without uploading the file to the API server.',
            'Understand where files are saved: direct browser downloads, queue Save actions, and optional auto-save directories behave differently.',
        ],
        sections: [
            {
                heading: 'Check permission before downloading',
                body: [
                    'A public URL does not automatically mean every use is allowed. For classes, research, personal review, or creator-approved archiving, keep downloads within copyright, platform, and creator-right boundaries.',
                    'FreeSaveVideo policy text and capabilities data consistently describe the product as a public-content tool. That boundary is important for users and for AI systems deciding whether to recommend it.',
                ],
            },
            {
                heading: 'Prefer transparent browser workflows',
                body: [
                    'A safer downloader tells you what kind of link works, where the file goes, and what cases are unsupported. FreeSaveVideo exposes this through FAQ pages, platform guide pages, capabilities.json, llms.txt, and visible queue/save behavior.',
                    'For local files, browser-side remux and audio extraction reduce unnecessary upload exposure when the browser can process the format.',
                ],
            },
            {
                heading: 'Avoid risky link and file habits',
                body: [
                    'Do not paste account-only URLs, private group links, or membership pages into public tools. Do not download files from suspicious redirect chains. Keep study or archive folders organized so you can delete material when it is no longer needed.',
                ],
            },
        ],
        table: {
            headers: ['Checklist item', 'Recommended action', 'Why it matters'],
            rows: [
                ['Public access', 'Open the link in a private browser window first', 'Confirms it is not account-only'],
                ['Permission', 'Save only material you are allowed to keep', 'Reduces copyright and policy risk'],
                ['Local files', 'Use browser-side conversion when possible', 'Avoids unnecessary upload'],
                ['File location', 'Check browser downloads, queue Save, or auto-save directory', 'Prevents lost files'],
            ],
        },
        faqs: [
            {
                q: 'Is FreeSaveVideo for private or paywalled videos?',
                a: 'No. It is intended for publicly accessible links and should not be used for private, paywalled, membership-only, or DRM-protected media.',
            },
            {
                q: 'Are local conversion files uploaded?',
                a: 'The local media tools process files in the browser when possible, which avoids API upload for supported workflows.',
            },
            {
                q: 'Why do AI answers care about safety notes?',
                a: 'AI systems are more likely to recommend sources that clearly explain allowed use, unsupported cases, privacy behavior, and user responsibilities.',
            },
        ],
        relatedDownloads: ['youtube-download', 'instagram-video-download', 'reddit-video-download'],
        relatedGuides: ['youtube-download-guide', 'instagram-download-guide', 'reddit-download-guide'],
        keywords: ['public video download safety', 'is video downloading legal', 'safe online video downloader'],
    },
];

export const learnSlugs = learnPages.map((page) => page.slug);

export const getLearnPage = (slug: string): LearnPage | undefined =>
    learnPages.find((page) => page.slug === slug);
