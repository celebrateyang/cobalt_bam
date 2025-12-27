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

    async function respond() {
        const cache = await caches.open(CACHE);

        // `build`/`files` can always be served from the cache
        if (ASSETS.includes(url.pathname)) {
            const cached = await cache.match(event.request);
            if (cached) {
                return cached;
            }

            // If cache was cleared or install didn't fully cache, fall back to network.
            const response = await fetch(event.request);
            if (response.status === 200) {
                cache.put(event.request, response.clone());
            }
            return response;
        }

        // for everything else, try the network first, but
        // fall back to the cache if we're offline
        try {
            const response = await fetch(event.request);

            if (response.status === 200) {
                cache.put(event.request, response.clone());
            }

            return response;
        } catch {
            return cache.match(event.request);
        }
    }

    event.respondWith(respond());
});
