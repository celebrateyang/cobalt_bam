<script lang="ts">
    import env from '$lib/env';

    export let data: {
        lang: string;
        pages: import('$lib/seo/learn-pages').LearnPage[];
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';
    const canonicalUrl = `https://${fallbackHost}/en/learn`;
    const pageTitle = 'FreeSaveVideo Learn: video saving, audio extraction, and troubleshooting';
    const pageDesc =
        'Practical FreeSaveVideo guides for saving public videos, extracting audio, preparing links, solving download errors, and using browser media tools safely.';

    $: itemListJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'FreeSaveVideo Learn',
        itemListElement: data.pages.map((page, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: page.title,
            url: `https://${fallbackHost}/en/learn/${page.slug}`,
        })),
    };
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta
        name="keywords"
        content="FreeSaveVideo learn, online video download guide, audio extraction guide, video download troubleshooting, public video download safety"
    />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og-share-v3.png`} />
    <script type="application/ld+json">
        {JSON.stringify(itemListJsonLd)}
    </script>
</svelte:head>

<main class="learn-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <section class="hero">
        <p class="eyebrow">Learn</p>
        <h1>Practical guides for public video saving and browser media tools</h1>
        <p class="lede">
            Concrete FreeSaveVideo notes for offline study, audio extraction, subtitles,
            link preparation, troubleshooting, Weibo video audio, and safer public-link use.
        </p>
        <div class="hero-links">
            <a href="/en">Open downloader</a>
            <a href="/en/download">Download directory</a>
            <a href="/en/guide">Platform guides</a>
            <a href="/capabilities.json">capabilities.json</a>
        </div>
    </section>

    <section class="article-grid" aria-label="Learn articles">
        {#each data.pages as article}
            <article class="article-card">
                <div>
                    <p class="meta">{article.category} / {article.readingTime}</p>
                    <h2><a href={`/en/learn/${article.slug}`}>{article.title}</a></h2>
                    <p>{article.description}</p>
                </div>
                <a class="read-link" href={`/en/learn/${article.slug}`}>Read guide</a>
            </article>
        {/each}
    </section>
</main>

<style>
    .learn-page {
        width: min(1080px, calc(100% - 32px));
        margin: 0 auto;
        padding: 18px 0 54px;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .hero,
    .article-card {
        background: var(--button);
        border: 1px solid var(--button-stroke);
        box-shadow: var(--button-box-shadow);
    }

    .hero {
        padding: 24px;
        border-radius: calc(var(--border-radius) * 1.25);
    }

    .eyebrow,
    .meta {
        margin: 0 0 8px;
        color: var(--subtext);
        font-size: 0.82rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    h1,
    h2 {
        margin: 0;
        color: var(--secondary);
        letter-spacing: 0;
    }

    h1 {
        max-width: 780px;
        font-size: clamp(28px, 4vw, 44px);
        line-height: 1.08;
    }

    h2 {
        font-size: 1.12rem;
        line-height: 1.35;
    }

    h2 a {
        color: inherit;
        text-decoration: none;
    }

    h2 a:hover {
        text-decoration: underline;
    }

    .lede,
    .article-card p {
        color: var(--secondary);
        opacity: 0.86;
        line-height: 1.65;
    }

    .lede {
        max-width: 760px;
        margin: 14px 0 0;
        font-size: 1rem;
    }

    .hero-links {
        margin-top: 18px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hero-links a,
    .read-link {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        font-weight: 700;
    }

    .hero-links a:hover,
    .read-link:hover {
        background: var(--button-hover);
    }

    .article-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 14px;
    }

    .article-card {
        min-height: 250px;
        padding: 18px;
        border-radius: calc(var(--border-radius) * 1.1);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 16px;
    }

    .article-card p:not(.meta) {
        margin: 10px 0 0;
    }
</style>
