import type { DownloadPlatform } from './platform-download-landings';

/** Accept one specific source page, never arbitrary hosts, feeds or media URLs. */
export function parsePlatformDownloadInput(platform: DownloadPlatform, input: string): string | null {
    const matches = input.trim().match(/https?:\/\/[^\s<>"']+/gi) ?? [];
    if (matches.length !== 1) return null;
    try {
        const url = new URL(matches[0]);
        if (url.username || url.password || url.port) return null;
        const host = url.hostname.toLowerCase();
        const path = url.pathname;
        let valid = false;
        switch (platform) {
            case 'rutube':
                valid = ['rutube.ru', 'www.rutube.ru'].includes(host)
                    && /^\/(?:video|shorts|play\/embed)\/[a-f0-9]{32}\/?$/i.test(path);
                break;
            case 'bluesky':
                valid = ['bsky.app', 'www.bsky.app'].includes(host)
                    && /^\/profile\/(?:[a-z0-9.-]{1,128}|did:(?:plc|web):[a-z0-9._:%-]{1,110})\/post\/[a-z0-9]{1,128}\/?$/i.test(path);
                break;
            case 'vk':
                valid = ['vk.com', 'vk.ru', 'vkvideo.ru', 'www.vk.com', 'www.vk.ru', 'www.vkvideo.ru', 'm.vk.com', 'm.vk.ru', 'm.vkvideo.ru'].includes(host)
                    && /^\/(?:video|clip)-?[0-9]{1,10}_[0-9]{1,10}(?:_[a-z0-9]{1,18})?\/?$/i.test(path);
                break;
            case 'threads':
                valid = ['threads.com', 'threads.net', 'www.threads.com', 'www.threads.net'].includes(host)
                    && /^\/(?:@[a-z0-9._]{1,64}\/post|t)\/[a-z0-9_-]{1,64}\/?$/i.test(path);
                break;
            case 'streamable':
                valid = ['streamable.com', 'www.streamable.com'].includes(host)
                    && /^\/(?:[eos]\/)?[a-z0-9]{1,6}\/?$/i.test(path)
                    && !/^\/(?:login|signup|upload|videos|terms|about|blog|help)\/?$/i.test(path);
                break;
            case 'twitch':
                valid = (host === 'clips.twitch.tv' && /^\/[a-z0-9_-]{1,100}\/?$/i.test(path) && !/^\/embed\/?$/i.test(path))
                    || (['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(host)
                        && /^\/[a-z0-9_]{1,25}\/clip\/[a-z0-9_-]{1,100}\/?$/i.test(path));
                break;
        }
        if (!valid) return null;
        url.protocol = 'https:';
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

export function getPlatformFormCopy(lang: string) {
    return lang === 'ru' ? {
        label: 'Ссылка на видео или клип', action: 'Подготовить загрузку', busy: 'Подготовка...',
        invalid: 'Вставьте одну ссылку на отдельное публичное видео этой платформы. Профили, ленты и прямые медиаадреса не принимаются.',
        started: 'Запрос подготовлен. Завершите выбор медиа и следите за обработкой и сохранением.',
        error: 'Не удалось начать загрузку. Проверьте исходный ролик и повторите попытку.',
        hint: 'Используйте полную ссылку на исходную страницу. Качество и доступность зависят от источника.',
    } : {
        label: 'Video or post link', action: 'Prepare download', busy: 'Preparing...',
        invalid: 'Paste one specific public video, post or Clip link from this platform. Profiles, feeds and direct media resources are not accepted.',
        started: 'Media request prepared. Follow the media selection or download progress to finish saving.',
        error: 'The download could not be started. Check the original source and try again.',
        hint: 'Use the complete source page link. Quality and availability depend on the source.',
    };
}
