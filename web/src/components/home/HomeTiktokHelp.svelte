<script lang="ts">
    import IconBrandTiktok from '@tabler/icons-svelte/IconBrandTiktok.svelte';
    import IconArrowUpRight from '@tabler/icons-svelte/IconArrowUpRight.svelte';

    export let currentLocale: string;

    $: isZh = currentLocale === 'zh';
    $: copy = isZh ? {
        title: 'TikTok \u89c6\u9891\u4e0e\u56fe\u96c6\u4e0b\u8f7d',
        description: '\u4f7f\u7528\u5177\u4f53\u5e16\u5b50\u7684\u516c\u5f00\u5206\u4eab\u94fe\u63a5\u3002\u65e0\u6c34\u5370\u8d44\u6e90\u53d6\u51b3\u4e8e\u6765\u6e90\u662f\u5426\u53ef\u7528\uff1b\u56fe\u96c6\u4ee5\u53ef\u9009\u56fe\u7247\u663e\u793a\u3002',
        download: '\u4e0b\u8f7d\u5de5\u5177',
        guide: '\u4fdd\u5b58\u6307\u5357',
    } : {
        title: 'Download a TikTok video or photo post',
        description: 'Start with the public share link to a specific post. No-watermark sources depend on availability; photo posts appear as selectable images.',
        download: 'Downloader',
        guide: 'Saving guide',
    };
</script>

{#if currentLocale === 'en' || isZh}
    <section class="tiktok-help" aria-labelledby="home-tiktok-help-title">
        <span class="platform-icon" aria-hidden="true"><IconBrandTiktok size={22} stroke={1.7} /></span>
        <div class="copy">
            <h2 id="home-tiktok-help-title">{copy.title}</h2>
            <p>{copy.description}</p>
            <div class="links">
                <a class="download-link" href={`/${currentLocale}/download/tiktok-no-watermark`}>
                    {copy.download}<IconArrowUpRight size={14} stroke={1.6} aria-hidden="true" />
                </a>
                <a href={`/${currentLocale}/guide/tiktok-download-guide`}>{copy.guide}</a>
            </div>
        </div>
    </section>
{/if}

<style>
    .tiktok-help :global(*) { font-family: Arial, 'Microsoft YaHei', sans-serif; }
    .tiktok-help { display: flex; align-items: flex-start; gap: 14px; width: 100%; max-width: 820px; box-sizing: border-box; margin: 8px auto 0; padding: 16px 18px; border: 1px solid var(--surface-2); border-radius: 14px; background: var(--surface-1); color: var(--text); text-align: left; }
    .platform-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 38px; width: 38px; height: 38px; border-radius: 11px; background: var(--background); color: var(--text); border: 1px solid var(--surface-2); }
    .copy { flex: 1; min-width: 0; }
    h2 { margin: 0 0 5px; color: var(--text); font-size: 14px; font-weight: 600; line-height: 1.5; }
    p { margin: 0; color: var(--subtext); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
    .links { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-top: 9px; }
    a { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; color: var(--subtext); font-size: 12px; line-height: 1.5; text-decoration: none; }
    .download-link { color: var(--accent-strong); font-weight: 600; }
    a:hover { text-decoration: underline; text-underline-offset: 3px; }
    a:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 4px; border-radius: 3px; }
    @media (max-width: 535px) {
        .tiktok-help { gap: 10px; padding: 14px; border-radius: 12px; }
        .platform-icon { flex-basis: 32px; width: 32px; height: 32px; border-radius: 9px; }
        a { min-height: 36px; }
    }
</style>
