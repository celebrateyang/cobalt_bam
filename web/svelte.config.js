import "dotenv/config";
import adapter from "@sveltejs/adapter-cloudflare";

import { mdsvex } from "mdsvex";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sveltePreprocess } from "svelte-preprocess";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://kit.svelte.dev/docs/integrations#preprocessors
    // for more information about preprocessors
    extensions: [".svelte", ".md"],
    preprocess: [
        {
            name: "strip-announcer",
            markup: ({ content: code }) => {
                code = code.replace(
                    /<div id="svelte-announcer" [\s\S]*?<\/div>/,
                    '<svelte:component this={null} />'
                );

                return { code }
            }
        },
        sveltePreprocess(),
        mdsvex({
            extensions: ['.md'],
            layout: {
                about: join(
                    dirname(fileURLToPath(import.meta.url)),
                    '/src/components/misc/AboutPageWrapper.svelte'
                ),
                changelogs: join(
                    dirname(fileURLToPath(import.meta.url)),
                    '/src/components/changelog/ChangelogEntryWrapper.svelte'
                )
            }
        })
    ],
    kit: {
        adapter: adapter(),
        // CSP disabled to allow third-party ad scripts like Adsterra
        // Configure CSP via Firebase hosting headers or server instead
        /* csp: {
            mode: "auto",
            directives: {
                "connect-src": ["*"],
                "default-src": ["none"],

                "font-src": ["self", "fonts.googleapis.com", "fonts.gstatic.com"],
                "style-src": ["self", "unsafe-inline", "fonts.googleapis.com"],
                "img-src": ["*", "data:"],
                "manifest-src": ["self"],
                "worker-src": ["self"],

                "object-src": ["none"],
                "frame-src": [
                    "self",
                    "challenges.cloudflare.com",
                    "www.googletagmanager.com",
                    "www.google-analytics.com",
                    "pagead2.googlesyndication.com",
                    "googleads.g.doubleclick.net",
                    "tpc.googlesyndication.com",
                    "www.google.com",
                    "https://ep2.adtrafficquality.google"
                ],

                "script-src": [
                    "self",
                    "unsafe-inline",
                    "wasm-unsafe-eval",
                    "challenges.cloudflare.com",
                    "www.googletagmanager.com",
                    "www.google-analytics.com",
                    "pagead2.googlesyndication.com",
                    "googleads.g.doubleclick.net",
                    "tpc.googlesyndication.com",
                    "www.google.com",
                    "https://ep2.adtrafficquality.google",
                    "pl27990830.effectivegatecpm.com",
                    // eslint-disable-next-line no-undef
                    process.env.WEB_PLAUSIBLE_HOST ? process.env.WEB_PLAUSIBLE_HOST : ""
                ],

                "frame-ancestors": ["none"]
            }
        }, */
        env: {
            publicPrefix: 'WEB_'
        },
        version: {
            pollInterval: 60000
        },
        paths: {
            relative: false
        },
        alias: {
            $components: 'src/components',
            $i18n: 'i18n',
        }
    }
};

export default config;
