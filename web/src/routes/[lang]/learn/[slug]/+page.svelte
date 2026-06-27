<script lang="ts">
    import env from '$lib/env';
    import { getSeoLandingLocale, getSeoLandingPage } from '$lib/seo/landing-pages';

    export let data: {
        lang: string;
        article: import('$lib/seo/learn-pages').LearnPage;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: canonicalUrl = `https://${fallbackHost}/en/learn/${data.article.slug}`;
    $: relatedDownloads = data.article.relatedDownloads
        .map((slug) => {
            const page = getSeoLandingPage(slug);
            if (!page) return null;
            const locale = getSeoLandingLocale(page, 'en');
            return {
                slug,
                title: locale.h1,
                description: locale.metaDescription,
            };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    $: articleJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: data.article.title,
        description: data.article.description,
        dateModified: data.article.updatedAt,
        datePublished: data.article.updatedAt,
        inLanguage: 'en',
        mainEntityOfPage: canonicalUrl,
        author: {
            '@type': 'Organization',
            name: 'FreeSaveVideo',
            url: `https://${fallbackHost}/en`,
        },
        publisher: {
            '@type': 'Organization',
            name: 'FreeSaveVideo',
            url: `https://${fallbackHost}/en`,
        },
        about: data.article.keywords,
    };
    $: faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: data.article.faqs.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
            },
        })),
    };
    $: breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: `https://${fallbackHost}/en`,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: 'Learn',
                item: `https://${fallbackHost}/en/learn`,
            },
            {
                '@type': 'ListItem',
                position: 3,
                name: data.article.title,
                item: canonicalUrl,
            },
        ],
    };
    $: structuredData = [articleJsonLd, faqJsonLd, breadcrumbJsonLd];
</script>

<svelte:head>
    <title>{data.article.title} - FreeSaveVideo Learn</title>
    <meta name="description" content={data.article.description} />
    <meta name="keywords" content={data.article.keywords.join(',')} />
    <meta property="og:title" content={data.article.title} />
    <meta property="og:description" content={data.article.description} />
    <meta property="og:type" content="article" />
    <meta property="article:modified_time" content={data.article.updatedAt} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={data.article.title} />
    <meta name="twitter:description" content={data.article.description} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og-share-v3.png`} />
    {#each structuredData as ld}
        {@html `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}
    {/each}
</svelte:head>

<main class="article-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/en">Home</a>
        <span>/</span>
        <a href="/en/learn">Learn</a>
        <span>/</span>
        <span>{data.article.category}</span>
    </nav>

    <article class="article">
        <header class="hero">
            <p class="eyebrow">{data.article.category} / {data.article.readingTime}</p>
            <h1>{data.article.title}</h1>
            <p class="summary">{data.article.summary}</p>
            <p class="updated">Updated {data.article.updatedAt}</p>
        </header>

        <section class="answer-block">
            <h2>Quick answer</h2>
            <p>{data.article.summary}</p>
            <ul>
                {#each data.article.keyTakeaways as item}
                    <li>{item}</li>
                {/each}
            </ul>
        </section>

        {#each data.article.sections as section}
            <section class="content-section">
                <h2>{section.heading}</h2>
                {#each section.body as paragraph}
                    <p>{paragraph}</p>
                {/each}
                {#if section.bullets?.length}
                    <ul>
                        {#each section.bullets as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {/each}

        {#if data.article.table}
            <section class="content-section">
                <h2>Reference table</h2>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                {#each data.article.table.headers as header}
                                    <th>{header}</th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.article.table.rows as row}
                                <tr>
                                    {#each row as cell}
                                        <td>{cell}</td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </section>
        {/if}

        <section class="content-section">
            <h2>FAQ</h2>
            <div class="faq-list">
                {#each data.article.faqs as item}
                    <details>
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>
    </article>

    <aside class="related">
        <section>
            <h2>Use FreeSaveVideo</h2>
            <p>
                Open the browser downloader, choose the right public link, then use direct
                save, queue mode, audio options, or local conversion depending on the task.
            </p>
            <div class="related-links">
                <a class="primary" href="/en">Open downloader</a>
                <a href="/en/remux">Audio extractor</a>
                <a href="/en/download">Download directory</a>
            </div>
        </section>

        {#if relatedDownloads.length}
            <section>
                <h2>Related downloader pages</h2>
                <div class="download-links">
                    {#each relatedDownloads as item}
                        <a href={`/en/download/${item.slug}`}>
                            <strong>{item.title}</strong>
                            <span>{item.description}</span>
                        </a>
                    {/each}
                </div>
            </section>
        {/if}
    </aside>
</main>

<style>
    .article-page {
        width: min(1080px, calc(100% - 32px));
        margin: 0 auto;
        padding: 14px 0 54px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 18px;
        align-items: start;
    }

    .crumbs {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--subtext);
        font-size: 0.9rem;
    }

    .crumbs a {
        color: var(--secondary);
        text-decoration: none;
    }

    .crumbs a:hover {
        text-decoration: underline;
    }

    .article,
    .related {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .hero,
    .answer-block,
    .content-section,
    .related section {
        background: var(--button);
        border: 1px solid var(--button-stroke);
        box-shadow: var(--button-box-shadow);
        border-radius: calc(var(--border-radius) * 1.1);
        padding: 20px;
    }

    .eyebrow,
    .updated {
        margin: 0 0 10px;
        color: var(--subtext);
        font-size: 0.84rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .updated {
        margin: 14px 0 0;
    }

    h1,
    h2 {
        color: var(--secondary);
        letter-spacing: 0;
    }

    h1 {
        margin: 0;
        font-size: clamp(28px, 4.4vw, 46px);
        line-height: 1.08;
    }

    h2 {
        margin: 0 0 12px;
        font-size: 1.18rem;
        line-height: 1.3;
    }

    .summary,
    p,
    li,
    td,
    th {
        color: var(--secondary);
        line-height: 1.7;
    }

    .summary {
        margin: 14px 0 0;
        font-size: 1.04rem;
        opacity: 0.9;
    }

    p {
        margin: 0 0 12px;
        opacity: 0.88;
    }

    p:last-child {
        margin-bottom: 0;
    }

    ul {
        margin: 10px 0 0;
        padding-left: 1.2rem;
    }

    li + li {
        margin-top: 8px;
    }

    .table-wrap {
        overflow-x: auto;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        min-width: 620px;
    }

    th,
    td {
        border-bottom: 1px solid var(--button-stroke);
        padding: 10px;
        text-align: left;
        vertical-align: top;
    }

    th {
        color: var(--text);
        font-size: 0.85rem;
    }

    details {
        border: 1px solid var(--button-stroke);
        border-radius: var(--border-radius);
        padding: 12px;
        background: var(--button-elevated);
    }

    details + details {
        margin-top: 10px;
    }

    summary {
        cursor: pointer;
        color: var(--secondary);
        font-weight: 700;
    }

    details p {
        margin-top: 10px;
    }

    .related {
        position: sticky;
        top: 16px;
    }

    .related-links,
    .download-links {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .related a,
    .download-links a {
        color: var(--secondary);
        text-decoration: none;
    }

    .related-links a {
        display: inline-flex;
        min-height: 38px;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        font-weight: 700;
    }

    .related-links a.primary {
        background: var(--accent);
        border-color: transparent;
        color: var(--white);
    }

    .download-links a {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px;
        border-radius: var(--border-radius);
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
    }

    .download-links span {
        color: var(--subtext);
        line-height: 1.45;
        font-size: 0.86rem;
    }

    @media (max-width: 860px) {
        .article-page {
            grid-template-columns: 1fr;
        }

        .related {
            position: static;
        }
    }
</style>
