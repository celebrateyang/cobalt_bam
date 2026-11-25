import type { LearnPage } from './learn-pages';
import { getLearnSeoLanguages } from './learn-locales';
import zh from './alternative-locales/zh.json';
import de from './alternative-locales/de.json';
import es from './alternative-locales/es.json';
import fr from './alternative-locales/fr.json';
import ja from './alternative-locales/ja.json';
import ko from './alternative-locales/ko.json';
import ru from './alternative-locales/ru.json';
import th from './alternative-locales/th.json';
import vi from './alternative-locales/vi.json';
import id from './alternative-locales/id.json';

const englishUi = {
    home: 'Home', learn: 'Learn', updated: 'Updated', quick: 'Quick answer', toc: 'On this page',
    compare: 'At a glance', faq: 'Common questions', sources: 'Sources and verification',
    more: 'Find your next step', all: 'All guides', read: 'Read guide', open: 'Open downloader',
    paste: 'Paste a public video link', continue: 'Continue', hint: 'Opens FreeSaveVideo with your link ready to process.',
    how: 'See how it works', note: 'No pop-up ads. No ad clicks. Clear saving steps.',
    formats: 'Available formats depend on the source', choose: 'Choose', save: 'Save',
    permission: 'Choose a public video you own or have permission to save.',
    hubTitle: 'Practical guides for public video saving and browser media tools',
    hubDesc: 'Practical FreeSaveVideo guides for saving public videos, extracting audio, preparing links, and solving download errors.',
    directory: 'Download directory', guides: 'Platform guides', minutes: '5 min read', category: 'Downloader comparison',
    needs: 'Need', workflow: 'FreeSaveVideo workflow', video: 'Video', audio: 'Audio', playlist: 'Playlist',
};
type LocaleCopy = {
    ui: typeof englishUi;
    cobalt: { title: string; description: string; summary: string; sections: string[][]; faqs: string[][] };
    savefrom: { title: string; description: string; summary: string; sections: string[][]; faqs: string[][] };
    capability: { video: string; audio: string; playlist: string; saving: string; limits: string; source: string };
};
const copies: Record<string, LocaleCopy> = { zh, de, es, fr, ja, ko, ru, th, vi, id };
export const getAlternativeUi = (lang = 'en') => copies[lang]?.ui ?? englishUi;

export const localizeAlternative = (base: LearnPage, lang: string): LearnPage | undefined => {
    if (!getLearnSeoLanguages(base.slug).includes(lang)) return undefined;
    if (lang === 'en') return base;
    const copy = copies[lang];
    if (!copy) return undefined;
    const cobalt = base.slug === 'cobalt-tools-alternative';
    const content = cobalt ? copy.cobalt : copy.savefrom;
    const u = copy.ui;
    return {
        slug: base.slug, updatedAt: base.updatedAt, title: content.title, description: content.description,
        summary: content.summary, readingTime: u.minutes, category: u.category,
        keyTakeaways: [u.note, copy.capability.playlist, copy.capability.limits],
        sections: content.sections.map(([heading, ...body]) => ({ heading, body })),
        table: { headers: [u.needs, u.workflow], rows: [
            [u.video, copy.capability.video], [u.audio, copy.capability.audio],
            [u.playlist, copy.capability.playlist], [u.save, copy.capability.saving],
        ] },
        faqs: content.faqs.map(([q, a]) => ({ q, a })),
        relatedArticles: [cobalt ? 'savefrom-alternative' : 'cobalt-tools-alternative'],
        relatedDownloads: ['youtube-download'], relatedGuides: [],
        alternativeLanding: { name: content.title, intro: content.summary, downloadHref: `/${lang}`, action: u.open },
        workflows: [
            { title: u.video, description: copy.capability.video, href: `/${lang}/download/youtube-download`, action: u.open },
            { title: u.audio, description: copy.capability.audio, href: `/${lang}`, action: u.open },
            { title: u.playlist, description: copy.capability.playlist, href: `/${lang}`, action: u.open },
        ],
        sources: cobalt
            ? [{ title: 'Cobalt.tools API', href: 'https://api.cobalt.tools/', note: copy.capability.source }]
            : [
                { title: u.directory, href: `/${lang}/download`, note: copy.capability.limits },
                { title: 'yt-dlp', href: 'https://github.com/yt-dlp/yt-dlp', note: u.guides },
                { title: '4K Video Downloader', href: 'https://www.4kdownload.com/products/videodownloader-42', note: u.guides },
            ],
        keywords: [cobalt ? 'cobalt.tools alternative' : 'savefrom.net alternative', content.title, 'FreeSaveVideo'],
    };
};
