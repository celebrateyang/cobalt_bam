import { json, type RequestHandler } from '@sveltejs/kit';

function getEnv(event: Parameters<RequestHandler>[0], name: string): string | undefined {
    const platformEnv = (event.platform as { env?: Record<string, string | undefined> } | undefined)?.env;
    if (platformEnv?.[name]) return platformEnv[name];
    if (typeof process !== 'undefined') return process.env[name];
    return undefined;
}

function unescapeXml(value: string): string {
    return value
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'");
}

function extractSitemapUrls(xml: string): string[] {
    const urls = new Set<string>();
    const locRe = /<loc>([\s\S]*?)<\/loc>/g;

    for (const match of xml.matchAll(locRe)) {
        const loc = unescapeXml(match[1].trim());
        if (loc) urls.add(loc);
    }

    return [...urls];
}

function chunk<T>(items: T[], max: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += max) out.push(items.slice(i, i + max));
    return out;
}

async function safeReadText(response: Response): Promise<string | null> {
    try {
        return await response.text();
    } catch {
        return null;
    }
}

export const POST: RequestHandler = async (event) => {
    const token = getEnv(event, 'INDEXNOW_SUBMIT_TOKEN');
    if (token) {
        const auth = event.request.headers.get('authorization') ?? '';
        const q = event.url.searchParams.get('token') ?? '';
        const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
        if (bearer !== token && q !== token) {
            return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
        }
    }

    const key = getEnv(event, 'INDEXNOW_KEY');
    if (!key) return json({ ok: false, error: 'Missing INDEXNOW_KEY' }, { status: 500 });

    const origin = getEnv(event, 'INDEXNOW_ORIGIN') ?? event.url.origin;
    const host = getEnv(event, 'INDEXNOW_HOST') ?? new URL(origin).hostname;
    const keyLocation =
        getEnv(event, 'INDEXNOW_KEY_LOCATION') ?? `${new URL(origin).origin}/${key}.txt`;
    const sitemapUrl =
        getEnv(event, 'INDEXNOW_SITEMAP_URL') ?? `${new URL(origin).origin}/sitemap.xml`;

    const sitemapRes = await fetch(sitemapUrl, {
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' }
    });
    if (!sitemapRes.ok) {
        return json(
            {
                ok: false,
                error: 'Failed to fetch sitemap.xml',
                sitemapUrl,
                status: sitemapRes.status,
                body: await safeReadText(sitemapRes)
            },
            { status: 502 }
        );
    }

    const sitemapXml = await sitemapRes.text();
    const urls = extractSitemapUrls(sitemapXml);
    if (urls.length === 0) {
        return json({ ok: false, error: 'No URLs found in sitemap.xml', sitemapUrl }, { status: 400 });
    }

    const groups = chunk(urls, 10_000);
    const results: Array<{ index: number; count: number; status: number; ok: boolean; body?: string | null }> = [];

    for (let i = 0; i < groups.length; i++) {
        const body = {
            host,
            key,
            keyLocation,
            urlList: groups[i]
        };

        const res = await fetch('https://api.indexnow.org/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(body)
        });

        results.push({
            index: i,
            count: groups[i].length,
            status: res.status,
            ok: res.ok,
            body: res.ok ? null : await safeReadText(res)
        });

        if (!res.ok) {
            return json(
                {
                    ok: false,
                    error: 'IndexNow submission failed',
                    host,
                    keyLocation,
                    sitemapUrl,
                    submitted: results
                },
                { status: 502 }
            );
        }
    }

    return json({
        ok: true,
        host,
        keyLocation,
        sitemapUrl,
        totalUrls: urls.length,
        chunks: results
    });
};

