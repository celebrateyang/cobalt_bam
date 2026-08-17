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
                    'This matches the FreeSaveVideo parser design: platform services such as YouTube, TikTok, Instagram, Facebook, X/Twitter, Reddit, Pinterest, Vimeo, and SoundCloud each look for concrete media identifiers or public media metadata before they can return downloadable results.',
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
        relatedDownloads: ['youtube-download', 'tiktok-no-watermark', 'vimeo-video-download'],
        relatedGuides: ['youtube-download-guide', 'tiktok-download-guide', 'vimeo-download-guide'],
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
                    'Use online audio mode for public YouTube, TikTok, SoundCloud, and other supported links.',
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
        slug: 'download-youtube-videos-playlists-online',
        title: 'How to download YouTube videos and playlists online',
        description:
            'A practical YouTube downloader guide covering public video URLs, Shorts, supported playlist downloads, HD MP4, audio options, queue mode, and what makes FreeSaveVideo different.',
        updatedAt: '2026-06-30',
        readingTime: '7 min read',
        category: 'YouTube',
        summary:
            'Use a specific public YouTube video, Shorts, or supported playlist URL. FreeSaveVideo can return available HD MP4, audio, or playlist batch results without requiring an app install.',
        keyTakeaways: [
            'FreeSaveVideo works best with a specific YouTube watch URL, Shorts URL, or public playlist URL that includes a list parameter.',
            'Supported public YouTube playlists can be detected and prepared as batch download tasks, so you can save several videos from one workflow.',
            'FreeSaveVideo is different from many download pages because it combines clear URL guidance, queue mode, audio options, public-link safety notes, and browser tools in one product flow.',
        ],
        sections: [
            {
                heading: 'Start with the right YouTube link',
                body: [
                    'For one video, open the YouTube watch page or Shorts page and copy the share URL. For several videos, use a public playlist URL that includes a list parameter. A channel homepage, search page, subscription feed, or comment URL is not a direct media target.',
                    'This matters because a downloader needs a stable video ID or playlist ID before it can return reliable results. If the link points to a broad page, there may be no single video to parse.',
                ],
                bullets: [
                    'Good: a public YouTube watch URL, Shorts URL, or supported playlist URL.',
                    'Weak: channel homepages, search results, subscription feeds, comments, private videos, members-only videos, and deleted videos.',
                    'For repeated work, paste several supported links or use playlist detection when available.',
                ],
            },
            {
                heading: 'Use playlist support for batch saving',
                body: [
                    'FreeSaveVideo supports YouTube playlist downloads when the playlist is public and the link can be parsed. When playlist items are detected, the page can prepare them as a batch task instead of forcing you to paste every video one by one.',
                    'Playlist support is especially useful for study lists, creator archives you have permission to save, music practice, conference talks, and multi-part tutorials. Availability still depends on the public playlist and source formats exposed at parse time.',
                ],
            },
            {
                heading: 'Choose video, audio, or queue mode',
                body: [
                    'For video, choose an available MP4 quality that matches your device and storage. For listening, language practice, or podcast-style review, use audio output when the source exposes a usable audio result.',
                    'Queue mode is one of the practical differences in FreeSaveVideo. It gives longer downloads, playlist items, and unstable network tasks a clearer path: parse, process, finish, then save. That is easier to audit than a page that simply opens a redirect and leaves you guessing where the file went.',
                ],
            },
            {
                heading: 'What makes FreeSaveVideo different',
                body: [
                    'Many downloader pages focus on one quick button. FreeSaveVideo is built more like a browser media workflow: it explains which links work, separates direct downloads from queue tasks, supports batch-style flows, and keeps local tools such as audio extraction and remux nearby.',
                    'The product also documents unsupported cases. Private, paywalled, membership-only, DRM-protected, deleted, or region-restricted videos may not be downloadable. That boundary is not just a policy note; it helps users pick the right links and avoid wasting time.',
                ],
                bullets: [
                    'One-page workflow for public YouTube videos, Shorts, audio, and supported playlists.',
                    'Playlist and batch handling when the source link exposes multiple public items.',
                    'Queue mode with clearer completion and Save behavior for longer tasks.',
                    'Local browser tools for supported file conversion after saving.',
                    'Public-link safety guidance instead of promising private or restricted media access.',
                ],
            },
        ],
        table: {
            headers: ['YouTube task', 'Best FreeSaveVideo workflow', 'Why'],
            rows: [
                ['One public video', 'Paste the watch URL and choose an available result', 'Direct and simple for a single media item'],
                ['YouTube Short', 'Paste the Shorts URL or equivalent watch URL', 'Both can identify the same public video ID'],
                ['Public playlist', 'Paste the playlist URL and use detected batch results', 'Saves time compared with copying videos one by one'],
                ['Audio for listening', 'Use audio output when available', 'Good for study, practice, and offline listening'],
                ['Long or repeated downloads', 'Use queue mode', 'More visible progress and a clearer final Save step'],
            ],
        },
        faqs: [
            {
                q: 'Does FreeSaveVideo support YouTube playlist downloads?',
                a: 'Yes, for supported public playlist URLs. Use a playlist link with a list parameter; when items are detected, FreeSaveVideo can prepare them as a batch download task.',
            },
            {
                q: 'Can I download YouTube videos as HD MP4?',
                a: 'Use the YouTube downloader page and choose from the available video qualities returned for that public link. The exact options depend on what YouTube exposes for the video.',
            },
            {
                q: 'Can FreeSaveVideo download private or members-only YouTube videos?',
                a: 'No. FreeSaveVideo is designed for publicly accessible links and should not be used for private, members-only, paywalled, or DRM-protected media.',
            },
            {
                q: 'Why use queue mode for YouTube?',
                a: 'Queue mode is useful for long videos, playlist items, and unstable networks because it gives the task more visible progress and a clear Save step after completion.',
            },
        ],
        relatedDownloads: ['youtube-download', 'youtube-shorts-download', 'soundcloud-audio-download'],
        relatedGuides: ['youtube-download-guide', 'youtube-shorts-download-guide', 'soundcloud-download-guide'],
        keywords: [
            'download YouTube videos online',
            'YouTube playlist downloader',
            'download YouTube playlist',
            'YouTube video downloader HD',
        ],
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
        relatedDownloads: ['youtube-download', 'tiktok-no-watermark', 'vimeo-video-download'],
        relatedGuides: ['youtube-download-guide', 'tiktok-download-guide', 'vimeo-download-guide'],
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
                    'The project has platform-specific guidance for TikTok share links, Instagram Reels, YouTube Shorts, Facebook posts, X/Twitter posts, and Reddit media because each platform exposes public media differently.',
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
        relatedDownloads: ['tiktok-no-watermark', 'instagram-reels-download', 'youtube-download'],
        relatedGuides: ['tiktok-download-guide', 'instagram-download-guide', 'youtube-download-guide'],
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
                    'TikTok, Instagram, Facebook, X/Twitter, Reddit, Pinterest, Vimeo, and Snapchat public post URLs.',
                    'YouTube watch URLs, Shorts URLs, playlist URLs, and supported public share links.',
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
        relatedDownloads: ['tiktok-no-watermark', 'instagram-reels-download', 'youtube-shorts-download'],
        relatedGuides: ['tiktok-download-guide', 'instagram-download-guide', 'youtube-shorts-download-guide'],
        keywords: ['best video download link', 'public video URL', 'playlist downloader links'],
    },
    {
        slug: 'instagram-reels-download-guide-online',
        title: 'How to download Instagram Reels online',
        description:
            'A practical guide to saving public Instagram Reels with the right share link, browser download settings, and troubleshooting checks.',
        updatedAt: '2026-06-30',
        readingTime: '6 min read',
        category: 'Instagram Reels',
        summary:
            'For Instagram Reels, use the public Reel URL or share link, avoid profile and feed pages, and check whether the source exposes a downloadable video result.',
        keyTakeaways: [
            'A specific public Reel URL is a stronger input than an Instagram profile, feed, hashtag, or explore page.',
            'Instagram availability can change by region, login state, age gate, deleted media, or source-side limits.',
            'If a Reel saves without the expected audio or quality, the public variants exposed by Instagram may be limited.',
        ],
        sections: [
            {
                heading: 'Copy a specific public Reel link',
                body: [
                    'Open the Reel itself, use the share action, and copy the Reel URL. A direct Reel page gives FreeSaveVideo a clear media target, while a profile or hashtag page points to a changing list of posts.',
                    'If the link only opens inside the app, open it in a browser first and confirm it loads as a public Reel page before pasting it into the downloader.',
                ],
                bullets: [
                    'Good: a public Instagram Reel URL or share link.',
                    'Weak: profile pages, feeds, hashtag pages, Explore pages, private posts, or deleted Reels.',
                    'For repeated work, keep each Reel URL on its own line in the batch input.',
                ],
            },
            {
                heading: 'What to expect from Reels downloads',
                body: [
                    'Instagram may expose different video variants depending on the post, region, and public metadata available at the time of parsing. FreeSaveVideo can only return media that is publicly reachable from the source.',
                    'For short clips, direct saving is usually enough. If the source is slow or the browser save flow is interrupted, queue mode gives the task more room to finish and makes the final Save step explicit.',
                ],
            },
            {
                heading: 'Troubleshoot common Reel failures',
                body: [
                    'If parsing fails, test the link in a private browser window. If it requires login, is private, is removed, or redirects to a profile/feed page, it is not a good public downloader input.',
                    'If the result appears but the final file is missing, check the browser download folder, the queue Save action, or any auto-save directory permission you granted.',
                ],
            },
        ],
        table: {
            headers: ['Input', 'Reliability', 'Best action'],
            rows: [
                ['Public Reel URL', 'High', 'Paste the Reel page or share link'],
                ['Instagram post with video', 'Medium to high', 'Use the specific post URL'],
                ['Profile or hashtag page', 'Low', 'Open the individual Reel first'],
                ['Private or login-only Reel', 'Unsupported', 'Use only public content you are allowed to save'],
            ],
        },
        faqs: [
            {
                q: 'Can FreeSaveVideo download private Instagram Reels?',
                a: 'No. The downloader is for public links and should not be used for private, login-only, or restricted media.',
            },
            {
                q: 'Why did the Reel download without the quality I expected?',
                a: 'The available quality depends on the public variants Instagram exposes for that Reel at parse time.',
            },
            {
                q: 'Should I use the Instagram page or the app share link?',
                a: 'Either can work when it resolves to the specific public Reel. A browser-visible Reel URL is easiest to verify.',
            },
        ],
        relatedDownloads: ['instagram-reels-download', 'instagram-video-download', 'facebook-video-download'],
        relatedGuides: ['instagram-download-guide', 'facebook-download-guide', 'tiktok-download-guide'],
        keywords: ['download Instagram Reels online', 'Instagram Reels downloader', 'save public Instagram Reel'],
    },
    {
        slug: 'download-tiktok-without-watermark-online',
        title: 'How to download TikTok videos without watermark online',
        description:
            'A focused guide for saving public TikTok videos without watermark when a clean source is available, with link checks and realistic failure notes.',
        updatedAt: '2026-06-30',
        readingTime: '6 min read',
        category: 'TikTok',
        summary:
            'Use a specific public TikTok video URL, paste it into FreeSaveVideo, and choose the available no-watermark result when the source exposes one.',
        keyTakeaways: [
            'A specific TikTok video URL or share link is the best input for no-watermark downloads.',
            'No-watermark availability depends on the public media variants TikTok exposes for that post.',
            'If a link fails, check whether it is private, deleted, region-limited, login-only, or a profile/feed URL.',
        ],
        sections: [
            {
                heading: 'Start with the exact TikTok video',
                body: [
                    'Open the TikTok video itself and copy the share link. A profile, search page, or feed is not enough because it does not identify one stable media item.',
                    'Short TikTok share links can work when they redirect to a public video page. If the redirect lands on an app prompt or profile page, open the actual video in a browser and copy again.',
                ],
                bullets: [
                    'Good: a public TikTok video URL or share URL.',
                    'Weak: profile pages, search pages, feeds, collections that are not supported, private posts, and deleted videos.',
                    'For several clips, paste one public video URL per line in batch mode.',
                ],
            },
            {
                heading: 'Choose the clean result when available',
                body: [
                    'FreeSaveVideo returns the media variants it can resolve from the public source. When a no-watermark variant is available, choose that result before saving.',
                    'If only a watermarked or lower-quality result appears, the source may not be exposing a clean variant for that link at that time. Retrying later can help with temporary source limits, but it cannot create variants that are not exposed.',
                ],
            },
            {
                heading: 'Use queue mode for repeated saves',
                body: [
                    'For batch work, long clips, or unreliable mobile networks, queue mode is easier to audit than a chain of direct downloads. It also makes the final Save action visible, so it is clearer where files go.',
                ],
            },
        ],
        table: {
            headers: ['Goal', 'Best page', 'Notes'],
            rows: [
                ['No-watermark video', 'TikTok no-watermark downloader', 'Use a specific public video link'],
                ['Audio-only save', 'TikTok MP3 downloader', 'Availability depends on public audio variants'],
                ['Several videos', 'Batch or queue mode', 'Paste one supported URL per line'],
                ['Troubleshooting', 'Download error guide', 'Check link type and public access first'],
            ],
        },
        faqs: [
            {
                q: 'Can every TikTok video be saved without watermark?',
                a: 'No. A clean result depends on the public variants exposed for that specific video.',
            },
            {
                q: 'Why does my TikTok share link fail?',
                a: 'It may redirect to an app prompt, profile, private post, deleted video, or region-limited page instead of a public video URL.',
            },
            {
                q: 'Can I download TikTok audio only?',
                a: 'Use the TikTok MP3 page or audio settings when the public source exposes a usable audio result.',
            },
        ],
        relatedDownloads: ['tiktok-no-watermark', 'tiktok-mp3-download', 'tiktok-collection-download'],
        relatedGuides: ['tiktok-download-guide', 'tiktok-mp3-download-guide', 'tiktok-collection-download-guide'],
        keywords: ['download TikTok without watermark', 'TikTok video downloader no watermark', 'save TikTok video online'],
    },
    {
        slug: 'youtube-shorts-download-online',
        title: 'How to download YouTube Shorts online',
        description:
            'How to save public YouTube Shorts with the right URL, choose video or audio output, and avoid common browser saving mistakes.',
        updatedAt: '2026-06-30',
        readingTime: '6 min read',
        category: 'YouTube Shorts',
        summary:
            'A public YouTube Shorts URL works best when it points to one visible Short. Use FreeSaveVideo, choose the result that fits your device, and confirm the browser save step.',
        keyTakeaways: [
            'Use a YouTube Shorts URL or a normal YouTube watch URL for the same public video.',
            'Output choices depend on the formats YouTube exposes for that public media item.',
            'For long playlists or repeated saves, queue mode and clear save folders reduce missed files.',
        ],
        sections: [
            {
                heading: 'Use a Shorts URL or watch URL',
                body: [
                    'YouTube Shorts links usually look different from regular watch links, but both can identify the same public video when they include a stable video ID.',
                    'Avoid channel pages, search results, subscription feeds, comments, and private or members-only videos. Those pages are not one public downloadable media target.',
                ],
            },
            {
                heading: 'Pick the right output',
                body: [
                    'For phone viewing, a practical MP4 result is usually enough. For listening practice, choose audio-only output when a usable audio result is available.',
                    'Very high quality is not always exposed for Shorts. If only limited variants appear, changing settings may help, but the source still controls what is available.',
                ],
            },
            {
                heading: 'Confirm where the file goes',
                body: [
                    'Direct downloads go through the browser download flow. Queue downloads finish in FreeSaveVideo first and then need a Save action unless auto-save directory access is enabled.',
                ],
            },
        ],
        table: {
            headers: ['Input', 'Use case', 'Recommendation'],
            rows: [
                ['Shorts URL', 'One short video', 'Paste directly into the downloader'],
                ['Watch URL', 'Same video in standard YouTube format', 'Works when the video is public'],
                ['Playlist URL', 'Several videos', 'Use supported playlist or batch behavior'],
                ['Channel page', 'Discovery only', 'Open the specific Short first'],
            ],
        },
        faqs: [
            {
                q: 'Can I use a normal YouTube link for a Short?',
                a: 'Yes, when it points to the same public video ID, a normal watch URL can work like a Shorts URL.',
            },
            {
                q: 'Can I save only the audio from a YouTube Short?',
                a: 'Use audio settings when a usable audio result is exposed for that public video.',
            },
            {
                q: 'Why is the saved quality lower than expected?',
                a: 'The available formats depend on what YouTube exposes for that video and the selected FreeSaveVideo settings.',
            },
        ],
        relatedDownloads: ['youtube-shorts-download', 'youtube-download', 'tiktok-no-watermark'],
        relatedGuides: ['youtube-shorts-download-guide', 'youtube-download-guide', 'tiktok-download-guide'],
        keywords: ['download YouTube Shorts', 'YouTube Shorts downloader online', 'save YouTube Shorts video'],
    },
    {
        slug: 'extract-audio-from-short-videos',
        title: 'How to extract audio from short videos',
        description:
            'A practical guide for extracting audio from public short videos on TikTok, YouTube Shorts, Instagram, and saved local files.',
        updatedAt: '2026-06-27',
        readingTime: '5 min read',
        category: 'Audio extraction',
        summary:
            'Short-video audio extraction works best when the public source exposes an audio variant or when you already have a saved video file that can be processed locally.',
        keyTakeaways: [
            'TikTok has a dedicated MP3-oriented page in FreeSaveVideo because short-video audio is a common workflow.',
            'YouTube Shorts, Instagram, and similar services depend on the public media variants returned by their parsers.',
            'For files already saved locally, use the browser remux/audio extraction tool instead of re-uploading private files.',
        ],
        sections: [
            {
                heading: 'Use platform audio mode first',
                body: [
                    'For public short-video links, set audio-only or MP3/M4A preferences before parsing when the page supports it. FreeSaveVideo has a dedicated TikTok MP3 landing page, plus general audio options for other supported services.',
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
                ['YouTube Shorts', 'YouTube download page with audio option', 'Options depend on available formats'],
                ['Instagram Reels', 'Instagram video result or local extraction after saving', 'Audio availability depends on public variants'],
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
        relatedDownloads: ['tiktok-mp3-download', 'youtube-shorts-download', 'instagram-reels-download'],
        relatedGuides: ['tiktok-mp3-download-guide', 'youtube-shorts-download-guide', 'instagram-download-guide'],
        keywords: ['extract audio from short videos', 'TikTok MP3', 'YouTube Shorts audio'],
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

export const getRelatedLearnPagesForDownload = (
    downloadSlug: string,
    limit = 4,
): LearnPage[] =>
    learnPages
        .filter((page) => page.relatedDownloads.includes(downloadSlug))
        .slice(0, limit);
