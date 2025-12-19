import type { RequestHandler } from './$types';

function getEnv(event: Parameters<RequestHandler>[0], name: string): string | undefined {
    const platformEnv = (event.platform as { env?: Record<string, string | undefined> } | undefined)?.env;
    if (platformEnv?.[name]) return platformEnv[name];
    if (typeof process !== 'undefined') return process.env[name];
    return undefined;
}

export const GET: RequestHandler = (event) => {
    const key = getEnv(event, 'INDEXNOW_KEY');

    if (!key || event.params.indexnowKey !== key) {
        return new Response('Not found', { status: 404 });
    }

    return new Response(`${key}\n`, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        }
    });
};
