import { get } from 'svelte/store';
import { page } from '$app/stores';
import { INTERNAL_locale } from './translations';

/**
 * Generate a localized URL with the current language prefix
 * @param path - The path without language prefix (e.g., '/settings', '/about')
 * @returns The full path with language prefix (e.g., '/en/settings', '/zh/about')
 */
export function localizedPath(path: string): string {
    const locale = get(INTERNAL_locale);
    
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    
    // Return the path with language prefix
    return `/${locale}${cleanPath ? '/' + cleanPath : ''}`;
}

/**
 * Get the current locale from the URL
 * @param pathname - The current pathname from $page.url.pathname
 * @returns The current locale (e.g., 'en', 'zh', 'th', 'ru')
 */
export function getCurrentLocaleFromPath(pathname: string): string {
    const match = pathname.match(/^\/([a-z]{2})/);
    return match ? match[1] : 'en';
}

/**
 * Remove the language prefix from a path
 * @param pathname - The pathname with language prefix
 * @returns The path without language prefix
 */
export function removeLocalePrefix(pathname: string): string {
    return pathname.replace(/^\/[a-z]{2}/, '') || '/';
}
