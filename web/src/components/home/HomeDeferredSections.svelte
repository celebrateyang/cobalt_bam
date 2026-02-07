<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import {
        featuredDownloadLinks,
        homePlatformToDownloadSlug,
    } from "$lib/seo/internal-links";

    export let currentLocale: string;
    export let canonicalUrl: string;
    export let platformCards: Array<{
        slug: string;
        name: string;
        desc: string;
    }>;
    export let seoTitle: string;
    export let seoDescription: string;
    export let guideDescription1: string;
    export let guideDescription2: string;
    export let embedDescription: string;
    export let seoKeywords: string;

    let showMindsou = false;
    let showYumcheck = false;

    const platformHref = (slug: string) =>
        homePlatformToDownloadSlug[slug]
            ? `/${currentLocale}/download/${homePlatformToDownloadSlug[slug]}`
            : slug === "youtube"
            ? `/${currentLocale}/youtube-video-downloader`
            : canonicalUrl
              ? `${canonicalUrl}#platform-${slug}`
              : `/${currentLocale}#platform-${slug}`;

    const linkLabel = (platform: string) =>
        currentLocale === "zh"
            ? `${platform} 下载`
            : `${platform} downloader`;
</script>

<section class="platform-section seo-section" id="platforms">
    <div class="platform-heading">
        <h2>{$t("home.platforms.title")}</h2>
        <p>
            {$t("home.platforms.description")}
        </p>
    </div>
    <div class="platform-grid">
        {#each platformCards as card}
            <a
                class="platform-card"
                id={"platform-" + card.slug}
                href={platformHref(card.slug)}
            >
                <div class="platform-name">{card.name}</div>
                <p>{card.desc}</p>
            </a>
        {/each}
    </div>
</section>

<section class="internal-hub seo-section" aria-label="Internal links">
    <h2>{currentLocale === "zh" ? "快速入口" : "Quick links"}</h2>
    <div class="internal-links">
        <a class="hub-link hub-link--primary" href={`/${currentLocale}/download`}>
            Download directory
        </a>
        <a class="hub-link hub-link--primary" href={`/${currentLocale}/guide`}>
            {currentLocale === "zh" ? "下载指南中心" : "Guide hub"}
        </a>
        <a class="hub-link hub-link--primary" href={`/${currentLocale}/faq`}>
            FAQ
        </a>
        {#each featuredDownloadLinks.slice(0, 8) as item}
            <a class="hub-link" href={`/${currentLocale}/download/${item.slug}`}>
                {linkLabel(item.platform)}
            </a>
        {/each}
    </div>
</section>

<section class="seo-hero seo-section">
    <h1>{seoTitle}</h1>
    <p>{seoDescription}</p>
</section>

<section class="seo-body seo-section">
    <div class="seo-text">
        <h2>{$t("general.guide.title")}</h2>
        <p>{guideDescription1}</p>
        <p>{guideDescription2}</p>
    </div>

    <div class="seo-grid">
        <article class="seo-card">
            <h3>{$t("tabs.feature.media_downloader")}</h3>
            <p>{seoDescription}</p>
        </article>
        <article class="seo-card">
            <h3>{$t("tabs.feature.file_transfer")}</h3>
            <p>{$t("general.seo.transfer.description")}</p>
        </article>
        <article class="seo-card">
            <h3>{$t("tabs.feature.discover_trends")}</h3>
            <p>{$t("general.seo.discover.description")}</p>
        </article>
        <article class="seo-card">
            <h3>{embedDescription}</h3>
            <p>{seoKeywords}</p>
        </article>
    </div>
</section>

<section id="promotions">
    <section id="mindsou">
        <button
            type="button"
            class="accordion-header"
            aria-expanded={showMindsou}
            on:click={() => (showMindsou = !showMindsou)}
        >
            <img
                src="/popularize/mindsou_logo.png"
                alt="Mindsou Logo"
                class="section-icon"
            />
            <span>{$t("general.promotions.mindsou.title")}</span>
            <span class="arrow">{showMindsou ? "▲" : "▼"}</span>
        </button>
        {#if showMindsou}
            <div class="details" role="region">
                <ul>
                    <li>{$t("general.promotions.mindsou.features.1")}</li>
                    <li>{$t("general.promotions.mindsou.features.2")}</li>
                    <li>{$t("general.promotions.mindsou.features.3")}</li>
                    <li>{$t("general.promotions.mindsou.features.4")}</li>
                    <li>{$t("general.promotions.mindsou.features.5")}</li>
                </ul>
                <a
                    class="button"
                    href="https://mindsou.online"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {$t("general.promotions.mindsou.visit")}
                </a>
            </div>
        {/if}
    </section>

    <section id="yumcheck">
        <button
            type="button"
            class="accordion-header"
            aria-expanded={showYumcheck}
            on:click={() => (showYumcheck = !showYumcheck)}
        >
            <img
                src="/popularize/yumcheck.ico"
                alt="YumCheck Logo"
                class="section-icon"
            />
            <span>{$t("general.promotions.yumcheck.title")}</span>
            <span class="arrow">{showYumcheck ? "▲" : "▼"}</span>
        </button>
        {#if showYumcheck}
            <div class="details" role="region">
                <ul>
                    <li>{$t("general.promotions.yumcheck.features.1")}</li>
                    <li>{$t("general.promotions.yumcheck.features.2")}</li>
                    <li>{$t("general.promotions.yumcheck.features.3")}</li>
                    <li>{$t("general.promotions.yumcheck.features.4")}</li>
                </ul>
                <a
                    class="button"
                    href="https://yumcheck.online"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {$t("general.promotions.yumcheck.visit")}
                </a>
            </div>
        {/if}
    </section>
</section>

<style>
    .seo-section {
        width: 100%;
        max-width: 1100px;
        margin: 28px auto;
        padding: 0 var(--padding);
        box-sizing: border-box;
        content-visibility: auto;
        contain-intrinsic-size: 1px 680px;
    }

    .seo-hero {
        padding: 22px 20px;
        border-radius: 16px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.04);
    }

    .seo-hero h1 {
        margin: 0 0 10px;
        font-size: clamp(22px, 3vw, 30px);
        line-height: 1.25;
        color: var(--secondary);
    }

    .seo-hero p {
        margin: 0;
        font-size: 15px;
        color: var(--secondary-600);
        line-height: 1.55;
        max-width: 900px;
    }

    .internal-hub {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .internal-hub h2 {
        margin: 0;
        font-size: clamp(18px, 2.2vw, 22px);
        color: var(--secondary);
    }

    .internal-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hub-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
        color: var(--text);
        text-decoration: none;
        font-size: 0.88rem;
        line-height: 1.2;
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }

    .hub-link:hover {
        background: var(--surface-2);
        border-color: var(--accent);
    }

    .hub-link--primary {
        border-color: rgba(var(--accent-rgb), 0.32);
        background: rgba(var(--accent-rgb), 0.12);
        color: var(--secondary);
        font-weight: 600;
    }

    .seo-body {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .seo-text h2 {
        margin: 0;
        font-size: clamp(19px, 2.4vw, 24px);
        color: var(--secondary);
    }

    .seo-text p {
        margin: 6px 0 0;
        color: var(--secondary-600);
        line-height: 1.65;
        max-width: 960px;
    }

    .seo-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        width: 100%;
    }

    .seo-card {
        padding: 16px;
        border-radius: 14px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
    }

    .seo-card h3 {
        margin: 0;
        font-size: 15px;
        color: var(--secondary);
    }

    .seo-card p {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.5;
        font-size: 14px;
    }

    .platform-section {
        width: 100%;
        max-width: 1100px;
        margin: 0 auto 12px;
        padding: 0 var(--padding);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
        content-visibility: auto;
        contain-intrinsic-size: 1px 480px;
    }

    .platform-heading h2 {
        margin: 0;
        font-size: clamp(19px, 2.4vw, 24px);
        color: var(--accent-strong);
    }

    .platform-heading p {
        margin: 6px 0 0;
        color: var(--secondary-600);
        line-height: 1.55;
    }

    .platform-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .platform-card {
        display: block;
        padding: 14px;
        border-radius: 12px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        text-decoration: none;
        color: var(--text);
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }

    .platform-card:hover {
        border-color: var(--accent);
        background: var(--surface-2);
    }

    .platform-name {
        font-weight: 600;
        margin-bottom: 6px;
        color: var(--accent-strong);
    }

    .platform-card p {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.45;
        font-size: 14px;
    }

    ul {
        list-style: disc;
        padding-left: var(--padding);
    }

    a {
        text-decoration: none;
        color: var(--blue);
    }

    .button {
        display: inline-block;
        padding: 10px 20px;
        background-color: var(--secondary);
        color: var(--primary);
        border-radius: var(--border-radius);
        text-align: center;
    }

    #promotions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--padding);
        padding: var(--padding) 0;
        content-visibility: auto;
        contain-intrinsic-size: 1px 460px;
    }

    #promotions > section {
        display: flex;
        flex-direction: column;
        padding: var(--padding);
        background-color: var(--popup-bg);
        border-radius: var(--border-radius);
        width: 100%;
        max-width: 640px;
        box-sizing: border-box;
        gap: 12px;
        transition: background-color 0.2s ease;
    }

    .accordion-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        padding: var(--padding);
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        transition: background-color 0.2s;
        gap: 8px;
    }

    .accordion-header:hover {
        background: var(--secondary-bg);
    }

    .arrow {
        font-size: 0.9rem;
    }

    .details {
        padding: calc(var(--padding) / 2) var(--padding);
        background: var(--popup-bg);
        border-bottom-left-radius: var(--border-radius);
        border-bottom-right-radius: var(--border-radius);
        margin-bottom: var(--padding);
    }

    #promotions > section#mindsou,
    #promotions > section#yumcheck {
        background-color: var(--popup-bg);
        color: var(--primary);
    }

    #promotions > section#yumcheck .accordion-header {
        justify-content: center;
        text-align: center;
    }

    @media (prefers-color-scheme: light) {
        #promotions > section#mindsou,
        #promotions > section#yumcheck {
            background-color: var(--sidebar-bg);
            color: #ffffff;
        }

        #promotions .accordion-header,
        #promotions .details {
            background: transparent;
            color: inherit;
        }

        #promotions .accordion-header:hover {
            background-color: #5c8f24;
        }

        #promotions a.button {
            background-color: #ffffff;
            color: var(--sidebar-bg);
        }
    }

    @media (prefers-color-scheme: dark) {
        #promotions > section#mindsou,
        #promotions > section#yumcheck {
            color: #ffffff;
        }

        #promotions a.button {
            color: #ffffff;
        }
    }

    .section-icon {
        width: 24px;
        height: 24px;
        margin: 0;
    }

    #promotions > section .section-icon {
        max-width: 100%;
    }

    @media (max-width: 600px) {
        .seo-section {
            padding: 0 14px;
            margin: 16px auto;
        }

        .seo-hero {
            padding: 16px;
        }

        .seo-hero h1 {
            font-size: clamp(18px, 5vw, 24px);
        }

        .seo-hero p {
            font-size: 14px;
        }

        .seo-grid {
            grid-template-columns: 1fr;
            gap: 10px;
        }

        .seo-card {
            padding: 14px;
        }

        .seo-text p {
            font-size: 14px;
        }

        .platform-section {
            margin-bottom: 8px;
        }

        .platform-grid {
            grid-template-columns: 1fr;
            gap: 10px;
        }

        .platform-card {
            padding: 12px;
        }

        #promotions {
            padding-bottom: calc(env(safe-area-inset-bottom, 20px) + 80px);
        }
    }
</style>
