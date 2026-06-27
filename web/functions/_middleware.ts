const aiReferrerPatterns = [
    /(^|\.)chatgpt\.com$/i,
    /(^|\.)openai\.com$/i,
    /(^|\.)claude\.ai$/i,
    /(^|\.)anthropic\.com$/i,
    /(^|\.)gemini\.google\.com$/i,
    /(^|\.)perplexity\.ai$/i,
    /(^|\.)copilot\.microsoft\.com$/i,
    /(^|\.)bing\.com$/i,
];

const aiCrawlerPattern =
    /OAI-SearchBot|ChatGPT-User|GPTBot|ClaudeBot|Claude-SearchBot|anthropic-ai|PerplexityBot|Google-Extended|Googlebot|bingbot|BingPreview/i;

const getReferrerHost = (value: string | null) => {
    if (!value) return '';
    try {
        return new URL(value).hostname;
    } catch {
        return '';
    }
};

const isAiReferrer = (host: string) =>
    aiReferrerPatterns.some((pattern) => pattern.test(host));

export const onRequest: PagesFunction = async ({ request, next }) => {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || request.headers.get('referrer');
    const referrerHost = getReferrerHost(referrer);
    const crawlerMatch = ua.match(aiCrawlerPattern)?.[0] || '';

    if (crawlerMatch || isAiReferrer(referrerHost)) {
        console.log(
            JSON.stringify({
                event: 'ai_visibility_request',
                path: url.pathname,
                referrerHost,
                crawler: crawlerMatch,
                userAgent: ua.slice(0, 180),
            }),
        );
    }

    return next();
};
