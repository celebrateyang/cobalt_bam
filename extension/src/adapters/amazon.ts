import { isAmazonMediaUrl } from '@freesavevideo/amazon-direct/hls';
import type { PlatformAdapter } from './types';

export const amazonAdapter: PlatformAdapter = {
    id: 'amazon', label: 'Amazon Live',
    matches: url => /^(www\.)?amazon\.com$/i.test(url.hostname) && /^\/(?:live\/video|vdp)\//.test(url.pathname),
    scan(context) {
        const media = context.genericScan().filter(item => isAmazonMediaUrl(item.url));
        const walk = (value: unknown) => {
            if (Array.isArray(value)) { value.forEach(walk); return; }
            if (!value || typeof value !== 'object') return;
            const entry = value as Record<string, unknown>;
            if (typeof entry.contentUrl === 'string' && isAmazonMediaUrl(entry.contentUrl) && !media.some(item => item.url === entry.contentUrl)) {
                const title = typeof entry.name === 'string' ? entry.name : context.pageTitle;
                media.push({ id: `amazon-${media.length}`, kind: 'video', source: 'adapter', url: entry.contentUrl,
                    label: title, filename: `${title}.mp4`, format: 'HLS', sourcePageUrl: context.pageUrl });
            }
            if (entry['@graph']) walk(entry['@graph']);
        };
        for (const script of context.document.querySelectorAll('script[type="application/ld+json"]')) {
            try { walk(JSON.parse(script.textContent || '')); } catch { /* Ignore unrelated metadata. */ }
        }
        return { platform: 'amazon', pageUrl: context.pageUrl, pageTitle: context.pageTitle, hostname: context.hostname,
            status: media.length ? 'ok' : 'empty', media,
            warnings: media.length ? [] : ['No public Amazon replay was found. Play the video and scan again.'] };
    },
};
