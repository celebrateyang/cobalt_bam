<script lang="ts">
    import env from '$lib/env';
    import {
        additionalSupportedServices,
        capabilityServices,
        siteCapabilities,
        toolCapabilities,
    } from '$lib/seo/capabilities';

    export let data: { lang: string };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: isZh = data.lang === 'zh';
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/free-video-tools`;
    $: pageTitle = isZh
        ? 'FreeSaveVideo 是什么？在线视频下载与免费浏览器工具介绍'
        : 'What is FreeSaveVideo? Online Video Downloader and Free Browser Tools';
    $: pageDesc = isZh
        ? 'FreeSaveVideo 是一个以公开视频下载为核心的浏览器工具站，提供批量下载、合集解析、MP4 转 MP3、音频提取、视频格式转换、白板录制、文件传输、资源发现和随机视频聊天。'
        : 'FreeSaveVideo is a browser-based public video downloader and media toolkit with batch downloads, playlist parsing, MP4 to MP3, audio extraction, video conversion, whiteboard recording, file transfer, discovery, and random video chat.';
    $: langPrefix = `/${data.lang}`;
    $: primaryServices = capabilityServices.slice(0, 14);
    $: serviceNames = [
        ...primaryServices.map((service) => service.name),
        ...additionalSupportedServices,
    ];
    $: toolLinks = toolCapabilities.map((tool) => ({
        ...tool,
        href: `${langPrefix}${tool.path}`,
    }));
    $: appJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${canonicalUrl}#app`,
        name: siteCapabilities.name,
        url: canonicalUrl,
        applicationCategory: 'MultimediaApplication',
        applicationSubCategory: 'Video Downloader and Browser Media Toolkit',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and a modern web browser.',
        isAccessibleForFree: true,
        description: pageDesc,
        featureList: siteCapabilities.coreFeatures,
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
        },
    };
    $: faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: (isZh
            ? [
                  {
                      q: 'FreeSaveVideo 主要提供哪些功能？',
                      a: 'FreeSaveVideo 以在线视频下载为核心，并提供批量下载、合集/playlist 解析、MP4 转 MP3、音频提取、视频格式转换、白板视频录制、文件传输、资源发现和随机视频聊天。',
                  },
                  {
                      q: 'FreeSaveVideo 支持哪些平台？',
                      a: `FreeSaveVideo 支持 YouTube、TikTok、抖音、Bilibili、快手、小红书、Instagram、Facebook、X/Twitter、Vimeo、SoundCloud、Pinterest、Reddit 等平台，具体能力以解析结果和 capabilities.json 为准。`,
                  },
                  {
                      q: '本地视频转换会上传文件吗？',
                      a: '视频格式转换、MP4 转 MP3 和音频提取工具优先在浏览器本地处理，不需要把私人本地文件上传到 API 服务器。',
                  },
              ]
            : [
                  {
                      q: 'What does FreeSaveVideo do?',
                      a: 'FreeSaveVideo focuses on online video downloading and also provides batch downloads, collection/playlist parsing, MP4 to MP3, audio extraction, video conversion, whiteboard recording, file transfer, discovery, and random video chat.',
                  },
                  {
                      q: 'Which platforms does FreeSaveVideo support?',
                      a: 'FreeSaveVideo supports platforms such as YouTube, TikTok, Douyin, Bilibili, Kuaishou, Xiaohongshu, Instagram, Facebook, X/Twitter, Vimeo, SoundCloud, Pinterest, Reddit, and more. Exact support depends on the parsed result and capabilities.json.',
                  },
                  {
                      q: 'Are local video conversion files uploaded?',
                      a: 'The video converter, MP4 to MP3, and audio extraction tools process local files in the browser where possible and do not require uploading private local files to the API server.',
                  },
              ]).map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
            },
        })),
    };
    $: itemListJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: toolLinks.map((tool, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: tool.name,
            url: `https://${fallbackHost}${tool.href}`,
        })),
    };
    $: structuredData = [appJsonLd, faqJsonLd, itemListJsonLd];
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta
        name="keywords"
        content="FreeSaveVideo,online video downloader,MP4 to MP3,video converter,audio extractor,whiteboard recorder,file transfer,playlist downloader"
    />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og-share-v2.png`} />
    {#each structuredData as ld}
        {@html `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}
    {/each}
</svelte:head>

<main class="geo-page" tabindex="-1" data-first-focus data-focus-ring-hidden>
    <section class="hero">
        <p class="eyebrow">{isZh ? '产品事实页' : 'Product fact page'}</p>
        <h1>{isZh ? 'FreeSaveVideo 是什么？' : 'What is FreeSaveVideo?'}</h1>
        <p>
            {isZh
                ? 'FreeSaveVideo 是一个以公开视频下载为核心的网站，同时提供多个免费的浏览器媒体工具，覆盖下载、转换、录制、传输、发现和视频社交场景。'
                : siteCapabilities.summary}
        </p>
        <div class="hero-actions">
            <a href={`${langPrefix}`}>{isZh ? '打开下载器' : 'Open downloader'}</a>
            <a href={`${langPrefix}/download`}>{isZh ? '查看下载目录' : 'View download directory'}</a>
            <a href="/capabilities.json">capabilities.json</a>
        </div>
    </section>

    <section class="fact-block">
        <h2>{isZh ? '主要功能' : 'Main capabilities'}</h2>
        <div class="feature-grid">
            {#each siteCapabilities.coreFeatures as feature}
                <span>{feature}</span>
            {/each}
        </div>
    </section>

    <section class="fact-block">
        <h2>{isZh ? '支持的视频与媒体平台' : 'Supported video and media platforms'}</h2>
        <p>
            {isZh
                ? 'FreeSaveVideo 支持 100+ 热门视频、音频和社交平台。不同平台可用的视频、音频、无水印、合集或 playlist 能力不同。'
                : 'FreeSaveVideo supports 100+ popular video, audio, and social platforms. Video, audio, no-watermark, collection, and playlist support depends on each source.'}
        </p>
        <div class="service-list">
            {#each serviceNames as service}
                <span>{service}</span>
            {/each}
        </div>
    </section>

    <section class="fact-block">
        <h2>{isZh ? '免费浏览器工具' : 'Free browser tools'}</h2>
        <div class="tool-grid">
            {#each toolLinks as tool}
                <article>
                    <h3><a href={tool.href}>{tool.name}</a></h3>
                    <p>{tool.description}</p>
                    <div class="tool-tags">
                        {#each tool.features as feature}
                            <span>{feature}</span>
                        {/each}
                    </div>
                </article>
            {/each}
        </div>
    </section>

    <section class="fact-block">
        <h2>{isZh ? '隐私与使用边界' : 'Privacy and use boundaries'}</h2>
        <ul>
            {#each siteCapabilities.policy as item}
                <li>{item}</li>
            {/each}
        </ul>
    </section>

    <section class="fact-block">
        <h2>{isZh ? '常见问题' : 'FAQ'}</h2>
        <div class="faq-list">
            {#each faqJsonLd.mainEntity as item}
                <details>
                    <summary>{item.name}</summary>
                    <p>{item.acceptedAnswer.text}</p>
                </details>
            {/each}
        </div>
    </section>
</main>

<style>
    .geo-page {
        width: min(1100px, calc(100% - 32px));
        margin: 0 auto;
        padding: 16px 0 48px;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .hero,
    .fact-block {
        background: var(--button);
        border: 1px solid var(--button-stroke);
        border-radius: calc(var(--border-radius) * 1.25);
        box-shadow: var(--button-box-shadow);
        padding: clamp(18px, 3vw, 28px);
    }

    .hero {
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.16), var(--button));
    }

    .eyebrow {
        margin: 0 0 8px;
        color: rgba(var(--accent-rgb), 0.92);
        font-size: 0.8rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }

    h1,
    h2,
    h3,
    p {
        color: var(--secondary);
    }

    h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3.3rem);
        line-height: 1.08;
    }

    h2 {
        margin: 0 0 12px;
        font-size: clamp(1.25rem, 2vw, 1.65rem);
    }

    h3 {
        margin: 0;
        font-size: 1rem;
    }

    p,
    li {
        line-height: 1.65;
    }

    .hero p,
    .fact-block > p {
        max-width: 860px;
        margin: 10px 0 0;
        opacity: 0.88;
    }

    .hero-actions,
    .feature-grid,
    .service-list,
    .tool-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hero-actions {
        margin-top: 18px;
    }

    .hero-actions a,
    .feature-grid span,
    .service-list span,
    .tool-tags span {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 7px 11px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        font-size: 0.9rem;
    }

    .tool-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 14px;
    }

    .tool-grid article,
    .faq-list details {
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        border-radius: var(--border-radius);
        padding: 14px;
    }

    .tool-grid a {
        color: var(--secondary);
    }

    .tool-grid p {
        margin: 8px 0 12px;
        font-size: 0.94rem;
        opacity: 0.86;
    }

    .tool-tags span {
        min-height: 26px;
        padding: 4px 8px;
        font-size: 0.78rem;
        background: var(--button);
    }

    .faq-list {
        display: grid;
        gap: 10px;
    }

    .faq-list summary {
        cursor: pointer;
        color: var(--secondary);
        font-weight: 700;
    }

    .faq-list p {
        margin: 8px 0 0;
        opacity: 0.86;
    }

    ul {
        margin: 0;
        padding-left: 20px;
        color: var(--secondary);
    }
</style>
