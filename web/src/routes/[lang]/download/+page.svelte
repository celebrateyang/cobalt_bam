<script lang="ts">
    import env from '$lib/env';
    import { getDirectoryCopy } from '$lib/seo/directory-copy';
    import { jsonLdScript } from '$lib/seo/json-ld';

    import catalog from '$lib/data/platform-directory.json';
    import { capabilityServices } from '$lib/seo/capabilities';
    import { getPlatformDirectoryCopy } from '$lib/seo/platform-directory-copy';
    import PlatformMark from '$components/home/PlatformMark.svelte';

    let query = '';
    const chineseNames: Record<string, string> = {"douyin":"抖音","bilibili":"哔哩哔哩","wechat_channels":"视频号","xiaohongshu":"小红书","iqiyi":"爱奇艺","kuaishou":"快手","xinpianchang":"新片场","weibo":"微博","haokan":"好看视频","toutiao":"今日头条","sohu":"搜狐视频","kugou":"酷狗音乐","cctv":"央视网","tencent_video":"腾讯视频","bjnews":"新京报","ourjiangsu":"我苏网"};
    $: ui = getPlatformDirectoryCopy(data.lang);
    $: needle = query.trim().toLocaleLowerCase();
    const matches = (name: string, id: string, search: string) => `${name} ${id}`.toLocaleLowerCase().includes(search);
    $: platforms = catalog.primary.map(item => ({
        ...item,
        searchName: item.name,
        name: data.lang === 'zh' ? chineseNames[item.id] || item.name : item.name,
        image: 'image' in item ? String(item.image) : undefined,
        slug: capabilityServices.find(service => service.id === item.id)?.landingSlug,
    }));
    $: primary = platforms.filter(item => matches(`${item.name} ${item.searchName}`, item.id.replace(/_/g, ' '), needle));
    $: additional = catalog.additional.filter(item => matches(item.name, item.id, needle));
    function platformHref(slug?: string) {
        return slug && data.cards.some(card => card.slug === slug) ? `/${data.lang}/download/${slug}` : `/${data.lang}/`;
    }

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
    <main class="container" tabindex="-1" data-first-focus data-focus-ring-hidden>
        <nav class="breadcrumb" aria-label={copy.home}><a href={`/${data.lang}/`}>FreeSaveVideo</a><span>/</span><span>{pageTitle}</span></nav>
        <header class="hero">
            <div class="eyebrow">FreeSaveVideo · {ui.all}</div>
            <h1>{pageTitle}</h1>
            <p class="intro">{ui.intro}</p>
            <div class="trust"><a href={`/${data.lang}/free-points`}>✓ {ui.free}</a><span>✓ {ui.ads}</span></div>
            <a class="start" href={`/${data.lang}/`}>{ui.start} <span aria-hidden="true">↗</span></a>
        </header>

        <div class="search-bar">
            <label for="platform-search"><span aria-hidden="true">⌕</span><input id="platform-search" type="search" bind:value={query} placeholder={ui.search} aria-label={ui.search} /></label>
            <a href={`/${data.lang}/guide`}>{copy.guides} ↗</a>
        </div>

        <section aria-labelledby="primary-heading">
            <div class="section-heading"><div><h2 id="primary-heading">{ui.primary} <span class="count">{primary.length}</span></h2><p>{ui.primaryNote}</p></div></div>
            <div class="platform-grid">
                {#each primary as item (item.id)}
                    <a class="platform" href={platformHref(item.slug)}>
                        <PlatformMark name={item.name} logo={item.logo} color={item.color} image={item.image} />
                        <span class="platform-name">{item.name}</span><span class="arrow" aria-hidden="true">↗</span>
                    </a>
                {/each}
            </div>
        </section>

        <section class="extended" aria-labelledby="additional-heading">
            <div class="section-heading"><div><h2 id="additional-heading">{ui.additional}</h2><p>{ui.additionalNote}</p></div></div>
            <div class="platform-grid compact">
                {#each (needle ? additional : additional.slice(0, 48)) as item (item.id)}
                    <a class="platform" href={`/${data.lang}/`}><PlatformMark name={item.name} logo={item.logo} color={item.color} /><span class="platform-name">{item.name}</span><span class="arrow" aria-hidden="true">↗</span></a>
                {/each}
            </div>
            {#if !needle && additional.length > 48}
                <details class="all-platforms">
                    <summary>{ui.more} <span aria-hidden="true">＋</span></summary>
                    <div class="platform-grid compact">
                        {#each additional.slice(48) as item (item.id)}
                            <a class="platform" href={`/${data.lang}/`}><PlatformMark name={item.name} logo={item.logo} color={item.color} /><span class="platform-name">{item.name}</span></a>
                        {/each}
                    </div>
                </details>
            {/if}
        </section>
        {#if !primary.length && !additional.length}<p class="empty" role="status">{ui.empty}</p>{/if}

        <details class="task-directory">
            <summary>{ui.tasks}</summary>
            <div class="task-grid">
                {#each data.cards as item}
                    <div><a href={`/${data.lang}/download/${item.slug}`}>{item.h1}</a>{#if item.guideSlug}<a class="guide" href={`/${data.lang}/guide/${item.guideSlug}`}>{copy.guide} ↗</a>{/if}</div>
                {/each}
            </div>
        </details>
        <footer><p>{ui.disclaimer}</p><div><a href={`/${data.lang}/faq`}>{copy.faq}</a><a href={`/${data.lang}/about/contact`}>{ui.help} ↗</a>{#if data.lang === 'en'}<a href="/en/learn">Learn</a>{/if}</div></footer>
    </main>
</div>

<style>
    .page { width: 100%; padding: 24px 32px 64px; color: var(--text); font-family: 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif; }
    .page .hero h1, .page h2, .page p, .page a, .page input, .page summary, .page .platform-name { font-family: 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif; }
    .container { max-width: 1120px; margin: 0 auto; }
    .breadcrumb { display: flex; gap: 10px; font-size: 12px; opacity: .7; margin-bottom: 28px; }
    a { color: inherit; text-decoration: none; }
    .hero { position: relative; padding: 42px; border: 1px solid var(--button-stroke); border-radius: 24px; background: linear-gradient(115deg, color-mix(in srgb, var(--accent) 9%, var(--background)), var(--background)); }
    .eyebrow { color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .06em; margin-bottom: 12px; }
    h1 { max-width: 760px; font-size: clamp(28px, 3vw, 40px); line-height: 1.2; letter-spacing: -.035em; margin: 0; color: var(--text); }
    .intro { font-size: 17px; margin: 16px 0 20px; opacity: .7; line-height: 1.6; }
    .trust { display: flex; flex-wrap: wrap; gap: 20px; font-size: 13px; color: var(--accent); }
    .trust a:hover { text-decoration: underline; }
    .start { display: inline-flex; gap: 24px; padding: 12px 18px; background: var(--accent); color: var(--white); border-radius: 10px; margin-top: 24px; font-size: 14px; font-weight: 600; }
    .search-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 32px 0; }
    .search-bar label { width: 480px; max-width: 100%; display: flex; align-items: center; gap: 12px; border: 1px solid var(--button-stroke); border-radius: 12px; padding: 12px 16px; background: var(--button); }
    .search-bar label > span { font-size: 26px; line-height: 1; opacity: .5; }
    input { width: 100%; min-width: 0; background: transparent; border: 0; font: inherit; font-size: 14px; color: var(--text); }
    .search-bar label:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
    input:focus { outline: none; }
    .search-bar > a { font-size: 13px; color: var(--accent); }
    .section-heading { display: flex; margin-bottom: 20px; }
    h2 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -.02em; }
    .count { border-radius: 7px; background: var(--button); font-size: 12px; font-weight: 500; padding: 4px 7px; opacity: .6; }
    .section-heading p { font-size: 13px; line-height: 1.6; opacity: .65; margin: 8px 0 0; }
    .platform-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .platform { display: flex; align-items: center; gap: 12px; padding: 18px 16px; border: 1px solid var(--button-stroke); background: var(--background); border-radius: 14px; min-width: 0; transition: border-color .15s, transform .15s, box-shadow .15s; }
    .platform:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 5px 16px #00000008; }
    .platform:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .platform-name { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .arrow { margin-left: auto; opacity: .35; font-size: 14px; }
    .extended { margin-top: 42px; padding-top: 32px; border-top: 1px solid var(--button-stroke); }
    .compact .platform { padding: 12px; }
    .compact .platform-name { font-size: 13px; font-weight: 500; }
    summary { cursor: pointer; font-size: 14px; font-weight: 600; }
    .all-platforms { margin-top: 20px; }
    .all-platforms > summary { width: fit-content; margin: 0 auto; padding: 12px 22px; border: 1px solid var(--button-stroke); border-radius: 10px; color: var(--accent); }
    .all-platforms[open] > summary { margin-bottom: 20px; }
    .task-directory { border-top: 1px solid var(--button-stroke); margin-top: 36px; padding: 24px 0; }
    .task-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; padding-top: 24px; }
    .task-grid > div { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
    .guide { opacity: .6; font-size: 12px; }
    .task-grid a:hover, footer a:hover { text-decoration: underline; }
    footer { border-top: 1px solid var(--button-stroke); padding-top: 18px; display: flex; gap: 24px; justify-content: space-between; font-size: 11px; opacity: .6; line-height: 1.6; }
    footer p { max-width: 660px; margin: 0; }
    footer > div { display: flex; gap: 18px; flex-shrink: 0; }
    .empty { text-align: center; padding: 30px; opacity: .7; }
    @media (max-width: 1000px) { .platform-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 680px) { .page { padding: 20px 16px 40px; } .hero { padding: 26px 22px; } .breadcrumb { margin-bottom: 20px; } .platform-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .platform { padding: 12px 10px; gap: 8px; } .platform-name { font-size: 12px; } .arrow { display: none; } .search-bar { flex-direction: column; align-items: stretch; margin: 24px 0; } .search-bar label { width: auto; } .search-bar > a { align-self: flex-end; } .task-grid { grid-template-columns: 1fr; } footer { flex-direction: column; gap: 12px; } h2 { font-size: 20px; } }
</style>
