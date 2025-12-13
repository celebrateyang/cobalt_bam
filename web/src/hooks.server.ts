import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event);

    // Apply COOP/COEP headers to enable SharedArrayBuffer for libav
    // Exclude the guide page which contains a Bilibili iframe that would be blocked
    if (!event.url.pathname.includes('youtube-video-downloader')) {
        response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    }

    return response;
};
