import type { ComponentType, SvelteComponent } from 'svelte';
import { error } from '@sveltejs/kit';

import type { PageLoad } from './$types';

import type { DefaultImport } from '$lib/types/generic';
import { defaultLocale } from '$lib/i18n/translations';

const pages = import.meta.glob('$i18n/*/about/*.md');

export const load: PageLoad = async ({ params }) => {
    const getPage = (locale: string) => Object.keys(pages).find(
        file => file.endsWith(`${locale}/about/${params.page}.md`)
    );

    // Use the route language directly. During SSR/prerendering the locale store can
    // still contain the default locale, which previously embedded the English page
    // in localized routes such as /ja/about/privacy and /th/about/privacy.
    const componentPath = getPage(params.lang) || getPage(defaultLocale);
    if (componentPath) {
        type Component = ComponentType<SvelteComponent>;
        const componentImport = pages[componentPath] as DefaultImport<Component>;

        return { component: (await componentImport()).default }
    }

	error(404, 'Not found');
};

export const prerender = true;
