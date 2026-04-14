<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { homePlatformToDownloadSlug } from "$lib/seo/internal-links";

    export let currentLocale: string;
    export let canonicalUrl: string;
    export let platformCards: Array<{
        slug: string;
        name: string;
        desc: string;
    }>;
    export let guideDescription1: string;
    export let guideDescription2: string;

    const platformHref = (slug: string) =>
        homePlatformToDownloadSlug[slug]
            ? `/${currentLocale}/download/${homePlatformToDownloadSlug[slug]}`
            : slug === "youtube"
            ? `/${currentLocale}/youtube-video-downloader`
            : canonicalUrl
              ? `${canonicalUrl}#platform-${slug}`
              : `/${currentLocale}#platform-${slug}`;
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

<section class="seo-body seo-section">
    <div class="seo-text">
        <h2>{$t("general.guide.title")}</h2>
        <p>{guideDescription1}</p>
        <p>{guideDescription2}</p>
    </div>

    <div class="seo-grid">
        <article class="seo-card">
            <h3>{$t("home.capabilities.watermark.title")}</h3>
            <p>{$t("home.capabilities.watermark.desc")}</p>
        </article>
        <article class="seo-card">
            <h3>{$t("home.capabilities.collection.title")}</h3>
            <p>{$t("home.capabilities.collection.desc")}</p>
        </article>
        <article class="seo-card">
            <h3>{$t("home.capabilities.batch.title")}</h3>
            <p>{$t("home.capabilities.batch.desc")}</p>
        </article>
        <article class="seo-card">
            <h3>{$t("home.capabilities.audio.title")}</h3>
            <p>{$t("home.capabilities.audio.desc")}</p>
        </article>
    </div>
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

    @media (max-width: 600px) {
        .seo-section {
            padding: 0 14px;
            margin: 16px auto;
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
    }
</style>
