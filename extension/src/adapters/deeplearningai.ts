import type { AdapterContext, AdapterResult, DetectedMedia, PlatformAdapter } from './types';
import { formatDurationLabel, getPreferredThumbnail, readJsonScriptById } from './utils';
import { normalizeUrl } from './runtime';

const DEEPLEARNINGAI_HOST_RE = /^learn\.deeplearning\.ai$/i;

type NextData = {
    props?: {
        pageProps?: {
            trpcState?: {
                json?: {
                    queries?: Array<{
                        queryKey?: unknown[];
                        state?: {
                            data?: unknown;
                        };
                    }>;
                };
            };
        };
    };
};

type CourseData = {
    name?: string;
    wpData?: {
        courseName?: string;
    };
    lessons?: Record<string, {
        name?: string;
        time?: number;
    }>;
};

type LessonVideoData = {
    video?: {
        videoId?: string;
        mp4360pUrl?: string;
        mp4Url?: string;
        webmUrl?: string;
        srcSet?: Array<{
            src?: string;
        }>;
    };
};

const getQueries = (document: Document) => {
    const data = readJsonScriptById<NextData>(document, '__NEXT_DATA__');
    const queries = data?.props?.pageProps?.trpcState?.json?.queries;
    return Array.isArray(queries) ? queries : [];
};

const getQueryData = <T>(queries: ReturnType<typeof getQueries>, queryName: string): T | undefined => {
    return queries.find((query) => {
        const key = query.queryKey?.[0];
        return Array.isArray(key) && key[0] === 'course' && key[1] === queryName;
    })?.state?.data as T | undefined;
};

const firstUrl = (pageUrl: string, ...values: Array<string | undefined>) => {
    for (const value of values) {
        const normalized = value ? normalizeUrl(value, pageUrl) : null;
        if (normalized) return normalized;
    }
    return undefined;
};

const lessonIdFromUrl = (pageUrl: string) => {
    try {
        const parts = new URL(pageUrl).pathname.split('/').filter(Boolean);
        const lessonIndex = parts.indexOf('lesson');
        return lessonIndex >= 0 ? parts[lessonIndex + 1] : undefined;
    } catch {
        return undefined;
    }
};

const mediaItem = (
    id: string,
    url: string,
    label: string,
    meta: Partial<DetectedMedia>,
): DetectedMedia => ({
    id,
    kind: meta.kind || 'video',
    url,
    label,
    source: 'adapter',
    format: meta.format,
    qualityLabel: meta.qualityLabel,
    thumbnailUrl: meta.thumbnailUrl,
    durationLabel: meta.durationLabel,
    filename: meta.filename,
    score: meta.score,
});

export const deeplearningaiAdapter: PlatformAdapter = {
    id: 'deeplearningai',
    label: 'DeepLearning.AI',
    matches(url) {
        return DEEPLEARNINGAI_HOST_RE.test(url.hostname);
    },
    scan(context: AdapterContext): AdapterResult {
        const queries = getQueries(context.document);
        const course = getQueryData<CourseData>(queries, 'getCourseBySlug');
        const lessonVideo = getQueryData<LessonVideoData>(queries, 'getLessonVideo');
        const video = lessonVideo?.video;
        const lessonId = lessonIdFromUrl(context.pageUrl);
        const lesson = lessonId ? course?.lessons?.[lessonId] : undefined;
        const courseName = course?.name || course?.wpData?.courseName || 'DeepLearning.AI';
        const lessonName = lesson?.name || context.pageTitle || 'Lesson video';
        const thumbnailUrl = getPreferredThumbnail(context.document, context.pageUrl);
        const durationLabel = formatDurationLabel(lesson?.time);
        const filename = `${courseName} - ${lessonName}.mp4`;

        const mp4Url = firstUrl(context.pageUrl, video?.mp4360pUrl);
        const hlsUrl = firstUrl(
            context.pageUrl,
            video?.mp4Url,
            video?.webmUrl,
            Array.isArray(video?.srcSet) ? video?.srcSet[0]?.src : undefined,
        );

        const media: DetectedMedia[] = [];
        if (mp4Url) {
            media.push(mediaItem('deeplearningai-mp4', mp4Url, `${lessonName} - 360p MP4`, {
                format: 'MP4',
                qualityLabel: '360p',
                thumbnailUrl,
                durationLabel,
                filename,
                score: 100,
            }));
        }
        if (hlsUrl && hlsUrl !== mp4Url) {
            media.push(mediaItem('deeplearningai-hls', hlsUrl, `${lessonName} - HLS stream`, {
                kind: 'playlist',
                format: 'M3U8',
                thumbnailUrl,
                durationLabel,
                filename,
                score: 80,
            }));
        }

        if (!media.length) {
            const fallback = context.genericScan();
            return {
                platform: 'deeplearningai',
                pageUrl: context.pageUrl,
                pageTitle: context.pageTitle,
                hostname: context.hostname,
                status: fallback.length ? 'fallbackOnly' : 'empty',
                media: fallback,
                warnings: fallback.length
                    ? ['DeepLearning.AI metadata was not available. Showing generic scan results instead.']
                    : ['No DeepLearning.AI lesson video was found on this page.'],
            };
        }

        return {
            platform: 'deeplearningai',
            pageUrl: context.pageUrl,
            pageTitle: context.pageTitle,
            hostname: context.hostname,
            status: 'ok',
            media,
        };
    },
};
