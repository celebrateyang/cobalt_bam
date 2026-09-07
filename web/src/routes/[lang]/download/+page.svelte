<script lang="ts">
    import env from '$lib/env';
    import { getDirectoryCopy } from '$lib/seo/directory-copy';
    import { jsonLdScript } from '$lib/seo/json-ld';

    import SupportedServices from '$components/save/SupportedServices.svelte';

    export let data: {
        lang: string;
        cards: Array<{
            slug: string;
            h1: string;
            lede: string;
            keywords: string[];
            guideSlug: string | null;
        }>;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: isZh = data.lang === 'zh';
    $: copy = getDirectoryCopy(data.lang);
    $: pageTitle = copy.title;
    $: seoTitle = `${pageTitle} | FreeSaveVideo`;
    $: pageDesc = copy.description;
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/download`;

    $: breadcrumbJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: copy.home,
                item: `https://${fallbackHost}/${data.lang}`,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: pageTitle,
                item: canonicalUrl,
            },
        ],
    };

    $: itemListJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: data.cards.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.h1,
            url: `https://${fallbackHost}/${data.lang}/download/${item.slug}`,
        })),
    };
</script>

<svelte:head>
    <title>{seoTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    <meta name="twitter:image:alt" content="FreeSaveVideo video downloader preview" />
    {@html jsonLdScript(breadcrumbJsonLd)}
    {@html jsonLdScript(itemListJsonLd)}
</svelte:head>

<div class="page">
    <div class="services">
        <SupportedServices />
    </div>

    <main class="container" tabindex="-1" data-first-focus data-focus-ring-hidden>
        <section class="hero card">
            <p class="eyebrow">FreeSaveVideo</p>
            <h1>{pageTitle}</h1>
            <p class="lede">{pageDesc}</p>
            <div class="hero-links">
                <a class="hero-link" href={`/${data.lang}`}>
                    {copy.home}
                </a>
                <a class="hero-link" href={`/${data.lang}/guide`}>
                    {copy.guides}
                </a>
                {#if data.lang === 'en'}
                    <a class="hero-link" href="/en/learn">
                        Learn
                    </a>
                {/if}
                <a class="hero-link" href={`/${data.lang}/faq`}>
                    {copy.faq}
                </a>
            </div>
        </section>

        {#if isZh || data.lang === 'en'}
            <section class="card">
                <h2>{isZh ? '先确定要保存什么' : 'Start with the type of link you have'}</h2>
                <ul class="task-list">
                    <li><a href={`/${data.lang}/download/youtube-download`}>{isZh ? '单个 YouTube 视频' : 'One YouTube video'}</a> — {isZh ? '使用 watch 或 youtu.be 链接。画质和音频格式以解析结果为准。' : 'Use a watch or youtu.be URL. Quality and audio formats depend on the returned results.'}</li>
                    <li><a href={`/${data.lang}/download/youtube-shorts-download`}>YouTube Shorts</a> — {isZh ? '复制 Shorts 分享链接，保存单条短视频。' : 'Copy a Shorts share link to save one short video.'}</li>
                    <li><a href={`/${data.lang}/download/youtube-playlist-downloader`}>{isZh ? 'YouTube 公开播放列表' : 'A public YouTube playlist'}</a> — {isZh ? '保留 list 参数，展开后选择条目；播放列表不同于频道主页。' : 'Keep the list parameter and select entries after expansion. A channel homepage is not a playlist.'}</li>
                    <li><a href={`/${data.lang}/download/youtube-playlist-to-mp3`}>{isZh ? '播放列表音频' : 'Playlist audio'}</a> — {isZh ? '为可用条目选择音频。并非每个结果都提供 MP3，不要通过改扩展名转换格式。' : 'Choose audio for available entries. MP3 is not available for every result; renaming an extension does not convert a file.'}</li>
                    {#if data.lang === 'en'}
                        <li><a href="/en/download/batch-video-downloader">Multiple separate video links</a> — Paste the individual URLs into the batch workflow when your videos are not in one playlist.</li>
                    {/if}
                </ul>
                <p>{isZh ? '仅处理受支持、公开可访问且你有权保存的内容。遇到失败时，先确认原链接能否播放，再区分链接解析失败与文件保存失败。' : 'Use supported, publicly accessible content you have permission to save. If a task fails, first check whether the source plays, then distinguish a link extraction error from a file saving error.'}</p>
                <a href={`/${data.lang}/guide/youtube-download-guide`}>{isZh ? '查看 YouTube 链接、设备保存和失败排查指南' : 'Read the YouTube link, device saving, and troubleshooting guide'}</a>
            </section>
        {/if}

        <section class="grid" aria-label={pageTitle}>
            {#each data.cards as item}
                <article class="card item-card">
                    <h2>{item.h1}</h2>
                    <p>{item.lede}</p>

                    <div class="actions">
                        <a class="btn btn-primary" href={`/${data.lang}/download/${item.slug}`}>
                            {copy.open}
                        </a>
                        {#if item.guideSlug}
                            <a class="btn" href={`/${data.lang}/guide/${item.guideSlug}`}>
                                {copy.guide}
                            </a>
                        {/if}
                    </div>
                </article>
            {/each}
        </section>
    </main>
</div>

<style>
    .task-list { display: grid; gap: 12px; padding-left: 22px; line-height: 1.7; }
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
        max-width: 1100px;
    }

    .container {
        width: 100%;
        max-width: 1100px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .card {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.1);
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .hero {
        padding: 22px;
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
        font-size: clamp(24px, 3.2vw, 36px);
        color: var(--secondary);
    }

    .lede {
        margin: 10px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        font-size: 15.5px;
        line-height: 1.6;
    }

    .hero-links {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hero-link {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        font-weight: 600;
    }

    .hero-link:hover {
        background: var(--button-hover);
    }

    .grid {
        display: grid;
        gap: calc(var(--padding) / 1.2);
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .item-card h2 {
        margin: 0;
        color: var(--secondary);
        font-size: 18px;
        line-height: 1.35;
    }

    .item-card p {
        margin: 8px 0 0;
        color: var(--secondary);
        opacity: 0.86;
        line-height: 1.55;
        min-height: 48px;
    }

    .actions {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        font-weight: 600;
    }

    .btn:hover {
        background: var(--button-hover);
    }

    .btn-primary {
        background: var(--accent);
        color: var(--white);
        border-color: transparent;
    }

    .btn-primary:hover {
        background: var(--accent-hover);
    }

    @media (max-width: 640px) {
        .hero,
        .card {
            border-radius: 14px;
        }

        .item-card p {
            min-height: 0;
        }

        .actions,
        .hero-links {
            display: grid;
            grid-template-columns: 1fr;
        }
    }
</style>
