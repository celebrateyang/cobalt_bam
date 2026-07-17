<script lang="ts">
    import env from '$lib/env';
    import { getGuidePage } from '$lib/seo/guide-pages';
    import { getSeoLandingLocale, getSeoLandingPage, EN_BRAND, ZH_BRAND } from '$lib/seo/landing-pages';
    import { getRelatedDownloadLinks, getRelatedGuideLinks } from '$lib/seo/internal-links';
    import { getPlatformKey, getSeoRuntimeContent } from '$lib/seo/runtime-content';

    import SupportedServices from '$components/save/SupportedServices.svelte';

    export let data: {
        lang: string;
        slug: string;
        guide: import('$lib/seo/guide-pages').GuidePage;
        landing: import('$lib/seo/landing-pages').SeoLandingPage;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: localeContent = getSeoLandingLocale(data.landing, data.lang);
    $: isZh = data.lang === 'zh';
    type GuideSeoCopy = {
        title: (platform: string) => string;
        description: (platform: string) => string;
    };
    const guideSeoCopy: Record<string, GuideSeoCopy> = {
        de: {
            title: (platform) => `So laden Sie ${platform}-Videos herunter`,
            description: (platform) => `Schritt-für-Schritt-Anleitung zum Kopieren eines unterstützten ${platform}-Links, Einfügen in den Downloader und Speichern der verfügbaren Formate.`,
        },
        en: {
            title: (platform) => `How to Download ${platform} Videos`,
            description: (platform) => `Learn how to copy a supported ${platform} link, paste it into the downloader, choose an available format, and fix common link errors.`,
        },
        es: {
            title: (platform) => `Cómo descargar videos de ${platform}`,
            description: (platform) => `Guía paso a paso para copiar un enlace compatible de ${platform}, pegarlo en el descargador, elegir un formato disponible y resolver errores comunes.`,
        },
        fr: {
            title: (platform) => `Comment télécharger des vidéos ${platform}`,
            description: (platform) => `Guide étape par étape pour copier un lien ${platform} compatible, le coller dans le téléchargeur, choisir un format et corriger les erreurs courantes.`,
        },
        ja: {
            title: (platform) => `${platform}動画をダウンロードする方法`,
            description: (platform) => `対応している${platform}リンクをコピーし、ダウンローダーに貼り付け、利用可能な形式を選び、一般的なリンクエラーを解決する手順です。`,
        },
        ko: {
            title: (platform) => `${platform} 동영상 다운로드 방법`,
            description: (platform) => `지원되는 ${platform} 링크를 복사하고 다운로더에 붙여 넣은 뒤 사용 가능한 형식을 선택하고 일반적인 링크 오류를 해결하는 방법입니다.`,
        },
        ru: {
            title: (platform) => `Как скачать видео с ${platform}`,
            description: (platform) => `Пошаговая инструкция: скопируйте поддерживаемую ссылку ${platform}, вставьте ее в загрузчик, выберите доступный формат и устраните типичные ошибки.`,
        },
        th: {
            title: (platform) => `วิธีดาวน์โหลดวิดีโอ ${platform}`,
            description: (platform) => `คำแนะนำทีละขั้นตอนสำหรับคัดลอกลิงก์ ${platform} ที่รองรับ วางในตัวดาวน์โหลด เลือกรูปแบบที่มี และแก้ข้อผิดพลาดของลิงก์ที่พบบ่อย`,
        },
        vi: {
            title: (platform) => `Cách tải video ${platform}`,
            description: (platform) => `Hướng dẫn từng bước để sao chép liên kết ${platform} được hỗ trợ, dán vào trình tải, chọn định dạng có sẵn và xử lý lỗi liên kết thường gặp.`,
        },
        zh: {
            title: (platform) => `如何下载 ${platform} 视频`,
            description: (platform) => `分步骤说明如何复制受支持的 ${platform} 链接、粘贴到下载器、选择可用格式，并处理常见的链接错误。`,
        },
    };
    $: localizedGuideCopy = guideSeoCopy[data.lang] ?? guideSeoCopy.en;
    $: guideTitle = localizedGuideCopy.title(data.guide.platform);
    $: pageTitle = `${guideTitle} - ${isZh ? ZH_BRAND : EN_BRAND}`;
    $: pageDesc = localizedGuideCopy.description(data.guide.platform);
    $: pageKeywords = localeContent.metaKeywords.join(',');
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/guide/${data.slug}`;
    $: downloadUrl = `https://${fallbackHost}/${data.lang}/download/${data.guide.landingSlug}`;
    $: guideIndexUrl = `/${data.lang}/guide`;
    $: faqUrl = `/${data.lang}/faq`;
    $: discoverUrl = `/${data.lang}/discover`;
    $: downloadHubUrl = `/${data.lang}/download`;
    $: learnUrl = '/en/learn';
    $: relatedGuides = getRelatedGuideLinks(
        data.slug,
        6,
        data.lang === 'en' ? 'international' : 'all',
    );
    $: relatedDownloads = getRelatedDownloadLinks(
        data.guide.landingSlug,
        6,
        data.lang === 'en' ? 'international' : 'all',
    );
    $: downloadHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u89c6\u9891\u4e0b\u8f7d\u76ee\u5f55' : 'Popular video downloader directory';
    $: currentDownloadLabel = isZh ? localeContent.h1 : localeContent.h1;
    $: guideHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u4e0b\u8f7d\u6307\u5357' : 'Popular download guides';
    $: faqLabel = isZh ? '\u89c6\u9891\u4e0b\u8f7d\u5e38\u89c1\u95ee\u9898' : 'Video download FAQ';
    $: discoverLabel = isZh ? '\u70ed\u95e8\u89c6\u9891\u53d1\u73b0' : 'Trending video discovery';
    const relatedGuideLabel = (slug: string, platform: string) => {
        const guide = getGuidePage(slug);
        const landing = guide ? getSeoLandingPage(guide.landingSlug) : null;
        const label = landing ? getSeoLandingLocale(landing, data.lang).h1 : platform;
        return isZh ? `${label}\u6307\u5357` : `How to download ${label}`;
    };
    const relatedDownloadLabel = (slug: string, platform: string) => {
        const landing = getSeoLandingPage(slug);
        const label = landing ? getSeoLandingLocale(landing, data.lang).h1 : platform;
        return isZh ? label : label;
    };
    $: showDouyinTutorialVideo = data.slug === 'douyin-download-guide';
    const douyinTutorialEmbedUrl =
        'https://player.bilibili.com/player.html?bvid=BV1sLB7BSEWu&page=1';
    $: douyinTutorialTitle = isZh
        ? '\u89c6\u9891\u6559\u7a0b\uff1a\u5982\u4f55\u83b7\u53d6\u6b63\u786e\u7684\u6296\u97f3\u89c6\u9891\u94fe\u63a5'
        : 'Video tutorial: how to copy the correct Douyin video link';
    $: douyinTutorialBody = isZh
        ? '\u5982\u679c\u4f60\u590d\u5236\u5230\u7684\u662f search \u6216 jingxuan \u9875\u9762\uff0c\u53ef\u4ee5\u5148\u770b\u4e0b\u9762\u7684\u6f14\u793a\uff0c\u6309\u6d41\u7a0b\u6253\u5f00\u5177\u4f53\u89c6\u9891\u540e\u518d\u590d\u5236\u5206\u4eab\u94fe\u63a5\u3002'
        : 'If you copied a search or jingxuan page instead of a video share link, this tutorial shows how to open the actual video first and copy the right URL.';

    const ctaLabel = isZh ? '\u53bb\u4e0b\u8f7d' : 'Download Now';
    const ctaHint = isZh ? '\u8df3\u8f6c\u5230\u4e0b\u8f7d\u9875\u9762' : 'Open the downloader';
    $: runtimeContent = getSeoRuntimeContent(data.lang);
    $: contentUpdatedAt = runtimeContent.updatedAt;
    $: platformKey = getPlatformKey(data.slug);
    $: productFaqs = runtimeContent.productFaqs;
    $: productTips = runtimeContent.productTips;
    $: productAdvantages = runtimeContent.productAdvantages;
    $: releaseNotes = runtimeContent.releaseNotes;
    $: platformFaqs = runtimeContent.platformFaqs[platformKey] ?? runtimeContent.platformFaqs.generic;
    $: platformPlaybook =
        runtimeContent.platformPlaybooks[platformKey] ?? runtimeContent.platformPlaybooks.generic;
    $: platformFailureCases =
        runtimeContent.platformFailureCases[platformKey] ?? runtimeContent.platformFailureCases.generic;
    $: landingFaqs = data.guide.landingSlug === 'youtube-download'
        ? localeContent.faqs.slice(1)
        : localeContent.faqs;
    $: freeTools = runtimeContent.freeTools.map((tool) => ({
        title: tool.title,
        desc: tool.desc,
        href: `/${data.lang}/${tool.path}`,
    }));
    $: mergedFaqs = (() => {
        const ordered = [...platformFaqs, ...productFaqs, ...landingFaqs];
        const seen = new Set<string>();
        return ordered.filter((item) => {
            if (seen.has(item.q)) return false;
            seen.add(item.q);
            return true;
        });
    })();
    $: faqJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: mergedFaqs.map((item) => ({
                  '@type': 'Question',
                  name: item.q,
                  acceptedAnswer: {
                      '@type': 'Answer',
                      text: item.a,
                  },
              })),
          }
        : null;
    $: breadcrumbJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                  {
                      '@type': 'ListItem',
                      position: 1,
                      name: isZh ? '\u9996\u9875' : 'Home',
                      item: `https://${fallbackHost}/${data.lang}`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 2,
                      name: isZh ? '\u6307\u5357' : 'Guide',
                      item: `https://${fallbackHost}/${data.lang}/guide`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 3,
                      name: guideTitle,
                      item: canonicalUrl,
                  },
              ],
          }
        : null;
    $: howToJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'HowTo',
              name: guideTitle,
              description: pageDesc,
              totalTime: 'PT1M',
              step: localeContent.steps.map((step, index) => ({
                  '@type': 'HowToStep',
                  position: index + 1,
                  name: step,
                  text: step,
              })),
          }
        : null;
    $: structuredData = [faqJsonLd, breadcrumbJsonLd, howToJsonLd].filter(Boolean);
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta name="keywords" content={pageKeywords} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="article" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={pageTitle} />
    <meta name="twitter:description" content={pageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    <meta name="twitter:image:alt" content="FreeSaveVideo video downloader preview" />
    {#if structuredData.length}
        {#each structuredData as ld}
            {@html `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}
        {/each}
    {/if}
</svelte:head>

<div class="page">
    <div class="services">
        <SupportedServices />
    </div>

    <main class="container">
        <section class="hero">
            <div class="hero-copy">
                <p class="eyebrow">{isZh ? '\u4e0b\u8f7d\u6307\u5357' : 'Download guide'}</p>
                <h1>{guideTitle}</h1>
                <p class="lede">{localeContent.lede}</p>
                <div class="cta-row">
                    <a class="btn primary" href={downloadUrl}>{ctaLabel}</a>
                    <span class="cta-hint">{ctaHint}</span>
                </div>
            </div>
            <div class="hero-card">
                <h2>{localeContent.stepsTitle}</h2>
                <ol class="step-list">
                    {#each localeContent.steps as step}
                        <li>{step}</li>
                    {/each}
                </ol>
            </div>
        </section>

        {#if showDouyinTutorialVideo}
            <section class="card tutorial-video">
                <div class="tutorial-video-copy">
                    <h2>{douyinTutorialTitle}</h2>
                    <p>{douyinTutorialBody}</p>
                </div>
                <div class="tutorial-video-frame">
                    <iframe
                        src={douyinTutorialEmbedUrl}
                        title={douyinTutorialTitle}
                        loading="lazy"
                        allowfullscreen
                    ></iframe>
                </div>
            </section>
        {/if}

        <section class="grid">
            <section class="card tips">
                <h2>{localeContent.featuresTitle}</h2>
                <ul>
                    {#each localeContent.features as feature}
                        <li>{feature}</li>
                    {/each}
                </ul>
            </section>
            <section class="card details">
                <h2>{isZh ? '\u4f7f\u7528\u8bf4\u660e' : 'Usage notes'}</h2>
                <p>
                    {isZh
                        ? '\u590d\u5236\u94fe\u63a5\u540e\u76f4\u63a5\u7c98\u8d34\u5230\u4e0b\u8f7d\u9875\u5373\u53ef\u89e3\u6790\u3002\u89e3\u6790\u7ed3\u679c\u4ee5\u5e73\u53f0\u8fd4\u56de\u7684\u8d44\u6e90\u4e3a\u51c6\u3002'
                        : 'Copy the link and paste it into the downloader. Results depend on what the platform provides.'}
                </p>
                <p>
                    {isZh
                        ? '\u5982\u679c\u94fe\u63a5\u65e0\u6cd5\u89e3\u6790\uff0c\u8bf7\u786e\u8ba4\u5185\u5bb9\u53ef\u516c\u5f00\u8bbf\u95ee\uff0c\u5fc5\u8981\u65f6\u66f4\u6362\u7f51\u7edc\u6216\u7a0d\u540e\u518d\u8bd5\u3002'
                        : 'If a link fails, confirm it is publicly accessible and try again later or switch networks.'}
                </p>
            </section>
        </section>

        <section class="card practical">
            <h2>{isZh ? '产品能力与使用建议' : 'Product strengths and usage notes'}</h2>
            <div class="practical-grid">
                <section>
                    <h3>{isZh ? '下载与保存' : 'Download and save flow'}</h3>
                    <ul>
                        {#each productTips as tip}
                            <li>{tip}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isZh ? '平台优势' : 'Platform advantages'}</h3>
                    <ul>
                        {#each productAdvantages as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </section>
            </div>
        </section>

        <section class="card practical">
            <h2>{isZh ? '按平台排查常见问题' : 'Platform-specific troubleshooting'}</h2>
            <div class="faq-list">
                {#each platformFaqs as item}
                    <details class="faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>

        <section class="card practical">
            <h2>{platformPlaybook.heading}</h2>
            <div class="practical-grid">
                <section>
                    <h3>{isZh ? '\u5173\u952e\u5efa\u8bae' : 'Key guidance'}</h3>
                    <ul>
                        {#each platformPlaybook.notes as note}
                            <li>{note}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isZh ? '\u6210\u529f\u68c0\u67e5\u6e05\u5355' : 'Success checklist'}</h3>
                    <ul>
                        {#each platformPlaybook.checklist as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </section>
            </div>
        </section>

        <section class="card practical">
            <h2>{isZh ? '\u5e73\u53f0\u6545\u969c\u6848\u4f8b\u4e0e\u4fee\u590d\u8def\u5f84' : 'Failure cases and fix paths'}</h2>
            <div class="case-grid">
                {#each platformFailureCases as failure}
                    <article class="failure-case">
                        <h3>{failure.title}</h3>
                        <p class="case-symptoms">{failure.symptoms}</p>
                        <ol class="case-fixes">
                            {#each failure.fixes as step}
                                <li>{step}</li>
                            {/each}
                        </ol>
                    </article>
                {/each}
            </div>
        </section>

        <section class="card faq">
            <h2>{localeContent.faqTitle}</h2>
            <div class="faq-list">
                {#each mergedFaqs as item}
                    <details class="faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>

        <section class="card related">
            <h2>{isZh ? '\u5ef6\u4f38\u94fe\u63a5' : 'Related links'}</h2>
            <div class="related-links">
                <a class="related-link related-link--primary" href={downloadHubUrl}>
                    {downloadHubLabel}
                </a>
                <a class="related-link related-link--primary" href={downloadUrl}>
                    {currentDownloadLabel}
                </a>
                <a class="related-link related-link--primary" href={guideIndexUrl}>
                    {guideHubLabel}
                </a>
                {#if data.lang === 'en'}
                    <a class="related-link related-link--primary" href={learnUrl}>
                        Learning and troubleshooting guides
                    </a>
                {/if}
                <a class="related-link related-link--primary" href={faqUrl}>
                    {faqLabel}
                </a>
                <a class="related-link related-link--primary" href={discoverUrl}>
                    {discoverLabel}
                </a>
                {#each relatedGuides as guide}
                    <a class="related-link" href={`/${data.lang}/guide/${guide.slug}`}>
                        {relatedGuideLabel(guide.slug, guide.platform)}
                    </a>
                {/each}
                {#each relatedDownloads as item}
                    <a class="related-link" href={`/${data.lang}/download/${item.slug}`}>
                        {relatedDownloadLabel(item.slug, item.platform)}
                    </a>
                {/each}
            </div>
        </section>

        <section class="card related">
            <h2>{isZh ? '\u514d\u79ef\u5206\u5de5\u5177' : 'Free tools without points'}</h2>
            <div class="related-links">
                {#each freeTools as tool}
                    <a class="related-link" href={tool.href}>
                        <span>{tool.title}</span>
                        <span class="related-link-desc">{tool.desc}</span>
                    </a>
                {/each}
            </div>
        </section>

        <section class="card updates">
            <h2>{isZh ? '内容更新记录' : 'Content update notes'}</h2>
            <p class="update-meta">
                {isZh ? '最后更新：' : 'Last updated: '}
                <time datetime={contentUpdatedAt}>{contentUpdatedAt}</time>
            </p>
            <ul>
                {#each releaseNotes as note}
                    <li>{note}</li>
                {/each}
            </ul>
        </section>

        <p class="disclaimer">{localeContent.disclaimer}</p>
    </main>
</div>

<style>
    .page {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(var(--padding) / 1.25);
        padding: 0 var(--padding) calc(var(--padding) * 2);
        background:
            radial-gradient(
                circle at 12% 8%,
                rgba(var(--accent-rgb), 0.12),
                transparent 50%
            ),
            radial-gradient(
                circle at 88% 14%,
                rgba(var(--accent-rgb), 0.08),
                transparent 45%
            );
    }

    .services {
        width: 100%;
        max-width: 1020px;
    }

    .container {
        width: 100%;
        max-width: 1020px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
        gap: 20px;
        padding: 22px;
        border-radius: calc(var(--border-radius) * 1.6);
        border: 1px solid var(--button-stroke);
        background: linear-gradient(
            135deg,
            rgba(var(--accent-rgb), 0.16),
            var(--button)
        );
        box-shadow: var(--button-box-shadow);
    }

    .eyebrow {
        margin: 0 0 8px;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(var(--accent-rgb), 0.9);
        font-weight: 700;
    }

    .hero-copy h1 {
        margin: 0;
        font-size: clamp(24px, 3.2vw, 34px);
        color: var(--secondary);
    }

    .lede {
        margin: 10px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        font-size: 15.5px;
        line-height: 1.6;
    }

    .cta-row {
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }

    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 16px;
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

    .btn.primary {
        background: var(--accent);
        color: var(--white);
        border-color: transparent;
        box-shadow: none;
    }

    .btn.primary:hover {
        background: var(--accent-hover);
    }

    .cta-hint {
        color: var(--secondary);
        opacity: 0.7;
        font-size: 0.9rem;
    }

    .hero-card {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.2);
        padding: 16px;
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 12px rgba(0, 0, 0, 0.08);
    }

    .hero-card h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .step-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
        counter-reset: step;
    }

    .step-list li {
        counter-increment: step;
        display: grid;
        grid-template-columns: 28px 1fr;
        gap: 12px;
        align-items: start;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--button-elevated);
        border: 1px solid var(--button-stroke);
    }

    .step-list li::before {
        content: counter(step);
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border-radius: 9px;
        background: rgba(var(--accent-rgb), 0.2);
        color: var(--secondary);
        font-weight: 700;
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: calc(var(--padding) / 1.25);
    }

    .practical-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
    }

    .practical-grid h3 {
        margin: 0 0 8px;
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: rgba(var(--accent-rgb), 0.9);
    }

    .practical-grid ul {
        margin: 0;
        padding: 0 0 0 18px;
        color: var(--secondary);
        opacity: 0.9;
        line-height: 1.6;
        display: grid;
        gap: 8px;
    }

    .case-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
    }

    .failure-case {
        border: 1px solid var(--button-stroke);
        border-radius: 12px;
        background: var(--button-elevated);
        padding: 12px;
        display: grid;
        gap: 8px;
    }

    .failure-case h3 {
        margin: 0;
        font-size: 0.98rem;
        color: var(--secondary);
    }

    .case-symptoms {
        margin: 0;
        color: var(--subtext);
        font-size: 0.9rem;
        line-height: 1.5;
    }

    .case-fixes {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 6px;
        color: var(--secondary);
        opacity: 0.92;
        line-height: 1.55;
    }

    .tutorial-video {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .tutorial-video-copy p {
        margin: 8px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .tutorial-video-frame {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border-radius: calc(var(--border-radius) * 1.1);
        border: 1px solid var(--button-stroke);
        background: #000;
    }

    .tutorial-video-frame iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
    }

    .card {
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.25);
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .card h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .tips ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
        color: var(--secondary);
        opacity: 0.92;
        line-height: 1.6;
    }

    .tips li {
        position: relative;
        padding-left: 22px;
    }

    .tips li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.6em;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(var(--accent-rgb), 0.8);
    }

    .details p {
        margin: 0 0 10px;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .details p:last-child {
        margin-bottom: 0;
    }

    .updates ul {
        margin: 0;
        padding: 0 0 0 18px;
        color: var(--secondary);
        opacity: 0.9;
        line-height: 1.6;
        display: grid;
        gap: 8px;
    }

    .update-meta {
        margin: 0 0 10px;
        color: var(--subtext);
        font-size: 0.9rem;
    }

    .faq-list {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .faq-item {
        background: var(--button-elevated);
        border-radius: calc(var(--border-radius));
        padding: 12px 14px;
        border: 1px solid var(--button-stroke);
    }

    .faq-item summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--secondary);
        list-style: none;
        outline: none;
    }

    .faq-item summary::-webkit-details-marker {
        display: none;
    }

    .faq-item p {
        margin: 8px 0 0;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .related h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .related-links {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .related-link {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        min-height: 40px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        line-height: 1.45;
    }

    .related-link-desc {
        font-size: 0.83rem;
        opacity: 0.82;
    }

    .related-link:hover {
        background: var(--button-hover);
    }

    .related-link--primary {
        border-color: rgba(var(--accent-rgb), 0.3);
        background: rgba(var(--accent-rgb), 0.1);
        font-weight: 600;
    }

    .disclaimer {
        margin: 4px 0 0;
        padding: 0 2px;
        color: var(--secondary);
        opacity: 0.7;
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
    }

    @media screen and (max-width: 800px) {
        .hero {
            grid-template-columns: 1fr;
            padding: 18px;
        }

        .hero-card {
            padding: 14px;
        }

        .step-list li {
            grid-template-columns: 24px 1fr;
        }

        .step-list li::before {
            width: 24px;
            height: 24px;
        }
    }
</style>
