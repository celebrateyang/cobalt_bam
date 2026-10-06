import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveYtDlpCommand } from './services/youtube.js';

const execute = promisify(execFile);
const RESULT_LIMIT = 12;
const CACHE_TTL_MS = 180_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export class YouTubeSearchError extends Error {
    constructor(code, status = 503) {
        super(code);
        this.code = code;
        this.status = status;
    }
}

export function validateSearchQuery(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new YouTubeSearchError('error.api.youtube.search.invalid_query', 400);
    }
    const query = value.trim().replace(/\s+/gu, ' ');
    if (query.length < 2 || query.length > 120 || /https?:\/\//i.test(query)) {
        throw new YouTubeSearchError('error.api.youtube.search.invalid_query', 400);
    }
    return query;
}

export function normalizeSearchResults(data) {
    const seen = new Set();
    return (Array.isArray(data?.entries) ? data.entries : [])
        .filter(entry => {
            if (typeof entry?.id !== 'string' || !ID_PATTERN.test(entry.id) || seen.has(entry.id)) return false;
            if (entry.live_status === 'is_live' || entry.live_status === 'is_upcoming') return false;
            seen.add(entry.id);
            return true;
        })
        .slice(0, RESULT_LIMIT)
        .map(entry => ({
            id: entry.id,
            url: `https://www.youtube.com/watch?v=${entry.id}`,
            title: String(entry.title || entry.id).slice(0, 300),
            channel: String(entry.channel || entry.uploader || '').slice(0, 150),
            duration: Number.isFinite(entry.duration) && entry.duration >= 0 ? entry.duration : null,
            thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
        }));
}

async function runSearch(query) {
    const runner = await resolveYtDlpCommand();
    if (!runner) throw new YouTubeSearchError('error.api.youtube.search.unavailable');
    try {
        const { stdout } = await execute(runner.command, [
            ...runner.prefixArgs,
            '--ignore-config', '--flat-playlist', '--dump-single-json',
            '--skip-download', '--no-warnings', '--force-ipv4',
            '--socket-timeout', '10', '--retries', '0',
            '--', `ytsearch${RESULT_LIMIT}:${query}`,
        ], { timeout: 25_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
        return normalizeSearchResults(JSON.parse(stdout));
    } catch (error) {
        throw new YouTubeSearchError(error.killed
            ? 'error.api.youtube.search.timeout'
            : 'error.api.youtube.search.unavailable');
    }
}

// Bound work per instance; identical concurrent searches share one process.
export function createYouTubeSearch({ run = runSearch, now = Date.now, maxConcurrent = 2 } = {}) {
    const cache = new Map();
    const pending = new Map();
    return async value => {
        const query = validateSearchQuery(value);
        const key = query.toLowerCase();
        const cached = cache.get(key);
        if (cached && cached.expires > now()) return { status: 'ok', query, items: cached.items };
        if (pending.has(key)) return { status: 'ok', query, items: await pending.get(key) };
        if (pending.size >= maxConcurrent) {
            throw new YouTubeSearchError('error.api.youtube.search.busy', 429);
        }
        const work = Promise.resolve().then(() => run(query));
        pending.set(key, work);
        try {
            const items = await work;
            for (const [entryKey, value] of cache) {
                if (value.expires <= now()) cache.delete(entryKey);
            }
            if (cache.size >= 100) cache.delete(cache.keys().next().value);
            cache.set(key, { items, expires: now() + CACHE_TTL_MS });
            return { status: 'ok', query, items };
        } finally {
            pending.delete(key);
        }
    };
}

export const searchYouTube = createYouTubeSearch();
