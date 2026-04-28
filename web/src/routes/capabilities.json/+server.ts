import type { RequestHandler } from './$types';

import { capabilityPayload } from '$lib/seo/capabilities';

export const GET: RequestHandler = () =>
    new Response(JSON.stringify(capabilityPayload, null, 2), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });

export const prerender = true;
