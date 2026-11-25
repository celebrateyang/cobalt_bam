import type { SeoLandingPage } from './landing-pages';
import { sunoLocales } from './suno-locales';
import { sunoAudioCopy } from './suno-audio-copy';

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
            steps: lang === 'zh' ? [copy.steps[0], copy.steps[1], '开始下载，并按提示登录 FreeSaveVideo。可用音频在浏览器中处理。'] : copy.steps,
            featuresTitle: copy.ui[42],
            features: [copy.ui[5], sunoAudioCopy[lang].description, sunoAudioCopy[lang].limitation],
            faqTitle: copy.ui[45],
            faqs: copy.faqs.map(([q, a], index) => ({ q, a: index === 0 ? sunoAudioCopy[lang].all : index === 1 ? sunoAudioCopy[lang].format : a })),
            disclaimer: copy.disclaimer,
        }])),
        en: {
            metaTitle: 'Suno Downloader: Save Song Audio or MP4 | FreeSaveVideo',
            metaDescription: 'Download available audio from a public Suno song as MP3, or save an available MP4 video. Paste a Suno share or song URL and choose a format.',
            metaKeywords: ['suno downloader', 'suno to mp3', 'download suno audio', 'suno to mp4', 'suno song downloader'],
            h1: 'Suno song downloader. Keep the feeling.',
            lede: 'Download available audio from a public Suno song, or save its video as MP4 when available. Paste a Suno share link or song page URL to get started.',
            heroTags: ['Audio-only downloads', 'MP3 and more', 'MP4 when available'],
            facts: ['Use a public individual song or share link. Private, deleted or restricted songs may not work.', sunoAudioCopy.en.limitation, 'Sign in to FreeSaveVideo when prompted. Points or membership usage may apply.'],
            quickAnswer: 'Paste a public Suno song or share link into FreeSaveVideo. Choose audio or video; the song must expose a supported source for that mode.',
            stepsTitle: 'How to download a Suno song',
            steps: ['Copy the share link or URL of an individual public Suno song.', 'Paste the link and choose audio or video. Select an audio format if needed.', 'Start the download and sign in to FreeSaveVideo if prompted. Available audio is processed in your browser.'],
            featuresTitle: 'What the Suno downloader supports',
            features: ['Accepts suno.com/s/ share links and suno.com/song/ song URLs.', 'Returns the MP4 video exposed by the public song page, when available.', 'Audio mode processes an available public audio source or extracts a video audio track in your browser.', 'Video downloads use a direct browser connection with extension and browser link alternatives when needed.', 'Available video, sound and quality depend on the source.'],
            sections: [{ title: 'Download Suno audio only', paragraphs: ['Paste a public Suno link, select Audio mode and choose a format. MP3 is the default; WAV, OGG, Opus and Best are also available.', sunoAudioCopy.en.limitation] }],
            supportedLinksTitle: 'Supported Suno links',
            supportedLinks: [{ title: 'Share link', description: 'Copy the link from the song share menu: suno.com/s/SHARE_CODE.' }, { title: 'Song page', description: 'Copy the individual suno.com/song/SONG_ID page URL.' }],
            faqTitle: 'Suno download questions',
            faqs: [
                { q: 'Can I download every Suno song?', a: sunoAudioCopy.en.all },
                { q: 'Can I download Suno songs as MP3 or WAV?', a: sunoAudioCopy.en.format },
                { q: 'Why did my Suno download fail?', a: 'Check that the link opens a public individual song and try again. A missing video, source restriction, expired resource or network problem may prevent a download.' },
                { q: 'Do I need to install an app?', a: 'No downloader app is required. The browser downloads the video directly and processes audio locally. Audio extraction requires a browser that can fetch and process the source; extension and direct-link handoff do not convert it to audio.' },
                { q: 'Does downloading grant commercial rights?', a: 'No. Downloading does not change your rights. Check Suno terms and obtain any permissions needed for your intended use.' },
            ],
            disclaimer: 'Download only material you own or have permission to save. FreeSaveVideo is independent of Suno.',
        },
    },
};
