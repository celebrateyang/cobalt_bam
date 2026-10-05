<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { isDownloadAvailableInLanguage } from "$lib/seo/internal-links";
    import IconBrandYoutube from "@tabler/icons-svelte/IconBrandYoutube.svelte";
    import IconBrandTiktok from "@tabler/icons-svelte/IconBrandTiktok.svelte";
    import IconBrandInstagram from "@tabler/icons-svelte/IconBrandInstagram.svelte";
    import IconBrandFacebook from "@tabler/icons-svelte/IconBrandFacebook.svelte";
    import IconBrandX from "@tabler/icons-svelte/IconBrandX.svelte";
    import IconBrandBilibili from "@tabler/icons-svelte/IconBrandBilibili.svelte";
    import IconBrandPinterest from "@tabler/icons-svelte/IconBrandPinterest.svelte";
    import IconBrandReddit from "@tabler/icons-svelte/IconBrandReddit.svelte";

    export let currentLocale: string;
    const platforms = [
        { name: "YouTube", slug: "youtube-download", icon: IconBrandYoutube, color: "#d92626" },
        { name: "TikTok", slug: "tiktok-no-watermark", icon: IconBrandTiktok, color: "var(--text)" },
        { name: "Instagram", slug: "instagram-video-download", icon: IconBrandInstagram, color: "#c43c80" },
        { name: "Facebook", slug: "facebook-video-download", icon: IconBrandFacebook, color: "#1877f2" },
        { name: "X", slug: "twitter-x-video-download", icon: IconBrandX, color: "var(--text)" },
        { name: "Bilibili", slug: "bilibili-video-download", icon: IconBrandBilibili, color: "#1689aa" },
        { name: "Pinterest", slug: "pinterest-video-download", icon: IconBrandPinterest, color: "#bd081c" },
        { name: "Reddit", slug: "reddit-video-download", icon: IconBrandReddit, color: "#d94c15" },
    ];
</script>

<section class="platform-picker" aria-labelledby="popular-platforms-title">
    <div class="heading">
        <h2 id="popular-platforms-title">{$t("home.welcome.platforms")}</h2>
        <a href={`/${currentLocale}/download`}>{$t("home.welcome.more")} <span aria-hidden="true">&rarr;</span></a>
    </div>
    <div class="platforms">
        {#each platforms as platform}
            <a href={isDownloadAvailableInLanguage(platform.slug, currentLocale)
                ? `/${currentLocale}/download/${platform.slug}`
                : `/${currentLocale}/download`}>
                <span class="icon" style:color={platform.color} aria-hidden="true"><svelte:component this={platform.icon} size={27} stroke={1.8} /></span>
                <span>{platform.name}</span>
            </a>
        {/each}
    </div>
</section>

<style>
    .platform-picker :global(*) { font-family: Arial, sans-serif; }
    .platform-picker { width: 100%; max-width: 1096px; margin: 12px auto 22px; box-sizing: border-box; font-family: Arial, sans-serif; }
    .heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    h2 { margin: 0; font-size: 16px; color: var(--text); }
    .heading a { color: var(--subtext); font-size: 13px; text-underline-offset: 3px; }
    .platforms { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 10px; }
    .platforms a { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 17px 8px; border: 1px solid var(--surface-2); border-radius: 14px; background: var(--surface-1); color: var(--text); text-decoration: none; font-size: 13px; font-weight: 600; }
    .icon { display: grid; place-items: center; height: 30px; }
    .platforms a:hover { background: var(--accent-background); border-color: var(--accent); }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    @media (max-width: 700px) { .platforms { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
