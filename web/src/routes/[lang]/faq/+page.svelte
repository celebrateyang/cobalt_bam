<script lang="ts">
    import { page } from "$app/stores";
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";
    import { getHubDownloadLinks, getHubGuideLinks } from "$lib/seo/internal-links";

    const fallbackHost = env.HOST || "freesavevideo.online";
    const normalizePathname = (pathname: string) => {
        if (pathname !== "/" && pathname.endsWith("/")) {
            return pathname.replace(/\/+$/, "");
        }
        return pathname;
    };

    const sectionDefs = [
        {
            id: "basics",
            items: [
                "what_is",
                "how_to_use",
                "supported_platforms",
                "youtube_supported",
                "mobile_ios",
            ],
        },
        {
            id: "features",
            items: [
                "watermark_free",
                "quality_options",
                "audio_only",
                "batch_download",
                "playlist_collection",
            ],
        },
        { id: "points", items: ["need_login", "points_how", "points_buy"] },
        {
            id: "troubleshooting",
            items: ["failed_parse", "slow_download", "private_paid"],
        },
        { id: "privacy", items: ["privacy_logs", "feedback_contact"] },
    ] as const;

    type SectionDef = (typeof sectionDefs)[number];
    type SectionId = SectionDef["id"];
    type ItemKey = SectionDef["items"][number];

    type FaqItem = {
        key: ItemKey;
        q: string;
        a: string;
    };

    type FaqSection = {
        id: SectionId;
        title: string;
        items: FaqItem[];
    };

    let query = "";

    $: lang = $page.params.lang;
    $: canonicalPathname = normalizePathname($page.url.pathname);
    $: canonicalUrl = `https://${fallbackHost}${canonicalPathname}`;
    $: siteUrl = `https://${fallbackHost}`;
    $: youtubeGuideUrl = `${siteUrl}/${lang}/youtube-video-downloader`;
    const featuredDownloads = getHubDownloadLinks(6);
    const featuredGuides = getHubGuideLinks(4);

    $: title = $t("faq.title");
    $: description = $t("faq.description");

    $: metaTitle = $t("faq.seo.title");
    $: metaDescription = $t("faq.seo.description");
    $: metaKeywords = $t("faq.seo.keywords");

    $: faqSections = sectionDefs.map((section) => ({
        id: section.id,
        title: $t(`faq.sections.${section.id}`),
        items: section.items.map((key) => ({
            key,
            q: $t(`faq.items.${key}.q`),
            a: $t(`faq.items.${key}.a`),
        })),
    })) as FaqSection[];

    const normalizeSearch = (value: string) =>
        String(value ?? "").trim().toLowerCase();

    $: normalizedQuery = normalizeSearch(query);
    $: filteredSections =
        normalizedQuery.length > 0
            ? faqSections
                  .map((section) => ({
                      ...section,
                      items: section.items.filter((item) =>
                          `${item.q}\n${item.a}`
                              .toLowerCase()
                              .includes(normalizedQuery),
                      ),
                  }))
                  .filter((section) => section.items.length > 0)
            : faqSections;

    $: visibleCount = filteredSections.reduce(
        (sum, section) => sum + section.items.length,
        0,
    );
    $: totalCount = faqSections.reduce(
        (sum, section) => sum + section.items.length,
        0,
    );

    $: faqJsonLd = canonicalUrl
        ? {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              url: canonicalUrl,
              inLanguage: lang,
              mainEntity: faqSections.flatMap((section) =>
                  section.items.map((item) => ({
                      "@type": "Question",
                      name: item.q,
                      acceptedAnswer: {
                          "@type": "Answer",
                          text: item.a,
                      },
                  })),
              ),
          }
        : null;
</script>

<svelte:head>
    <title>{metaTitle}</title>
    <meta name="description" content={metaDescription} />
    <meta name="keywords" content={metaKeywords} />

    <meta property="og:title" content={metaTitle} />
    <meta property="og:description" content={metaDescription} />
    <meta property="og:type" content="website" />
    <meta property="og:image" content={`${siteUrl}/og.png`} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={metaTitle} />
    <meta name="twitter:description" content={metaDescription} />
    <meta name="twitter:image" content={`${siteUrl}/og.png`} />

    {#if faqJsonLd}
        <script type="application/ld+json">
            {JSON.stringify(faqJsonLd)}
        </script>
    {/if}
</svelte:head>

<main id="faq">
    <header class="hero card">
        <h1>{title}</h1>
        <p class="lede selectable">{description}</p>
        <div class="actions">
            <a class="btn primary" href={`/${lang}`}>
                {$t("faq.actions.home")}
            </a>
            <a class="btn" href={`/${lang}?feedback=1`}>
                {$t("faq.actions.feedback")}
            </a>
            <a class="btn" href={`/${lang}/youtube-video-downloader`}>
                {$t("faq.actions.youtube")}
            </a>
            <a class="btn" href={`/${lang}/account`}>
                {$t("faq.actions.account")}
            </a>
        </div>
    </header>

    <section class="card tools" aria-label="FAQ tools">
        <div class="search-row">
            <input
                class="search"
                type="search"
                bind:value={query}
                placeholder={$t("faq.search.placeholder")}
            />
            {#if normalizedQuery.length > 0}
                <button
                    class="btn btn-clear"
                    type="button"
                    on:click={() => (query = "")}
                >
                    {$t("faq.search.clear")}
                </button>
            {/if}
        </div>
        <p class="meta">
            {#if normalizedQuery.length > 0}
                {visibleCount} / {totalCount}
            {:else}
                {totalCount}
            {/if}
        </p>
    </section>

    <nav class="card toc" aria-label={$t("faq.toc.title")}>
        <h2 class="toc-title">{$t("faq.toc.title")}</h2>
        <div class="toc-links">
            {#each faqSections as section (section.id)}
                <a class="toc-link" href={`#${section.id}`}>
                    {section.title}
                </a>
            {/each}
        </div>
    </nav>

    {#if visibleCount === 0}
        <section class="card empty">
            <h2 class="empty-title">{$t("faq.search.no_results")}</h2>
            <p class="empty-hint">
                <a class="text-link" href={`/${lang}?feedback=1`}>
                    {$t("faq.actions.feedback")}
                </a>
            </p>
        </section>
    {:else}
        {#each filteredSections as section (section.id)}
            <section id={section.id} class="card section">
                <div class="section-head">
                    <h2>{section.title}</h2>
                    <a class="back-top" href="#faq">#</a>
                </div>
                <div class="faq-list">
                    {#each section.items as item (item.key)}
                        <details class="faq-item" open={normalizedQuery.length > 0}>
                            <summary>
                                <span class="question">{item.q}</span>
                            </summary>
                            <div class="answer selectable">
                                {item.a}
                                {#if item.key === "youtube_supported"}
                                    <div class="answer-link-row">
                                        <span class="answer-link-label"
                                            >{$t("faq.actions.youtube")}:</span
                                        >
                                        <a class="text-link answer-link" href={youtubeGuideUrl}
                                            >{youtubeGuideUrl}</a
                                        >
                                    </div>
                                {/if}
                            </div>
                        </details>
                    {/each}
                </div>
            </section>
        {/each}
    {/if}

    <section class="card related">
        <h2>{lang === "zh" ? "猜你还要找" : "More to explore"}</h2>
        <div class="related-links">
            <a class="related-link related-link--primary" href={`/${lang}/download`}>
                Download directory
            </a>
            <a class="related-link related-link--primary" href={`/${lang}`}>
                {lang === "zh" ? "返回首页下载" : "Back to home downloader"}
            </a>
            <a class="related-link related-link--primary" href={`/${lang}/guide`}>
                {lang === "zh" ? "查看全部下载指南" : "Browse all download guides"}
            </a>
            {#each featuredGuides as item}
                <a class="related-link" href={`/${lang}/guide/${item.slug}`}>
                    {item.platform} {lang === "zh" ? "指南" : "guide"}
                </a>
            {/each}
            {#each featuredDownloads as item}
                <a class="related-link" href={`/${lang}/download/${item.slug}`}>
                    {item.platform} {lang === "zh" ? "下载页" : "download page"}
                </a>
            {/each}
        </div>
    </section>
</main>

<style>
    #faq {
        width: 100%;
        max-width: 980px;
        margin: 0 auto 24px;
        padding: calc(var(--padding) * 2) var(--padding);
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .card {
        background: var(--surface-1, var(--popup-bg));
        border: 1px solid var(--surface-2, var(--popup-stroke));
        border-radius: 18px;
        padding: 18px 18px;
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.06);
    }

    h1 {
        margin: 0;
        color: var(--text);
        font-size: clamp(22px, 3vw, 30px);
        letter-spacing: -0.01em;
    }

    .lede {
        margin: 8px 0 0;
        color: var(--subtext);
        line-height: 1.6;
    }

    .selectable {
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
    }

    .hero {
        padding: 22px 22px;
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
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

    .btn:hover {
        background: var(--button-hover);
        transform: translateY(-1px);
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

    .btn.btn-clear {
        padding: 10px 12px;
    }

    .tools {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .search-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .search {
        width: 100%;
        flex: 1;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
        outline: none;
        font-size: 0.95rem;
    }

    .search:focus {
        background: var(--button-hover);
        box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.35);
    }

    .meta {
        margin: 0;
        color: var(--subtext);
        font-size: 0.85rem;
    }

    .toc-title {
        margin: 0 0 10px;
        font-size: 1rem;
        color: var(--text);
    }

    .toc-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .toc-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: var(--button);
        box-shadow: var(--button-box-shadow);
        color: var(--text);
        text-decoration: none;
        font-size: 0.9rem;
        white-space: nowrap;
    }

    .toc-link:hover {
        background: var(--button-hover);
    }

    .empty-title {
        margin: 0;
        font-size: 1rem;
        color: var(--text);
    }

    .empty-hint {
        margin: 8px 0 0;
        color: var(--subtext);
    }

    .text-link {
        text-decoration: underline;
        text-underline-offset: 3px;
    }

    .section {
        padding: 18px 18px;
    }

    .section-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
    }

    .section-head h2 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--text);
    }

    .back-top {
        font-family: "IBM Plex Mono", monospace;
        color: var(--subtext);
        text-decoration: none;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: var(--button);
        box-shadow: var(--button-box-shadow);
    }

    .back-top:hover {
        background: var(--button-hover);
        color: var(--text);
    }

    .faq-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .faq-item {
        border-radius: 16px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: rgba(255, 255, 255, 0.02);
        overflow: hidden;
    }

    .faq-item summary {
        cursor: pointer;
        padding: 14px 14px;
        list-style: none;
    }

    .faq-item summary::-webkit-details-marker {
        display: none;
    }

    .faq-item[open] summary {
        background: rgba(var(--accent-rgb), 0.08);
    }

    .question {
        display: inline-flex;
        align-items: baseline;
        gap: 10px;
        font-weight: 800;
        color: var(--text);
        line-height: 1.45;
    }

    .answer {
        padding: 0 14px 14px;
        color: var(--subtext);
        line-height: 1.65;
        white-space: pre-line;
    }

    .answer-link-row {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
    }

    .answer-link-label {
        font-weight: 700;
        color: var(--text);
    }

    .answer-link {
        word-break: break-all;
    }

    .related h2 {
        margin: 0 0 10px;
        font-size: 1rem;
        color: var(--text);
    }

    .related-links {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
    }

    .related-link {
        display: flex;
        align-items: center;
        min-height: 40px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--surface-2, var(--popup-stroke));
        background: var(--button);
        box-shadow: var(--button-box-shadow);
        color: var(--text);
        text-decoration: none;
        line-height: 1.4;
    }

    .related-link:hover {
        background: var(--button-hover);
    }

    .related-link--primary {
        border-color: rgba(var(--accent-rgb), 0.34);
        background: rgba(var(--accent-rgb), 0.12);
        font-weight: 700;
    }

    @media (max-width: 600px) {
        #faq {
            padding: calc(var(--padding) * 1.5) var(--padding);
        }

        .card,
        .hero,
        .section {
            padding: 14px 14px;
        }

        .search-row {
            flex-direction: column;
            align-items: stretch;
        }

        .btn.btn-clear {
            width: 100%;
        }
    }
</style>
