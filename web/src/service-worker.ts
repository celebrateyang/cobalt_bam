/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

const ASSETS = [
    ...build, // the app itself
    ...files  // everything in `static`
].filter((path) => path !== '/404.html');

self.addEventListener('install', (event) => {
    // Create a new cache and add all files to it
    async function addFilesToCache() {
        const cache = await caches.open(CACHE);

        // cache.addAll fails the whole install if any single request is not OK (e.g. redirects/404)
        try {
            await cache.addAll(ASSETS);
        } catch (error) {
            console.warn('[service-worker] precache failed, falling back to best-effort', error);

            await Promise.allSettled(
                ASSETS.map(async (asset) => {
                    try {
                        const res = await fetch(asset, { redirect: 'follow' });
                        if (res.ok) {
                            await cache.put(asset, res.clone());
                        }
                    } catch {}
                }),
            );
        }
    }

    self.skipWaiting();
    event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
    // Remove previous caches
    async function deleteOldCaches() {
        for (const key of await caches.keys()) {
            if (key !== CACHE) await caches.delete(key);
        }
    }

    event.waitUntil(deleteOldCaches());
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // ignore POST requests etc
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    // Ignore non-HTTP(S) schemes and cross-origin requests entirely
    if (!(url.protocol === 'http:' || url.protocol === 'https:') || url.origin !== self.location.origin) {
        return;
    }

    // Documents and SvelteKit data responses must always come from the active
    // deployment. Serving an older cached HTML document after a release can
    // make it reference chunks that no longer belong to the same build, which
    // turns an otherwise valid route into the global error page.
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        return;
    }

    // Only immutable build/static assets are safe to serve cache-first. Other
    // same-origin GET requests (API-style routes, page data, sitemap, etc.) use
    // the browser's normal network behavior and cannot become stale here.
    if (!ASSETS.includes(url.pathname)) {
        return;
    }

    async function respond() {
        const cache = await caches.open(CACHE);

        const cached = await cache.match(event.request);
        if (cached) {
            return cached;
        }

        // If cache installation was incomplete, fetch and repair this asset.
        const response = await fetch(event.request);
        if (response.status === 200) {
            cache.put(event.request, response.clone());
        }
        return response;
    }

    event.respondWith(respond());
});
