import type { RequestHandler } from './$types';

import { buildLlmsFullText } from '$lib/seo/llms';

export const GET: RequestHandler = () =>
    new Response(buildLlmsFullText(), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });

export const prerender = true;

