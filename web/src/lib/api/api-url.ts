import env from "$lib/env";
import { get } from "svelte/store";
import settings from "$lib/state/settings";

export const currentApiURL = () => {
    const processingSettings = get(settings).processing;
    const customInstanceURL = processingSettings.customInstanceURL;

    if (processingSettings.enableCustomInstances && customInstanceURL.length > 0) {
        return new URL(customInstanceURL).origin;
    }

    // If env.DEFAULT_API is set (from .env.development or .env.production), use it.
    if (env.DEFAULT_API) {
        const apiOrigin = new URL(env.DEFAULT_API).origin;

        // In development mode, use proxy path if API is local
        // This avoids CORS issues when dev server is on different port
        if (import.meta.env.DEV && isLocalURL(apiOrigin)) {
            return '/api';
        }

        return apiOrigin;
    }

    // Final fallback if env.DEFAULT_API is not configured
    return "https://api.freesavevideo.online";
}

// Helper function to check if URL is localhost/local network
const isLocalURL = (url: string) => {
    return url.includes('localhost') ||
        url.includes('127.0.0.1') ||
        url.match(/192\.168\.\d+\.\d+/) ||
        url.match(/10\.\d+\.\d+\.\d+/) ||
        url.match(/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/);
}
