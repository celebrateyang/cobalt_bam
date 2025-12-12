<script lang="ts">
    import { INTERNAL_locale, t } from "$lib/i18n/translations";
    import env from "$lib/env";
    import { onMount } from "svelte";
    import { browser } from "$app/environment";

    import IconDownload from "@tabler/icons-svelte/IconDownload.svelte";
    import IconPlayerPlay from "@tabler/icons-svelte/IconPlayerPlay.svelte";
    import IconShieldCheck from "@tabler/icons-svelte/IconShieldCheck.svelte";

    export let data;

    const videoId = "BV1Bp4EzeEJo";
    const videoUrl = "https://www.bilibili.com/video/BV1Bp4EzeEJo";
    const embedUrl = `https://player.bilibili.com/player.html?bvid=${videoId}&autoplay=0&muted=0&high_quality=1&as_wide=1&danmaku=0`;

    const videoPointKeys = ["1", "2", "3"];
    const prepStepKeys = ["1", "2"];
    const flowStepKeys = ["1", "2", "3", "4"];
    const noticeKeys = ["1", "2"];
    const faqItems = [
        { key: "no_buttons", steps: ["1", "2", "3"] },
        { key: "no_save", steps: ["1", "2"] },
    ];

    let disableEmbed = false;
    let embedFailed = false;
    $: showEmbed = !disableEmbed && !embedFailed;

    const currentLocale = data.lang || INTERNAL_locale;
    const siteUrl = env.HOST ? `https://${env.HOST}` : "";
    const canonicalUrl = siteUrl
        ? `${siteUrl}/${currentLocale}/youtube-video-downloader`
        : "";

    $: pageTitle = $t("tampermonkey.guide.page_title");
    $: pageDesc = $t("tampermonkey.guide.page_desc");

    const jsonLd = canonicalUrl
        ? {
              "@context": "https://schema.org",
              "@type": "Article",
              headline: pageTitle,
              description: pageDesc,
              inLanguage: currentLocale,
              url: canonicalUrl,
              mainEntityOfPage: canonicalUrl,
              video: {
                  "@type": "VideoObject",
                  name: $t("tampermonkey.video.title"),
                  description: $t("tampermonkey.video.description"),
                  embedUrl,
                  url: videoUrl,
                  inLanguage: currentLocale,
              },
          }
        : null;

    onMount(() => {
        if (!browser) return;
        const mq = window.matchMedia("(max-width: 900px)");
        const handler = (e: MediaQueryListEvent | MediaQueryList) => {
            disableEmbed = e.matches;
        };
        handler(mq);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    });
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    {#if canonicalUrl}
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
    {/if}
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
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
            <span>{$t("tampermonkey.guide.hero_badge")}</span>
        </div>
        <h1>{pageTitle}</h1>
        <p class="lede">{pageDesc}</p>
        <div class="actions">
            <a class="btn primary" href={`/${currentLocale}`}>
                <IconDownload size={18} />
                <span>{$t("tampermonkey.guide.back_home")}</span>
            </a>
            <a
                class="btn ghost"
                href="https://www.tampermonkey.net/"
                target="_blank"
                rel="noopener noreferrer"
            >
                <IconPlayerPlay size={18} />
                <span>{$t("tampermonkey.guide.plugin_link")}</span>
            </a>
        </div>
    </section>

    <section class="video card">
        <div class="iframe-wrap">
            {#if showEmbed}
                <iframe
                    title={$t("tampermonkey.video.title")}
                    src={embedUrl}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowfullscreen
                    loading="lazy"
                    credentialless
                    on:load={() => (embedFailed = false)}
                    on:error={() => (embedFailed = true)}
                ></iframe>
            {/if}
            {#if !showEmbed}
                <div class="iframe-fallback">
                    <p class="fallback-title">
                        {$t("tampermonkey.guide.fallback.title")}
                    </p>
                    <p class="fallback-copy">
                        {$t("tampermonkey.guide.fallback.desc")}
                    </p>
                    <a
                        class="btn primary"
                        href={videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <IconPlayerPlay size={18} />
                        <span>{$t("tampermonkey.guide.fallback.cta")}</span>
                    </a>
                </div>
            {/if}
        </div>
        <div class="video-meta">
            <p class="eyebrow">{$t("tampermonkey.hero.badge")}</p>
            <h2>{$t("tampermonkey.video.title")}</h2>
            <p>{$t("tampermonkey.video.description")}</p>
            <ul class="dot-list">
                {#each videoPointKeys as key}
                    <li>{$t(`tampermonkey.guide.video_points.${key}`)}</li>
                {/each}
            </ul>
            <a
                class="text-link"
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
            >
                {$t("tampermonkey.guide.bilibili_link")}
            </a>
        </div>
    </section>

    <section class="card">
        <div class="section-head">
            <h2>{$t("tampermonkey.guide.prep.title")}</h2>
            <p>{$t("tampermonkey.guide.prep.subtitle")}</p>
        </div>
        <ol class="list">
            {#each prepStepKeys as key, i}
                <li>
                    <span class="list-index">{i + 1}</span>
                    <div class="list-body">
                        <p>{$t(`tampermonkey.guide.prep.steps.${key}`)}</p>
                    </div>
                </li>
            {/each}
        </ol>
    </section>

    <section class="card">
        <div class="section-head">
            <h2>{$t("tampermonkey.guide.flow.title")}</h2>
            <p>{$t("tampermonkey.guide.flow.subtitle")}</p>
        </div>
        <ol class="list">
            {#each flowStepKeys as key, i}
                <li>
                    <span class="list-index">{i + 1}</span>
                    <div class="list-body">
                        <p>{$t(`tampermonkey.guide.flow.steps.${key}`)}</p>
                    </div>
                </li>
            {/each}
        </ol>
    </section>

    <section class="card notice">
        <h3>{$t("tampermonkey.guide.notice.title")}</h3>
        <ul>
            {#each noticeKeys as key}
                <li>{$t(`tampermonkey.guide.notice.items.${key}`)}</li>
            {/each}
        </ul>
    </section>

    <section class="card faq">
        <h3>{$t("tampermonkey.guide.faq2.title")}</h3>
        <div class="faq-list">
            {#each faqItems as item}
                <div class="faq-block">
                    <h4>{$t(`tampermonkey.guide.faq2.items.${item.key}.title`)}</h4>
                    <ol>
                        {#each item.steps as stepKey}
                            <li>
                                {$t(`tampermonkey.guide.faq2.items.${item.key}.steps.${stepKey}`)}
                            </li>
                        {/each}
                    </ol>
                </div>
            {/each}
            <div class="faq-block screenshot">
                <h4>{$t("tampermonkey.guide.faq2.screenshot_title")}</h4>
                <p class="screenshot-note">
                    {$t("tampermonkey.guide.faq2.screenshot_note")}
                </p>
                <img
                    src="/download_guide/youtube_download.png"
                    alt={$t("tampermonkey.guide.faq2.screenshot_alt")}
                    loading="lazy"
                />
            </div>
        </div>
    </section>
</div>

<style>
    .page {
        max-width: 1100px;
        margin: 0 auto 32px;
        padding: 0 10px;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .card {
        background: #ffffff;
        border-radius: 18px;
        padding: 22px 24px;
        border: 1px solid rgba(0, 0, 0, 0.05);
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.08);
    }

    .hero {
        text-align: center;
        background: linear-gradient(
            135deg,
            rgba(130, 181, 45, 0.12),
            rgba(130, 181, 45, 0)
        );
    }

    .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(130, 181, 45, 0.12);
        color: #4a5c28;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .hero h1 {
        margin: 10px 0 6px;
        font-size: clamp(26px, 4vw, 34px);
        color: #2f3c1b;
    }

    .lede {
        margin: 0 auto 12px;
        max-width: 760px;
        color: #4b6020;
        line-height: 1.6;
    }

    .actions {
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 10px;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 11px 16px;
        border-radius: 12px;
        font-weight: 600;
        border: 1px solid transparent;
        transition:
            transform 0.12s ease,
            box-shadow 0.12s ease,
            background 0.12s ease,
            border-color 0.12s ease;
    }

    .btn.primary {
        background: #82b52d;
        color: #0f1d06;
        box-shadow: 0 10px 26px rgba(130, 181, 45, 0.25);
    }

    .btn.ghost {
        background: #f6f7f2;
        color: #344016;
        border-color: #e5e9d7;
    }

    .btn:hover {
        transform: translateY(-2px);
    }

    .btn.primary:hover {
        background: #73a426;
    }

    .btn.ghost:hover {
        background: #eef1e7;
        border-color: #d8dcc8;
    }

    .video {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
        gap: 24px;
        align-items: center;
    }

    .iframe-wrap {
        width: 100%;
        display: flex;
        justify-content: center;
    }

    .iframe-wrap iframe {
        width: 100%;
        max-width: 940px;
        aspect-ratio: 16 / 9;
        border: none;
        border-radius: 16px;
        background: #000000;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
    }

    .iframe-fallback {
        width: 100%;
        max-width: 640px;
        padding: 24px;
        border-radius: 16px;
        border: 1px dashed rgba(130, 181, 45, 0.35);
        background: rgba(130, 181, 45, 0.05);
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
    }

    .fallback-title {
        margin: 0;
        font-weight: 700;
        color: #2f3c1b;
    }

    .fallback-copy {
        margin: 0;
        color: #4b6020;
    }

    .video-meta {
        display: flex;
        flex-direction: column;
        gap: 10px;
        color: #3b4b21;
    }

    .eyebrow {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #82b52d;
        font-weight: 700;
        font-size: 0.78rem;
    }

    .video-meta h2 {
        margin: 0;
        font-size: clamp(22px, 3vw, 26px);
        color: #2f3c1b;
    }

    .video-meta p {
        margin: 0;
        line-height: 1.55;
    }

    .dot-list {
        margin: 0;
        padding-left: 18px;
        color: #3b4b21;
    }

    .dot-list li {
        margin: 4px 0;
    }

    .text-link {
        color: #82b52d;
        font-weight: 600;
        text-decoration: underline;
    }

    .section-head h2 {
        margin: 0 0 4px;
        color: #2f3c1b;
    }

    .section-head p {
        margin: 0;
        color: #4a5c28;
    }

    .list {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .list li {
        display: grid;
        grid-template-columns: 32px 1fr;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f6f8f1;
    }

    .list-index {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: rgba(130, 181, 45, 0.12);
        color: #2f3c1b;
        font-weight: 700;
    }

    .list-body p {
        margin: 0;
        line-height: 1.6;
        color: #3b4b21;
    }

    .notice ul {
        margin: 10px 0 0;
        padding-left: 18px;
        color: #3b4b21;
        line-height: 1.6;
    }

    .faq .faq-list {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .faq-block {
        padding: 14px;
        border-radius: 12px;
        background: #f6f8f1;
        border: 1px solid rgba(130, 181, 45, 0.08);
    }

    .faq-block h4 {
        margin: 0 0 8px;
        color: #2f3c1b;
    }

    .faq-block ol {
        margin: 0;
        padding-left: 18px;
        color: #3b4b21;
        line-height: 1.55;
    }

    .faq-block.screenshot {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-start;
    }

    .faq-block img {
        width: 100%;
        border-radius: 10px;
        border: 1px solid rgba(0, 0, 0, 0.06);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
    }

    .screenshot-note {
        margin: 0;
        color: #4a5c28;
    }

    @media (max-width: 900px) {
        .page {
            padding: 6px 0 26px;
        }

        .video {
            grid-template-columns: 1fr;
        }

        .video-meta {
            order: -1;
        }

        .card {
            padding: 20px;
        }
    }

    @media (max-width: 600px) {
        .actions {
            flex-direction: column;
        }

        .list li {
            grid-template-columns: 26px 1fr;
        }

        .list-index {
            width: 26px;
            height: 26px;
        }
    }
</style>
