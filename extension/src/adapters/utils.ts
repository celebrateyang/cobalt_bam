import { normalizeUrl } from '../shared/url';

export const dedupeBy = <T>(items: T[], keyFor: (item: T) => string | null | undefined) => {
    const seen = new Set<string>();
    const next: T[] = [];

    for (const item of items) {
        const key = keyFor(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        next.push(item);
    }

    return next;
};

export const formatDurationLabel = (value: unknown): string | undefined => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    const totalSeconds = numeric > 1000 ? Math.round(numeric / 1000) : Math.round(numeric);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const getMetaContent = (document: Document, selector: string): string | undefined => {
    const value = document.querySelector<HTMLMetaElement>(selector)?.content?.trim();
    return value || undefined;
};

export const getPosterThumbnail = (document: Document, pageUrl: string): string | undefined => {
    const poster = document.querySelector<HTMLVideoElement>('video[poster]')?.poster;
    return poster ? normalizeUrl(poster, pageUrl) ?? undefined : undefined;
};

export const getPreferredThumbnail = (document: Document, pageUrl: string): string | undefined => {
    const candidates = [
        getMetaContent(document, 'meta[property="og:image"]'),
        getMetaContent(document, 'meta[name="twitter:image"]'),
        getPosterThumbnail(document, pageUrl),
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const normalized = normalizeUrl(candidate, pageUrl);
        if (normalized) return normalized;
    }

    return undefined;
};

export const safeJsonParse = <T>(value: string): T | null => {
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
};

const extractBalancedValue = (source: string, startIndex: number) => {
    let index = startIndex;
    while (index < source.length && /\s/.test(source[index])) index += 1;
    const first = source[index];
    if (!first) return null;

    if (first === '"' || first === "'") {
        const quote = first;
        let escaped = false;
        for (let cursor = index + 1; cursor < source.length; cursor += 1) {
            const char = source[cursor];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === quote) {
                return source.slice(index, cursor + 1);
            }
        }
        return null;
    }

    if (first !== '{' && first !== '[') {
        const tail = source.slice(index).split(';')[0]?.trim();
        return tail || null;
    }

    const stack = [first];
    let inString = false;
    let stringQuote = '';
    let escaped = false;

    for (let cursor = index + 1; cursor < source.length; cursor += 1) {
        const char = source[cursor];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === stringQuote) {
                inString = false;
                stringQuote = '';
            }
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringQuote = char;
            continue;
        }

        if (char === '{' || char === '[') {
            stack.push(char);
            continue;
        }

        if (char === '}' || char === ']') {
            const opener = stack.pop();
            if (!opener) return null;
            if ((opener === '{' && char !== '}') || (opener === '[' && char !== ']')) {
                return null;
            }
            if (stack.length === 0) {
                return source.slice(index, cursor + 1);
            }
        }
    }

    return null;
};

export const findAssignedValue = (source: string, markers: string[]) => {
    for (const marker of markers) {
        const index = source.indexOf(marker);
        if (index === -1) continue;
        const value = extractBalancedValue(source, index + marker.length);
        if (value) return value;
    }
    return null;
};

export const parseAssignedJson = <T>(
    source: string,
    markers: string[],
    options: { decodeUriComponent?: boolean } = {},
): T | null => {
    const raw = findAssignedValue(source, markers);
    if (!raw) return null;

    if (options.decodeUriComponent) {
        const encoded = safeJsonParse<string>(raw);
        if (typeof encoded === 'string') {
            try {
                return JSON.parse(decodeURIComponent(encoded)) as T;
            } catch {
                return null;
            }
        }
    }

    return safeJsonParse<T>(raw);
};

export const readAssignedJsonFromScripts = <T>(
    document: Document,
    markers: string[],
    options: { decodeUriComponent?: boolean } = {},
): T | null => {
    const scripts = [...document.querySelectorAll<HTMLScriptElement>('script')];
    for (const script of scripts) {
        const text = script.textContent;
        if (!text) continue;
        const parsed = parseAssignedJson<T>(text, markers, options);
        if (parsed) return parsed;
    }
    return null;
};

export const readJsonScriptById = <T>(document: Document, id: string): T | null => {
    const text = document.getElementById(id)?.textContent;
    if (!text) return null;
    return safeJsonParse<T>(text);
};

export const readJsonLdScripts = <T>(document: Document): T[] => {
    return [...document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')]
        .map((script) => safeJsonParse<T>(script.textContent || ''))
        .filter((value): value is T => value !== null);
};

export const findJsonObjectByProperty = <T>(source: string, propertyNames: string[]): T | null => {
    for (const propertyName of propertyNames) {
        const patterns = [
            `"${propertyName}":`,
            `"${propertyName}" :`,
            `${propertyName}:`,
        ];

        for (const pattern of patterns) {
            const index = source.indexOf(pattern);
            if (index === -1) continue;
            const value = extractBalancedValue(source, index + pattern.length);
            if (!value) continue;
            const parsed = safeJsonParse<T>(value);
            if (parsed) return parsed;
        }
    }

    return null;
};

export const visitObject = (value: unknown, visitor: (node: unknown) => void) => {
    const queue = [value];
    const seen = new Set<unknown>();

    while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== 'object' || seen.has(current)) continue;
        seen.add(current);
        visitor(current);
        if (Array.isArray(current)) {
            queue.push(...current);
            continue;
        }
        queue.push(...Object.values(current as Record<string, unknown>));
    }
};

export const collectUrlsFromObject = (value: unknown, pageUrl: string, matcher?: (url: string) => boolean) => {
    const urls: string[] = [];
    visitObject(value, (node) => {
        if (Array.isArray(node)) {
            for (const entry of node) {
                if (typeof entry !== 'string') continue;
                const normalized = normalizeUrl(entry, pageUrl);
                if (!normalized) continue;
                if (matcher && !matcher(normalized)) continue;
                urls.push(normalized);
            }
            return;
        }

        for (const entry of Object.values(node as Record<string, unknown>)) {
            if (typeof entry !== 'string') continue;
            const normalized = normalizeUrl(entry, pageUrl);
            if (!normalized) continue;
            if (matcher && !matcher(normalized)) continue;
            urls.push(normalized);
        }
    });
    return dedupeBy(urls, (url) => url);
};
