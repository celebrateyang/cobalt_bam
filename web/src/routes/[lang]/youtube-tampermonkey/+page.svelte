<script lang="ts">
    import { t, INTERNAL_locale } from "$lib/i18n/translations";
    import env from "$lib/env";

    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconPlayerPlay from "@tabler/icons-svelte/IconPlayerPlay.svelte";
    import IconShieldCheck from "@tabler/icons-svelte/IconShieldCheck.svelte";

    export let data;

    const videoId = "BV1Bp4EzeEJo";
    const videoUrl = "https://www.bilibili.com/video/BV1Bp4EzeEJo";
    const embedUrl = `https://player.bilibili.com/player.html?bvid=${videoId}&autoplay=0&muted=0&high_quality=1&as_wide=1&danmaku=0`;
    const stepKeys = ["install", "script", "download", "legal"] as const;
    const highlightKeys = ["reliable", "safe", "multi", "combo"] as const;
    const faqKeys = ["quality", "broken", "safe"] as const;
    let embedFailed = false;

    $: currentLocale = data.lang || $INTERNAL_locale;
    $: seoTitle = $t("tampermonkey.seo.title");
    $: seoDescription = $t("tampermonkey.seo.description");
    $: seoKeywords = $t("tampermonkey.seo.keywords");
    $: siteUrl = env.HOST ? `https://${env.HOST}` : "";
    $: canonicalUrl = siteUrl ? `${siteUrl}/${currentLocale}/youtube-tampermonkey` : "";
    $: thumbnailUrl = siteUrl ? `${siteUrl}/icons/android-chrome-512x512.png` : "";
    $: jsonLd = canonicalUrl
        ? {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": seoTitle,
            "description": seoDescription,
            "inLanguage": currentLocale,
            "url": canonicalUrl,
            "mainEntityOfPage": canonicalUrl,
            "author": { "@type": "Organization", "name": $t("tampermonkey.seo.brand") },
            "video": {
                "@type": "VideoObject",
                "name": $t("tampermonkey.video.title"),
                "description": $t("tampermonkey.video.description"),
                "embedUrl": embedUrl,
                "url": videoUrl,
                "inLanguage": currentLocale,
                ...(thumbnailUrl ? { "thumbnailUrl": [thumbnailUrl] } : {})
            }
        }
        : null;
</script>

<svelte:head>
    <title>{seoTitle}</title>
    <meta name="description" content={seoDescription} />
    <meta name="keywords" content={seoKeywords} />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={seoDescription} />
    {#if canonicalUrl}
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
    {/if}
    {#if jsonLd}
        <script type="application/ld+json">
            {JSON.stringify(jsonLd)}
        </script>
    {/if}
</svelte:head>

<div class="page">
    <section class="hero card">
        <div class="badge">
            <IconShieldCheck size={16} />
            <span>{$t("tampermonkey.hero.badge")}</span>
        </div>
        <h1>{seoTitle}</h1>
        <p class="lede">{$t("tampermonkey.hero.summary")}</p>
        <div class="actions">
            <a class="btn primary" href={`/${currentLocale}`}>
                <IconDownload size={18} />
                <span>{$t("tampermonkey.hero.primary_cta")}</span>
            </a>
            <a class="btn ghost" href={videoUrl} target="_blank" rel="noopener noreferrer">
                <IconPlayerPlay size={18} />
                <span>{$t("tampermonkey.hero.secondary_cta")}</span>
            </a>
        </div>
    </section>

    <section class="video card">
        <div class="iframe-wrap">
            <iframe
                class:hidden={embedFailed}
                title={$t("tampermonkey.video.title")}
                src={embedUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowfullscreen
                loading="lazy"
                on:load={() => embedFailed = false}
                on:error={() => embedFailed = true}
            ></iframe>
            {#if embedFailed}
                <div class="iframe-fallback">
                    <p>{$t("tampermonkey.video.title")}</p>
                    <p class="fallback-copy">
                        {currentLocale === 'zh'
                            ? "B站播放器限制了外站内嵌。点击下方按钮在新标签打开。"
                            : "The Bilibili player blocked embedding. Open the tutorial in a new tab instead."}
                    </p>
                    <a class="btn primary" href={videoUrl} target="_blank" rel="noopener noreferrer">
                        <IconPlayerPlay size={18} />
                        <span>{$t("tampermonkey.video.open")}</span>
                    </a>
                </div>
            {/if}
        </div>
        <div class="video-meta">
            <p class="eyebrow">
                {$t("tampermonkey.video.runtime")}
            </p>
            <h2>{$t("tampermonkey.video.title")}</h2>
            <p>{$t("tampermonkey.video.description")}</p>
            <div class="pill-row">
                {#each highlightKeys as key}
                    <span class="pill">{$t(`tampermonkey.highlights.points.${key}`)}</span>
                {/each}
            </div>
            <a class="text-link" href={videoUrl} target="_blank" rel="noopener noreferrer">
                {$t("tampermonkey.video.open")}
            </a>
            <p class="video-note">
                {currentLocale === 'zh'
                    ? "如果 B站 播放器被拦截，请直接点击链接在新标签页打开。"
                    : "If the Bilibili embed is blocked, open the tutorial in a new tab instead."}
            </p>
        </div>
    </section>

    <section class="steps card">
        <div class="section-head">
            <h2>{$t("tampermonkey.steps.title")}</h2>
            <p>{$t("tampermonkey.highlights.title")}</p>
        </div>
        <div class="step-grid">
            {#each stepKeys as key, i}
                <article class="step">
                    <div class="step-number">
                        {(i + 1).toString().padStart(2, "0")}
                    </div>
                    <div class="step-body">
                        <h3>{$t(`tampermonkey.steps.${key}.title`)}</h3>
                        <p>{$t(`tampermonkey.steps.${key}.desc`)}</p>
                    </div>
                </article>
            {/each}
        </div>
    </section>

    <section class="faq card">
        <div class="section-head">
            <h2>{$t("tampermonkey.faq.title")}</h2>
        </div>
        <div class="faq-items">
            {#each faqKeys as key}
                <details>
                    <summary>{$t(`tampermonkey.faq.items.${key}.q`)}</summary>
                    <p>{$t(`tampermonkey.faq.items.${key}.a`)}</p>
                </details>
            {/each}
        </div>
    </section>

    <section class="cta card">
        <div>
            <h3>{$t("tampermonkey.cta.title")}</h3>
            <p>{$t("tampermonkey.cta.subtitle")}</p>
        </div>
        <div class="actions">
            <a class="btn primary" href={`/${currentLocale}`}>
                <IconDownload size={18} />
                <span>{$t("tampermonkey.cta.primary")}</span>
            </a>
            <a class="btn ghost" href={videoUrl} target="_blank" rel="noopener noreferrer">
                <IconPlayerPlay size={18} />
                <span>{$t("tampermonkey.cta.secondary")}</span>
            </a>
        </div>
    </section>
</div>

<style>
    .page {
        width: 100%;
        max-width: 1120px;
        margin: 0 auto;
        padding: calc(var(--padding) * 2) var(--padding) calc(var(--padding) * 3);
        display: flex;
        flex-direction: column;
        gap: 18px;
        box-sizing: border-box;
    }

    .card {
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        border-radius: 18px;
        padding: calc(var(--padding) * 1.5);
        box-shadow: 0 16px 42px rgba(0, 0, 0, 0.06);
    }

    .hero h1 {
        margin: 10px 0 8px;
        font-size: clamp(24px, 3vw, 32px);
        color: var(--secondary);
        line-height: 1.25;
    }

    .lede {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.6;
        max-width: 800px;
    }

    .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--surface-3);
        color: var(--secondary);
        font-size: 0.85rem;
        font-weight: 600;
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
        flex-wrap: wrap;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-radius: 10px;
        font-weight: 600;
        text-decoration: none;
        transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
        border: 1px solid transparent;
    }

    .btn:hover {
        transform: translateY(-1px);
    }

    .btn.primary {
        background: var(--accent);
        color: var(--primary);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
    }

    .btn.primary:hover {
        background: var(--accent-strong, var(--accent));
    }

    .btn.ghost {
        background: var(--surface-2);
        color: var(--secondary);
        border-color: var(--surface-3);
    }

    .video {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: 16px;
    }

    .iframe-wrap {
        position: relative;
        padding-top: 56.25%;
        border-radius: 14px;
        overflow: hidden;
        background: #0f1115;
    }

    .iframe-wrap iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
    }
    .iframe-wrap iframe.hidden {
        display: none;
    }
    .iframe-fallback {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 18px;
        text-align: center;
        background: linear-gradient(135deg, rgba(42, 50, 64, 0.85), rgba(18, 21, 32, 0.92));
        color: var(--primary);
    }
    .fallback-copy {
        margin: 0;
        color: var(--secondary-200);
        line-height: 1.5;
        max-width: 420px;
    }

    .video-meta h2 {
        margin: 6px 0;
        font-size: 20px;
    }

    .video-meta p {
        margin: 0 0 10px;
        color: var(--secondary-600);
        line-height: 1.6;
    }

    .eyebrow {
        font-size: 0.9rem;
        color: var(--secondary-500);
        text-transform: uppercase;
        letter-spacing: 0.02em;
        margin: 0;
    }

    .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0 12px;
    }

    .pill {
        padding: 6px 10px;
        border-radius: 10px;
        background: var(--surface-2);
        color: var(--secondary);
        font-size: 0.9rem;
        border: 1px solid var(--surface-3);
    }

    .text-link {
        color: var(--blue);
        font-weight: 600;
        text-decoration: none;
    }

    .text-link:hover {
        text-decoration: underline;
    }

    .video-note {
        margin: 6px 0 0;
        color: var(--secondary-500);
        font-size: 13px;
        line-height: 1.4;
    }

    .section-head h2 {
        margin: 0 0 6px;
        font-size: 20px;
    }

    .section-head p {
        margin: 0;
        color: var(--secondary-600);
    }

    .step-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
        margin-top: 14px;
    }

    .step {
        display: flex;
        gap: 12px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
    }

    .step-number {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: var(--surface-3);
        color: var(--secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-family: "IBM Plex Mono", monospace;
    }

    .step-body h3 {
        margin: 0 0 6px;
        font-size: 16px;
    }

    .step-body p {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.55;
        font-size: 14px;
    }

    .faq-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 12px;
    }

    details {
        border: 1px solid var(--surface-2);
        border-radius: 10px;
        padding: 12px 14px;
        background: var(--surface-1);
    }

    summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--secondary);
    }

    details p {
        margin: 10px 0 0;
        color: var(--secondary-600);
        line-height: 1.55;
    }

    .cta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
    }

    .cta h3 {
        margin: 0 0 4px;
        font-size: 18px;
    }

    .cta p {
        margin: 0;
        color: var(--secondary-600);
    }

    @media (max-width: 900px) {
        .video {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 640px) {
        .page {
            padding: calc(var(--padding) * 1.5) var(--padding) calc(var(--padding) * 2);
            gap: 14px;
        }

        .card {
            padding: var(--padding);
        }

        .cta {
            flex-direction: column;
            align-items: flex-start;
        }

        .actions {
            width: 100%;
        }

        .btn {
            width: 100%;
            justify-content: center;
        }
    }
</style>
