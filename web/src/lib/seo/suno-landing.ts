import type { SeoLandingPage } from './landing-pages';

export const sunoLanding: SeoLandingPage = {
    slug: 'suno-downloader',
    supportedLinkFormats: ['https://suno.com/s/SHARE_CODE', 'https://suno.com/song/SONG_ID'],
    locales: {
        en: {
            metaTitle: 'Suno Downloader: Save Public Song Videos as MP4 | FreeSaveVideo',
            metaDescription: 'Download an available MP4 video from a public Suno song link. Paste a Suno share or song URL, preview the result and save it in your browser.',
            metaKeywords: ['suno downloader', 'download suno video', 'suno to mp4', 'suno song downloader'],
            h1: 'Suno Song Video Downloader',
            lede: 'Save an available MP4 video from a public Suno song. Paste a Suno share link or song page URL to preview and download the video in your browser.',
            heroTags: ['Public song links', 'MP4 when available', 'Browser preview'],
            facts: ['Use a public individual song or share link. Private, deleted or restricted songs may not work.', 'The downloader uses the video published for the song when one is available; MP3 and WAV downloads are not supported.', 'Sign in to FreeSaveVideo when prompted. Points or membership usage may apply.'],
            quickAnswer: 'Paste a public Suno song or share link into FreeSaveVideo. If the song page exposes a supported MP4 video, preview it and save it in your browser.',
            stepsTitle: 'How to download a Suno song video',
            steps: ['Copy the share link or URL of an individual public Suno song.', 'Paste it into the downloader and sign in to FreeSaveVideo if prompted.', 'Preview the available video and download the MP4. If browser download fails, use the extension or open the direct link.'],
            featuresTitle: 'What the Suno downloader supports',
            features: ['Accepts suno.com/s/ share links and suno.com/song/ song URLs.', 'Returns the MP4 video exposed by the public song page, when available.', 'Uses direct browser download with extension and browser link alternatives when needed.', 'Available video, sound and quality depend on the source.'],
            supportedLinksTitle: 'Supported Suno links',
            supportedLinks: [{ title: 'Share link', description: 'Copy the link from the song share menu: suno.com/s/SHARE_CODE.' }, { title: 'Song page', description: 'Copy the individual suno.com/song/SONG_ID page URL.' }],
            faqTitle: 'Suno download questions',
            faqs: [
                { q: 'Can I download every Suno song as MP4?', a: 'No. A supported public song page must expose an available MP4 video. Private, restricted or deleted songs and songs without a video may fail.' },
                { q: 'Can I download Suno songs as MP3 or WAV?', a: 'This downloader currently supports available MP4 song videos only. MP3 and WAV downloads are not supported.' },
                { q: 'Why did my Suno download fail?', a: 'Check that the link opens a public individual song and try again. A missing video, source restriction, expired resource or network problem may prevent a download.' },
                { q: 'Do I need to install an app?', a: 'A browser can download an accessible MP4 directly. If that fails, the browser extension or opening the direct link may help.' },
                { q: 'Does downloading grant commercial rights?', a: 'No. Downloading does not change your rights. Check Suno terms and obtain any permissions needed for your intended use.' },
            ],
            disclaimer: 'Download only material you own or have permission to save. FreeSaveVideo is independent of Suno.',
        },
    },
};
