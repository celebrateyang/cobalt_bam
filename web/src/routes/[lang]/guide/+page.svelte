<script lang="ts">
    import env from '$lib/env';
    import SupportedServices from '$components/save/SupportedServices.svelte';
    import { getHubDownloadLinks } from '$lib/seo/internal-links';

    export let data: {
        lang: string;
        guides: Array<{
            slug: string;
            landingSlug: string;
            platform: string;
            title: string;
            lede: string;
        }>;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';
    const isZh = data.lang === 'zh';
    const pageTitle = isZh ? '下载指南' : 'Download Guides';
    const pageDesc = isZh
        ? '为常见平台提供下载步骤与常见问题，一步一步完成。'
        : 'Step-by-step download guides for popular platforms.';
    const featuredDownloads = getHubDownloadLinks(6);
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
</svelte:head>

<div class="page">
    <div class="services">
        <SupportedServices />
    </div>

    <main class="container">
        <section class="hero">
            <p class="eyebrow">{isZh ? '指南中心' : 'Guide hub'}</p>
            <h1>{pageTitle}</h1>
            <p class="lede">{pageDesc}</p>
        </section>

        <section class="grid">
            {#each data.guides as guide}
                <article class="card">
                    <div class="card-body">
                        <h2>{guide.title}</h2>
                        <p>{guide.lede}</p>
                    </div>
                    <div class="actions">
                        <a class="btn ghost" href={`/${data.lang}/guide/${guide.slug}`}>
                            {isZh ? '查看指南' : 'View guide'}
                        </a>
                        <a
                            class="btn primary"
                            href={`/${data.lang}/download/${guide.landingSlug}`}
                        >
                            {isZh ? '去下载' : 'Download'}
                        </a>
                    </div>
                </article>
            {/each}
        </section>

        <section class="card link-hub">
            <h2>{isZh ? '延伸链接' : 'Related links'}</h2>
            <div class="link-grid">
                <a class="link-item link-item--primary" href={`/${data.lang}/download`}>
                    Download directory
                </a>
                <a class="link-item link-item--primary" href={`/${data.lang}/faq`}>
                    {isZh ? '常见问题（FAQ）' : 'Frequently asked questions'}
                </a>
                <a class="link-item link-item--primary" href={`/${data.lang}`}>
                    {isZh ? '返回首页下载' : 'Back to home downloader'}
                </a>
                {#each featuredDownloads as item}
                    <a class="link-item" href={`/${data.lang}/download/${item.slug}`}>
                        {item.platform} {isZh ? '下载页' : 'download page'}
                    </a>
                {/each}
            </div>
        </section>
    </main>
</div>

<style>
    .page {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(var(--padding) / 1.25);
        padding: 0 var(--padding) calc(var(--padding) * 2);
        background:
            radial-gradient(
                circle at 12% 8%,
                rgba(var(--accent-rgb), 0.12),
                transparent 50%
            ),
            radial-gradient(
                circle at 88% 14%,
                rgba(var(--accent-rgb), 0.08),
                transparent 45%
            );
    }

    .services {
        width: 100%;
        max-width: 1040px;
    }

    .container {
        width: 100%;
        max-width: 1040px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .hero {
        padding: 22px;
        border-radius: calc(var(--border-radius) * 1.6);
        border: 1px solid var(--button-stroke);
        background: linear-gradient(
            135deg,
            rgba(var(--accent-rgb), 0.16),
            var(--button)
        );
        box-shadow: var(--button-box-shadow);
    }

    .eyebrow {
        margin: 0 0 8px;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(var(--accent-rgb), 0.9);
        font-weight: 700;
    }

    .hero h1 {
        margin: 0;
        font-size: clamp(24px, 3.2vw, 34px);
        color: var(--secondary);
    }

    .lede {
        margin: 10px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        font-size: 15.5px;
        line-height: 1.6;
    }

    .grid {
        display: grid;
        gap: calc(var(--padding) / 1.15);
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 16px;
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.1);
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .card-body h2 {
        margin: 0 0 8px;
        font-size: 18px;
        color: var(--secondary);
    }

    .card-body p {
        margin: 0;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .link-hub h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .link-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
    }

    .link-item {
        display: flex;
        align-items: center;
        min-height: 40px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        line-height: 1.4;
    }

    .link-item:hover {
        background: var(--button-hover);
    }

    .link-item--primary {
        border-color: rgba(var(--accent-rgb), 0.3);
        background: rgba(var(--accent-rgb), 0.1);
        font-weight: 600;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: var(--button);
        box-shadow: var(--button-box-shadow);
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--text);
        text-decoration: none;
        white-space: nowrap;
        transition: transform 0.12s ease, background 0.12s ease, opacity 0.12s ease;
    }

    .btn.primary {
        background: var(--accent);
        color: var(--white);
        border-color: transparent;
        box-shadow: none;
    }

    .btn.primary:hover {
        background: var(--accent-hover);
    }

    .btn.ghost:hover {
        background: var(--button-hover);
    }

    @media screen and (max-width: 800px) {
        .hero {
            padding: 18px;
        }
    }
</style>
