<script lang="ts">
    export let currentLocale: string;

    $: isZh = currentLocale === 'zh';
    $: copy = isZh ? {
        title: 'TikTok \u89c6\u9891\u4e0e\u56fe\u96c6\u4e0b\u8f7d',
        description: '\u4f7f\u7528\u5177\u4f53\u5e16\u5b50\u7684\u516c\u5f00\u5206\u4eab\u94fe\u63a5\u3002\u65e0\u6c34\u5370\u8d44\u6e90\u53d6\u51b3\u4e8e\u6765\u6e90\u662f\u5426\u53ef\u7528\uff1b\u56fe\u96c6\u4ee5\u53ef\u9009\u56fe\u7247\u663e\u793a\u3002',
        download: '\u6253\u5f00 TikTok \u4e0b\u8f7d\u5668',
        guide: '\u9884\u89c8\u540e\u6ca1\u627e\u5230\u6587\u4ef6\uff1f\u67e5\u770b\u4fdd\u5b58\u6307\u5357',
    } : {
        title: 'Download a TikTok video or photo post',
        description: 'Start with the public share link to a specific post. No-watermark sources depend on availability; photo posts appear as selectable images.',
        download: 'Open the TikTok downloader',
        guide: 'Preview but no file? Follow the saving guide',
    };
</script>

{#if currentLocale === 'en' || isZh}
    <section class="tiktok-help" aria-labelledby="home-tiktok-help-title">
        <h2 id="home-tiktok-help-title">{copy.title}</h2>
        <p>{copy.description}</p>
        <div class="links">
            <a href={`/${currentLocale}/download/tiktok-no-watermark`}>{copy.download}</a>
            <a href={`/${currentLocale}/guide/tiktok-download-guide`}>{copy.guide}</a>
        </div>
    </section>
{/if}

<style>
    .tiktok-help { width: 100%; box-sizing: border-box; margin-top: 20px; padding: 16px; border: 1px solid var(--button-stroke); border-radius: 12px; }
    h2 { margin: 0 0 8px; font-size: 16px; line-height: 1.4; }
    p { margin: 0; font-size: 13px; line-height: 1.6; }
    .links { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 12px; }
    a { color: var(--accent); font-size: 13px; line-height: 1.5; text-decoration: underline; text-underline-offset: 3px; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
</style>
