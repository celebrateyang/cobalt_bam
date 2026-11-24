import type { SeoLandingPage } from './landing-pages';
import { sunoLocales } from './suno-locales';

const howTitles: Record<string, string> = {
    fr: 'Comment télécharger une chanson Suno',
    de: 'So lädst du einen Suno-Song herunter',
    es: 'Cómo descargar una canción de Suno',
    zh: '如何下载 Suno 歌曲',
    ja: 'Suno の曲をダウンロードする方法',
    ko: 'Suno 노래 다운로드 방법',
    ru: 'Как скачать песню Suno',
    th: 'วิธีดาวน์โหลดเพลง Suno',
    vi: 'Cách tải bài hát Suno',
    id: 'Cara mengunduh lagu Suno',
};

export const sunoLanding: SeoLandingPage = {
    slug: 'suno-downloader',
    supportedLinkFormats: ['https://suno.com/s/SHARE_CODE', 'https://suno.com/song/SONG_ID'],
    locales: {
        ...Object.fromEntries(Object.entries(sunoLocales).map(([lang, copy]) => [lang, {
            metaTitle: copy.title,
            metaDescription: copy.description,
            metaKeywords: copy.keywords,
            h1: `${copy.ui[3]} ${copy.ui[4]}`,
            lede: copy.ui[5],
            stepsTitle: howTitles[lang],
            steps: copy.steps,
            featuresTitle: copy.ui[42],
            features: [copy.ui[5], copy.ui[34], copy.ui[35]],
            faqTitle: copy.ui[45],
            faqs: copy.faqs.map(([q, a]) => ({ q, a })),
            disclaimer: copy.disclaimer,
        }])),
        en: {
            metaTitle: 'Suno Downloader: Save Song Audio or MP4 | FreeSaveVideo',
            metaDescription: 'Download an available Suno song video as MP4 or extract its audio as MP3. Paste a public Suno share or song URL and choose your download mode.',
            metaKeywords: ['suno downloader', 'suno to mp3', 'download suno audio', 'suno to mp4', 'suno song downloader'],
            h1: 'Suno song downloader. Keep the feeling.',
            lede: 'Download audio only from an available public Suno song video, or save the video as MP4. Paste a Suno share link or song page URL to get started.',
            heroTags: ['Audio-only downloads', 'MP3 and more', 'MP4 when available'],
            facts: ['Use a public individual song or share link. Private, deleted or restricted songs may not work.', 'Audio is extracted from an available song video in your browser; it is not a separate original Suno audio export.', 'Sign in to FreeSaveVideo when prompted. Points or membership usage may apply.'],
            quickAnswer: 'Paste a public Suno song or share link into FreeSaveVideo. When a supported MP4 video is available, save it or choose audio mode to extract its audio in your browser.',
            stepsTitle: 'How to download a Suno song',
            steps: ['Copy the share link or URL of an individual public Suno song.', 'Paste the link and choose audio or video. Select an audio format if needed.', 'Start the download and sign in to FreeSaveVideo if prompted. Audio is extracted in your browser from the available video.'],
            featuresTitle: 'What the Suno downloader supports',
            features: ['Accepts suno.com/s/ share links and suno.com/song/ song URLs.', 'Returns the MP4 video exposed by the public song page, when available.', 'Audio mode extracts the video audio in your browser as MP3, WAV, OGG, Opus or M4A with the best setting.', 'Video downloads use a direct browser connection with extension and browser link alternatives when needed.', 'Available video, sound and quality depend on the source.'],
            sections: [{ title: 'Download Suno audio only', paragraphs: ['To save a song without video, paste its public Suno link, select Audio mode in the downloader and choose a format in download settings. MP3 is the default; WAV, OGG, Opus and Best are also available.', 'The browser extracts audio from the available MP4 video. This is not a separate original Suno audio export, and it requires an accessible video with an audio track and a browser that can process it.'] }],
            supportedLinksTitle: 'Supported Suno links',
            supportedLinks: [{ title: 'Share link', description: 'Copy the link from the song share menu: suno.com/s/SHARE_CODE.' }, { title: 'Song page', description: 'Copy the individual suno.com/song/SONG_ID page URL.' }],
            faqTitle: 'Suno download questions',
            faqs: [
                { q: 'Can I download every Suno song as MP4?', a: 'No. A supported public song page must expose an available MP4 video. Private, restricted or deleted songs and songs without a video may fail.' },
                { q: 'Can I download Suno songs as MP3 or WAV?', a: 'Yes, when the public song provides a supported MP4 with audio. Select Audio above and choose MP3 or WAV. The browser extracts the audio from the video; it is not the original Suno audio export.' },
                { q: 'Why did my Suno download fail?', a: 'Check that the link opens a public individual song and try again. A missing video, source restriction, expired resource or network problem may prevent a download.' },
                { q: 'Do I need to install an app?', a: 'No downloader app is required. The browser downloads the video directly and processes audio locally. Audio extraction requires a browser that can fetch and process the source; extension and direct-link handoff do not convert it to audio.' },
                { q: 'Does downloading grant commercial rights?', a: 'No. Downloading does not change your rights. Check Suno terms and obtain any permissions needed for your intended use.' },
            ],
            disclaimer: 'Download only material you own or have permission to save. FreeSaveVideo is independent of Suno.',
        },
    },
};
