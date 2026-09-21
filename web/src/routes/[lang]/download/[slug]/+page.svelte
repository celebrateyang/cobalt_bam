<script lang="ts">
    import { onMount } from 'svelte';

    import env from '$lib/env';
    import { getSeoLandingLocale } from '$lib/seo/landing-pages';
    import { isDePriorityLanding } from '$lib/seo/de-priority-landings';
    import { isThPriorityLanding } from '$lib/seo/th-priority-landings';
    import { getPlatformKey, getSeoRuntimeContent } from '$lib/seo/runtime-content';
    import { FREESAVEVIDEO_EXTENSION_STORE_URL } from '$lib/extension/freesavevideo';

    import SupportedServices from '$components/save/SupportedServices.svelte';

    export let data: {
        lang: string;
        slug: string;
        landing: import('$lib/seo/landing-pages').SeoLandingPage;
        guideSlug: string | null;
        relatedPages: import('$lib/seo/landing-pages').SeoLandingPage[];
        relatedLearnPages: import('$lib/seo/learn-pages').LearnPage[];
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';

    $: localeContent = getSeoLandingLocale(data.landing, data.lang);
    $: isZh = data.lang === 'zh';
    $: isJa = data.lang === 'ja';
    $: isTh = data.lang === 'th';
    const extraCopy: Record<string, Record<string, string>> = {
        es: { directory: 'Directorio de descargadores populares', guide: 'Cómo usar', guides: 'Guías de descarga populares', faq: 'Preguntas frecuentes de descarga', discover: 'Descubrir vídeos populares', related: 'Enlaces relacionados', core: 'Páginas principales', similar: 'Descargas similares', home: 'Inicio', download: 'Descargar', breadcrumb: 'Ruta de navegación', browser: 'Navegador web', capability: 'Resumen de funciones', collection: 'Otros formatos de colecciones compatibles', practical: 'Consejos prácticos de descarga', flow: 'Proceso de descarga y guardado', advantages: 'Ventajas de la plataforma', troubleshooting: 'Solución de problemas por plataforma', guidance: 'Indicaciones clave', checklist: 'Lista de comprobación', failures: 'Casos de error y soluciones' },
        fr: { directory: 'Répertoire des téléchargeurs populaires', guide: 'Comment utiliser', guides: 'Guides de téléchargement populaires', faq: 'FAQ sur le téléchargement', discover: 'Découvrir les vidéos populaires', related: 'Liens associés', core: 'Pages principales', similar: 'Téléchargements similaires', home: 'Accueil', download: 'Télécharger', breadcrumb: 'Fil d’Ariane', browser: 'Navigateur web', capability: 'Résumé des fonctionnalités', collection: 'Autres formats de collections compatibles', practical: 'Conseils pratiques de téléchargement', flow: 'Parcours de téléchargement et d’enregistrement', advantages: 'Avantages de la plateforme', troubleshooting: 'Dépannage par plateforme', guidance: 'Conseils essentiels', checklist: 'Liste de vérification', failures: 'Cas d’échec et solutions' },
        de: { directory: 'Beliebte Video-Downloader', guide: 'Verwendung von', guides: 'Beliebte Download-Anleitungen', faq: 'Häufige Downloadfragen', discover: 'Beliebte Videos entdecken', related: 'Verwandte Links', core: 'Hauptseiten', similar: 'Ähnliche Downloads', home: 'Startseite', download: 'Download', downloader: 'Downloader öffnen', breadcrumb: 'Brotkrümelnavigation', browser: 'Webbrowser', capability: 'Funktionsübersicht', collection: 'Weitere unterstützte Sammlungsformate', practical: 'Praktische Download-Tipps', flow: 'Download- und Speichervorgang', advantages: 'Plattformvorteile', troubleshooting: 'Plattformspezifische Fehlerbehebung', guidance: 'Wichtige Hinweise', checklist: 'Erfolgscheckliste', failures: 'Fehlerfälle und Lösungen' },
        vi: { directory: 'Danh mục công cụ tải video phổ biến', guide: 'Cách sử dụng', guides: 'Hướng dẫn tải xuống phổ biến', faq: 'Câu hỏi thường gặp', discover: 'Khám phá video phổ biến', related: 'Liên kết liên quan', core: 'Trang chính', similar: 'Nội dung tải tương tự', home: 'Trang chủ', download: 'Tải xuống', breadcrumb: 'Đường dẫn điều hướng', browser: 'Trình duyệt web', capability: 'Tóm tắt tính năng', collection: 'Các định dạng bộ sưu tập khác được hỗ trợ', practical: 'Mẹo tải xuống hữu ích', flow: 'Quy trình tải và lưu', advantages: 'Ưu điểm nền tảng', troubleshooting: 'Khắc phục sự cố theo nền tảng', guidance: 'Hướng dẫn chính', checklist: 'Danh sách kiểm tra', failures: 'Trường hợp lỗi và cách khắc phục' },
        ko: { directory: '인기 동영상 다운로더 목록', guide: '사용 방법', guides: '인기 다운로드 가이드', faq: '다운로드 자주 묻는 질문', discover: '인기 동영상 둘러보기', related: '관련 링크', core: '주요 페이지', similar: '비슷한 다운로드 도구', home: '홈', download: '다운로드', breadcrumb: '이동 경로', browser: '웹 브라우저', capability: '기능 요약', collection: '지원되는 다른 컬렉션 형식', practical: '실용적인 다운로드 팁', flow: '다운로드 및 저장 과정', advantages: '플랫폼별 장점', troubleshooting: '플랫폼별 문제 해결', guidance: '핵심 안내', checklist: '확인 목록', failures: '실패 사례와 해결 방법' },
        id: { directory: 'Direktori pengunduh video populer', guide: 'Cara menggunakan', guides: 'Panduan unduhan populer', faq: 'Tanya jawab unduhan', discover: 'Temukan video populer', related: 'Tautan terkait', core: 'Halaman utama', similar: 'Unduhan serupa', home: 'Beranda', download: 'Unduh', breadcrumb: 'Jejak navigasi', browser: 'Peramban web', capability: 'Ringkasan kemampuan', collection: 'Format koleksi lain yang didukung', practical: 'Tips unduhan praktis', flow: 'Alur unduh dan simpan', advantages: 'Keunggulan platform', troubleshooting: 'Pemecahan masalah per platform', guidance: 'Panduan utama', checklist: 'Daftar pemeriksaan', failures: 'Kasus kegagalan dan solusi' },
        ru: { directory: 'Каталог популярных загрузчиков', guide: 'Как использовать', guides: 'Популярные руководства', faq: 'Частые вопросы о загрузке', discover: 'Популярные видео', related: 'Связанные ссылки', core: 'Основные страницы', similar: 'Похожие загрузки', home: 'Главная', download: 'Скачать', breadcrumb: 'Навигационная цепочка', browser: 'Веб-браузер', capability: 'Обзор возможностей', collection: 'Другие поддерживаемые форматы подборок', practical: 'Практические советы по загрузке', flow: 'Процесс загрузки и сохранения', advantages: 'Преимущества платформы', troubleshooting: 'Устранение неполадок платформы', guidance: 'Основные рекомендации', checklist: 'Контрольный список', failures: 'Ошибки и способы исправления' },
    };
    $: localCopy = extraCopy[data.lang];
    $: canonicalUrl = `https://${fallbackHost}/${data.lang}/download/${data.slug}`;
    $: guideUrl = data.guideSlug ? `/${data.lang}/guide/${data.guideSlug}` : null;
    $: faqUrl = `/${data.lang}/faq`;
    $: discoverUrl = `/${data.lang}/discover`;
    $: guideIndexUrl = `/${data.lang}/guide`;
    $: downloadIndexUrl = `/${data.lang}/download`;
    $: learnUrl = '/en/learn';
    $: homeUrl = `/${data.lang}`;
    $: downloadHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u89c6\u9891\u4e0b\u8f7d\u76ee\u5f55' : isTh ? 'รายการเครื่องมือดาวน์โหลดวิดีโอยอดนิยม' : localCopy?.directory ?? 'Popular video downloader directory';
    $: currentGuideLabel = isZh
        ? `${localeContent.h1}\u4f7f\u7528\u6307\u5357`
        : isTh
          ? `คู่มือการใช้ ${localeContent.h1}`
           : `${localCopy?.guide ?? 'How to use'} ${localeContent.h1}`;
    $: guideHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u4e0b\u8f7d\u6307\u5357' : isTh ? 'คู่มือดาวน์โหลดยอดนิยม' : localCopy?.guides ?? 'Popular download guides';
    $: faqLabel = isZh ? '\u89c6\u9891\u4e0b\u8f7d\u5e38\u89c1\u95ee\u9898' : isTh ? 'คำถามที่พบบ่อยเกี่ยวกับการดาวน์โหลดวิดีโอ' : localCopy?.faq ?? 'Video download FAQ';
    $: discoverLabel = isZh ? '\u70ed\u95e8\u89c6\u9891\u53d1\u73b0' : isTh ? 'ค้นพบวิดีโอยอดนิยม' : localCopy?.discover ?? 'Trending video discovery';
    $: localizedDownloadHubLabel = isJa ? '人気動画ダウンローダー一覧' : downloadHubLabel;
    $: localizedCurrentGuideLabel = isJa ? `${localeContent.h1} の使い方` : currentGuideLabel;
    $: localizedGuideHubLabel = isJa ? '人気プラットフォームのダウンロードガイド' : guideHubLabel;
    $: localizedFaqLabel = isJa ? '動画ダウンロードのよくある質問' : faqLabel;
    $: localizedDiscoverLabel = isJa ? '人気動画を探す' : discoverLabel;
    $: pageTitle = localeContent.metaTitle;
    $: pageDesc = localeContent.metaDescription;
    $: pageKeywords = localeContent.metaKeywords.join(',');
    $: runtimeContent = getSeoRuntimeContent(data.lang);
    $: platformKey = getPlatformKey(data.slug);
    $: usesFocusedPriorityContent =
        (data.lang === 'de' && isDePriorityLanding(data.slug)) ||
        (data.lang === 'th' && isThPriorityLanding(data.slug));
    $: productFaqs = usesFocusedPriorityContent ? [] : runtimeContent.productFaqs;
    $: productTips = usesFocusedPriorityContent ? [] : runtimeContent.productTips;
    $: productAdvantages = usesFocusedPriorityContent ? [] : runtimeContent.productAdvantages;
    $: platformFaqs = usesFocusedPriorityContent
        ? []
        : runtimeContent.platformFaqs[platformKey] ?? runtimeContent.platformFaqs.generic;
    $: platformPlaybook =
        usesFocusedPriorityContent
            ? { heading: '', notes: [], checklist: [] }
            : runtimeContent.platformPlaybooks[platformKey] ?? runtimeContent.platformPlaybooks.generic;
    $: platformFailureCases =
        usesFocusedPriorityContent
            ? []
            : runtimeContent.platformFailureCases[platformKey] ?? runtimeContent.platformFailureCases.generic;
    $: landingFaqs = usesFocusedPriorityContent
        ? localeContent.faqs
        : data.slug === 'youtube-download'
        ? localeContent.faqs.slice(1)
        : localeContent.faqs;
    $: freeTools = (usesFocusedPriorityContent ? [] : runtimeContent.freeTools).map((tool) => ({
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
                      name: isJa ? 'ホーム' : isZh ? '\u9996\u9875' : isTh ? 'หน้าแรก' : localCopy?.home ?? 'Home',
                      item: `https://${fallbackHost}/${data.lang}`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 2,
                      name: isJa ? 'ダウンロード' : isZh ? '\u4e0b\u8f7d' : isTh ? 'ดาวน์โหลด' : localCopy?.download ?? 'Download',
                      item: `https://${fallbackHost}/${data.lang}/download`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 3,
                      name: localeContent.h1,
                      item: canonicalUrl,
                  },
              ],
          }
        : null;
    $: howToJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'HowTo',
              name: localeContent.stepsTitle,
              description: localeContent.lede,
              ...(data.slug === 'xinpianchang-video-download' ? {} : { totalTime: 'PT1M' }),
              tool: [
                  {
                      '@type': 'HowToTool',
                      name: data.slug === 'xinpianchang-video-download' ? 'FreeSaveVideo Downloader browser extension' : 'FreeSaveVideo',
                  },
              ],
              step: localeContent.steps.map((step, index) => ({
                  '@type': 'HowToStep',
                  position: index + 1,
                  name: step,
                  text: step,
              })),
          }
        : null;
    $: webPageJsonLd = canonicalUrl
        ? {
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              name: pageTitle,
              alternateName: localeContent.h1,
              description: pageDesc,
              keywords: pageKeywords,
              url: canonicalUrl,
              inLanguage: data.lang,
              isPartOf: {
                  '@type': 'WebSite',
                  name: 'FreeSaveVideo',
                  url: `https://${fallbackHost}/${data.lang}`,
              },
              mainEntity: {
                  '@type': 'WebApplication',
                  name: localeContent.h1,
                  description: pageDesc,
                  applicationCategory: 'MultimediaApplication',
                   operatingSystem: data.slug === 'xinpianchang-video-download' ? 'Chrome or Edge on desktop' : isJa ? 'Web ブラウザ' : isZh ? '\u6d4f\u89c8\u5668' : isTh ? 'เว็บเบราว์เซอร์' : localCopy?.browser ?? 'Web browser',
                  featureList: localeContent.features,
                  knowsAbout: [
                      localeContent.h1,
                      ...localeContent.metaKeywords,
                      'public video download',
                      'batch download',
                      'playlist download',
                      'audio extraction',
                  ],
                  offers: {
                      '@type': 'Offer',
                      price: '0',
                      priceCurrency: 'USD',
                  },
                  potentialAction: {
                      '@type': 'UseAction',
                      target: canonicalUrl,
                  },
              },
          }
        : null;
    $: structuredData = [webPageJsonLd, faqJsonLd, breadcrumbJsonLd, howToJsonLd].filter(Boolean);

    let copiedExampleTitle = '';
    let OmniboxComponent: typeof import('$components/save/Omnibox.svelte').default | null = null;

    onMount(() => {
        void import('$components/save/Omnibox.svelte')
            .then((module) => {
                OmniboxComponent = module.default;
            })
            .catch((error) => {
                console.debug('Downloader controls failed to load', error);
            });
    });

    const copyExampleLinks = async (title: string, urls: string[]) => {
        await navigator.clipboard.writeText(urls.join('\n'));
        copiedExampleTitle = title;
        window.setTimeout(() => {
            if (copiedExampleTitle === title) copiedExampleTitle = '';
        }, 2000);
    };
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta name="description" content={pageDesc} />
    <meta name="keywords" content={pageKeywords} />
    <meta name="applicable-device" content={data.slug === 'xinpianchang-video-download' ? 'pc' : 'pc,mobile'} />
    <meta http-equiv="Cache-Control" content="no-transform" />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={pageDesc} />
    <meta property="og:type" content="website" />
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

    <main class="container" tabindex="-1" data-first-focus data-focus-ring-hidden>
        <section class="hero">
            <div class="hero-copy">
                <h1>{localeContent.h1}</h1>
                <p class="lede">{localeContent.lede}</p>
                {#if localeContent.heroTags?.length}
                    <ul class="hero-tags" aria-label={isJa ? '対応機能' : isZh ? '支持功能' : isTh ? 'คุณสมบัติที่รองรับ' : 'Supported features'}>
                        {#each localeContent.heroTags as tag}
                            <li>{tag}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
            <div class="hero-omnibox">
                {#if OmniboxComponent}
                    <svelte:component this={OmniboxComponent} />
                {:else}
                    <a class="downloader-fallback" href={homeUrl}>
                        {isJa ? 'ダウンローダーを開く' : isZh ? '打开下载器' : isTh ? 'เปิดเครื่องมือดาวน์โหลด' : localCopy?.downloader ?? 'Open downloader'}
                    </a>
                {/if}
            </div>
        </section>

        {#if data.lang === 'en' && (data.landing.examples?.length || data.landing.supportedLinkFormats?.length)}
            <section class="card example-section" aria-labelledby="supported-example-links">
                <div class="example-heading">
                    <div>
                        <p class="example-eyebrow">Try a supported URL shape</p>
                        <h2 id="supported-example-links">Supported example links</h2>
                    </div>
                    <p>
                        Examples are public links for demonstrating URL input. Only save content you
                        own, have permission to use, or are legally allowed to download.
                    </p>
                </div>

                {#if data.landing.examples?.length}
                    <div class="example-grid">
                        {#each data.landing.examples as example}
                            <article class="example-card">
                                <h3>{example.title}</h3>
                                <p>{example.description}</p>
                                <div class="example-urls">
                                    {#each example.urls as url}
                                        <a href={url} target="_blank" rel="noreferrer noopener nofollow">
                                            {url}
                                        </a>
                                    {/each}
                                </div>
                                <button
                                    type="button"
                                    class="copy-example"
                                    on:click={() => copyExampleLinks(example.title, example.urls)}
                                >
                                    {copiedExampleTitle === example.title
                                        ? 'Copied'
                                        : example.urls.length > 1
                                          ? 'Copy all links'
                                          : 'Copy link'}
                                </button>
                            </article>
                        {/each}
                    </div>
                {/if}

                {#if data.landing.supportedLinkFormats?.length}
                    <div class="format-list">
                        <h3>{localCopy?.collection ?? 'Other supported collection formats'}</h3>
                        <ul class="feature-list">
                            {#each data.landing.supportedLinkFormats as format}
                                <li>{format}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </section>
        {/if}

        <nav class="crumb-links" aria-label={isJa ? 'パンくずリスト' : isTh ? 'เส้นทางนำทาง' : localCopy?.breadcrumb ?? 'Breadcrumb'}>
            <a href={homeUrl}>{isJa ? 'ホーム' : isZh ? '\u9996\u9875' : isTh ? 'หน้าแรก' : localCopy?.home ?? 'Home'}</a>
            <span>/</span>
            <a href={downloadIndexUrl}>{isJa ? 'ダウンロード' : isZh ? '\u4e0b\u8f7d' : isTh ? 'ดาวน์โหลด' : localCopy?.download ?? 'Download'}</a>
            <span>/</span>
            <span class="crumb-current">{localeContent.h1}</span>
        </nav>

        {#if data.slug === 'xinpianchang-video-download'}
            <section class="card xinpianchang-install">
                <div>
                    <h2>{isZh ? '安装 FreeSaveVideo Downloader 插件' : 'Install FreeSaveVideo Downloader'}</h2>
                    <p>{isZh ? '新片场要求浏览器验证时，请自行完成验证并播放视频，然后点击插件中的 Download。支持 Chrome 和 Edge；下载页显示保存成功前请保持打开。' : 'If Xinpianchang requests browser verification, complete it yourself and play the video. Then click Download in the extension. Keep the progress tab open until Chrome saves the MP4.'}</p>
                </div>
                <a class="related-link related-link--primary" href={FREESAVEVIDEO_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
                    {isZh ? '前往 Chrome 网上应用店安装插件' : 'Get the Chrome / Edge extension'}
                </a>
            </section>
        {/if}

        {#if localeContent.facts?.length}
            <section class="card fact-summary" aria-label={isJa ? '製品機能の概要' : isZh ? '产品能力说明' : isTh ? 'สรุปความสามารถของบริการ' : localCopy?.capability ?? 'Product capability summary'}>
                {#each localeContent.facts as fact}
                    <p>{fact}</p>
                {/each}
            </section>
        {/if}

        <section class="section-grid">
            <section class="card steps">
                <h2>{localeContent.stepsTitle}</h2>
                <ol class="step-list">
                    {#each localeContent.steps as step}
                        <li>{step}</li>
                    {/each}
                </ol>
            </section>

            <section class="card features">
                <h2>{localeContent.featuresTitle}</h2>
                <ul class="feature-list">
                    {#each localeContent.features as feature}
                        <li>{feature}</li>
                    {/each}
                </ul>
            </section>
        </section>

        {#if productTips.length || productAdvantages.length}
        <section class="card practical">
            <h2>{isJa ? '実用的なダウンロードのヒント' : isZh ? '实用下载提示' : isTh ? 'คำแนะนำสำหรับการดาวน์โหลด' : localCopy?.practical ?? 'Practical download tips'}</h2>
            <div class="practical-grid">
                <section>
                    <h3>{isJa ? 'ダウンロードと保存の流れ' : isZh ? '下载与保存' : isTh ? 'ขั้นตอนดาวน์โหลดและบันทึกไฟล์' : localCopy?.flow ?? 'Download and save flow'}</h3>
                    <ul class="feature-list">
                        {#each productTips as tip}
                            <li>{tip}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isJa ? 'プラットフォーム別の特長' : isZh ? '平台优势' : isTh ? 'จุดเด่นของแพลตฟอร์ม' : localCopy?.advantages ?? 'Platform advantages'}</h3>
                    <ul class="feature-list">
                        {#each productAdvantages as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </section>
            </div>
        </section>
        {/if}

        {#if platformFaqs.length}
        <section class="card practical">
            <h2>{isJa ? 'プラットフォーム別の問題解決' : isZh ? '按平台排查常见问题' : isTh ? 'แก้ปัญหาตามแพลตฟอร์ม' : localCopy?.troubleshooting ?? 'Platform-specific troubleshooting'}</h2>
            <div class="faq-list">
                {#each platformFaqs as item}
                    <details class="faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>
        {/if}

        {#if platformPlaybook.notes.length || platformPlaybook.checklist.length}
        <section class="card practical">
            <h2>{platformPlaybook.heading}</h2>
            <div class="practical-grid">
                <section>
                    <h3>{isZh ? '\u5173\u952e\u5efa\u8bae' : isTh ? 'คำแนะนำสำคัญ' : localCopy?.guidance ?? 'Key guidance'}</h3>
                    <ul class="feature-list">
                        {#each platformPlaybook.notes as note}
                            <li>{note}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isZh ? '\u6210\u529f\u68c0\u67e5\u6e05\u5355' : isTh ? 'รายการตรวจสอบก่อนดาวน์โหลด' : localCopy?.checklist ?? 'Success checklist'}</h3>
                    <ul class="feature-list">
                        {#each platformPlaybook.checklist as item}
                            <li>{item}</li>
                        {/each}
                    </ul>
                </section>
            </div>
        </section>
        {/if}

        {#if platformFailureCases.length}
        <section class="card practical">
            <h2>{isJa ? '失敗例と解決方法' : isZh ? '\u5e73\u53f0\u6545\u969c\u6848\u4f8b\u4e0e\u4fee\u590d\u8def\u5f84' : isTh ? 'กรณีที่ล้มเหลวและวิธีแก้ไข' : localCopy?.failures ?? 'Failure cases and fix paths'}</h2>
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
            <h2>{isJa ? '関連ページ' : isZh ? '\u76f8\u5173\u9875\u9762' : isTh ? 'ลิงก์ที่เกี่ยวข้อง' : localCopy?.related ?? 'Related links'}</h2>
            <div class="related-grid">
                <section class="related-column">
                    <h3>{runtimeContent.labels.corePages}</h3>
                    <div class="related-links">
                        <a class="related-link related-link--primary" href={downloadIndexUrl}>
                            {localizedDownloadHubLabel}
                        </a>
                        {#if guideUrl}
                            <a class="related-link" href={guideUrl}>
                                {localizedCurrentGuideLabel}
                            </a>
                        {/if}
                        <a class="related-link" href={guideIndexUrl}>
                            {localizedGuideHubLabel}
                        </a>
                        {#if data.lang === 'en'}
                            <a class="related-link" href={learnUrl}>
                                Learning and troubleshooting guides
                            </a>
                        {/if}
                        <a class="related-link" href={faqUrl}>
                            {localizedFaqLabel}
                        </a>
                        <a class="related-link" href={discoverUrl}>
                            {localizedDiscoverLabel}
                        </a>
                    </div>
                </section>

                <section class="related-column">
                    <h3>{runtimeContent.labels.similarDownloads}</h3>
                    <div class="related-links">
                        {#each data.relatedPages.slice(0, 6) as related}
                            {@const relatedLocale = getSeoLandingLocale(related, data.lang)}
                            <a
                                class="related-link related-link--download"
                                href={`/${data.lang}/download/${related.slug}`}
                                title={relatedLocale.h1}
                            >
                                <span class="related-link-title">{relatedLocale.h1}</span>
                                <span class="related-link-desc">{relatedLocale.lede}</span>
                            </a>
                        {/each}
                    </div>
                </section>

                {#if data.relatedLearnPages.length}
                    <section class="related-column">
                        <h3>Learn guides</h3>
                        <div class="related-links">
                            {#each data.relatedLearnPages as article}
                                <a
                                    class="related-link related-link--download"
                                    href={`/en/learn/${article.slug}`}
                                    title={article.title}
                                >
                                    <span class="related-link-title">{article.title}</span>
                                    <span class="related-link-desc">{article.description}</span>
                                </a>
                            {/each}
                        </div>
                    </section>
                {/if}
            </div>
        </section>
        {/if}

        {#if localeContent.supportedLinksTitle && localeContent.supportedLinks?.length}
            <section class="card practical">
                <h2>{localeContent.supportedLinksTitle}</h2>
                <div class="link-type-grid">
                    {#each localeContent.supportedLinks as item}
                        <article class="link-type">
                            <h3>{item.title}</h3>
                            <p>{item.description}</p>
                        </article>
                    {/each}
                </div>
            </section>
        {/if}

        {#if localeContent.exampleTitle && localeContent.exampleInput && localeContent.exampleResult}
            <section class="card practical">
                <h2>{localeContent.exampleTitle}</h2>
                <div class="example-flow">
                    <p>{localeContent.exampleInput}</p>
                    {#if localeContent.exampleUrl}
                        <a
                            class="example-source-link"
                            href={localeContent.exampleUrl}
                            target="_blank"
                            rel="noreferrer noopener nofollow"
                        >
                            {localeContent.exampleUrl}
                        </a>
                    {/if}
                    <p>{localeContent.exampleResult}</p>
                    {#if localeContent.exampleActions?.length}
                        <ul class="feature-list">
                            {#each localeContent.exampleActions as action}
                                <li>{action}</li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            </section>
        {/if}

        {#if freeTools.length}
        <section class="card related">
            <h2>{runtimeContent.labels.toolsWithoutPoints}</h2>
            <div class="related-links">
                {#each freeTools as tool}
                    <a class="related-link related-link--download" href={tool.href}>
                        <span class="related-link-title">{tool.title}</span>
                        <span class="related-link-desc">{tool.desc}</span>
                    </a>
                {/each}
            </div>
        </section>
        {/if}


        <p class="disclaimer">{localeContent.disclaimer}</p>
    </main>
</div>

<style>
    .xinpianchang-install {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
    }
    .xinpianchang-install h2 { margin: 0 0 8px; }
    .xinpianchang-install p { margin: 0; line-height: 1.6; }
    .xinpianchang-install a { flex-shrink: 0; }
    @media (max-width: 680px) {
        .xinpianchang-install { flex-direction: column; align-items: stretch; }
    }
    .page {
        --download-surface: color-mix(in srgb, var(--popup-bg) 94%, #ffffff);
        --download-panel: color-mix(in srgb, var(--popup-bg) 86%, #ffffff);
        --download-panel-hover: color-mix(in srgb, var(--button-hover) 70%, #ffffff);
        --download-border: color-mix(in srgb, var(--button-stroke) 72%, rgba(0, 0, 0, 0.1));
        --download-heading: var(--text);
        --download-copy: var(--text);
        --download-muted: var(--subtext);
        --download-accent: var(--secondary-600);
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(var(--padding) / 1.5);
        padding: 0 var(--padding) calc(var(--padding) * 2);
        background:
            radial-gradient(
                circle at 12% 8%,
                rgba(var(--accent-rgb), 0.12),
                transparent 50%
            ),
            radial-gradient(
                circle at 88% 12%,
                rgba(var(--accent-rgb), 0.08),
                transparent 45%
            );
    }

    .container {
        width: 100%;
        max-width: 1120px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .example-section {
        display: grid;
        gap: 18px;
    }

    .example-heading {
        display: grid;
        grid-template-columns: minmax(0, 0.8fr) minmax(280px, 1.2fr);
        gap: 18px;
        align-items: end;
    }

    .example-heading h2,
    .example-card h3,
    .format-list h3 {
        margin: 0;
        color: var(--secondary);
    }

    .example-heading > p,
    .example-card p {
        margin: 0;
        color: var(--secondary);
        opacity: 0.78;
        line-height: 1.55;
    }

    .example-eyebrow {
        margin: 0 0 6px;
        color: rgba(var(--accent-rgb), 0.95);
        font-size: 0.78rem;
        font-weight: 750;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .example-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 12px;
    }

    .example-card {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
        border: 1px solid var(--button-stroke);
        border-radius: var(--border-radius);
        background: var(--button-elevated);
    }

    .example-urls {
        display: grid;
        gap: 8px;
    }

    .example-urls a {
        overflow-wrap: anywhere;
        color: rgb(var(--accent-rgb));
        font-family: var(--font-mono, monospace);
        font-size: 0.82rem;
        line-height: 1.45;
    }

    .copy-example {
        align-self: flex-start;
        min-height: 38px;
        margin-top: auto;
        padding: 8px 13px;
        border: 1px solid var(--button-stroke);
        border-radius: 999px;
        background: var(--button);
        color: var(--secondary);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
    }

    .copy-example:hover {
        background: var(--button-hover);
    }

    .format-list {
        display: grid;
        gap: 10px;
        padding-top: 2px;
    }

    @media (max-width: 720px) {
        .example-heading {
            grid-template-columns: 1fr;
            align-items: start;
        }
    }

    .services {
        width: 100%;
        max-width: 1120px;
    }

    .hero {
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 22px;
        border-radius: calc(var(--border-radius) * 1.6);
        border: 1px solid var(--button-stroke);
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.11), var(--download-surface));
        box-shadow: var(--button-box-shadow);
    }

    .hero-copy {
        width: 100%;
        max-width: 760px;
    }

    .hero-copy h1 {
        font-size: clamp(26px, 3.4vw, 36px);
        line-height: 1.15;
        margin: 0;
        letter-spacing: -0.02em;
        color: var(--download-heading);
    }

    .lede {
        margin: 10px 0 0 0;
        color: var(--download-muted);
        font-size: 15.5px;
        line-height: 1.6;
    }

    .hero-omnibox {
        width: 100%;
        box-sizing: border-box;
        background: transparent;
        border-radius: calc(var(--border-radius) * 1.25);
        padding: 6px 0 0;
        border: 0;
        box-shadow: none;
    }

    .hero-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
    }

    .hero-tags li {
        padding: 6px 10px;
        border: 1px solid rgba(var(--accent-rgb), 0.3);
        border-radius: 999px;
        background: rgba(var(--accent-rgb), 0.1);
        color: var(--download-heading);
        font-size: 0.82rem;
        font-weight: 650;
    }

    .downloader-fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 20px;
        border-radius: var(--border-radius);
        background: var(--download-accent);
        color: var(--download-accent-contrast, #fff);
        font-weight: 700;
        text-decoration: none;
    }

    .crumb-links {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-size: 0.86rem;
        color: var(--subtext);
    }

    .crumb-links a {
        color: var(--download-accent);
        text-decoration: none;
    }

    .crumb-links a:hover {
        text-decoration: underline;
    }

    .crumb-current {
        opacity: 0.82;
    }

    .card {
        background: var(--download-surface);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.25);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .card h2 {
        margin: 0 0 10px 0;
        font-size: 18px;
        letter-spacing: -0.01em;
        color: var(--download-heading);
    }

    .section-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: calc(var(--padding) / 1.25);
    }

    .practical-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
    }

    .fact-summary,
    .example-flow {
        display: grid;
        gap: 10px;
    }

    .fact-summary p,
    .example-flow p {
        margin: 0;
        color: var(--download-copy);
        line-height: 1.65;
    }

    .example-source-link {
        width: fit-content;
        max-width: 100%;
        overflow-wrap: anywhere;
        color: var(--download-accent);
        font-family: var(--font-mono, monospace);
        font-size: 0.88rem;
    }

    .link-type-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
    }

    .link-type {
        padding: 14px;
        border: 1px solid var(--download-border);
        border-radius: 12px;
        background: var(--download-panel);
    }

    .link-type h3,
    .link-type p {
        margin: 0;
    }

    .link-type h3 {
        color: var(--download-heading);
        font-size: 0.98rem;
    }

    .link-type p {
        margin-top: 6px;
        color: var(--download-muted);
        line-height: 1.55;
    }

    .practical-grid h3 {
        margin: 0 0 8px;
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--download-accent);
    }

    .case-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
    }

    .failure-case {
        border: 1px solid var(--download-border);
        border-radius: 12px;
        background: var(--download-panel);
        padding: 12px;
        display: grid;
        gap: 8px;
    }

    .failure-case h3 {
        margin: 0;
        font-size: 0.98rem;
        color: var(--download-heading);
    }

    .case-symptoms {
        margin: 0;
        color: var(--download-muted);
        font-size: 0.9rem;
        line-height: 1.5;
    }

    .case-fixes {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 6px;
        color: var(--download-copy);
        line-height: 1.55;
    }

    .step-list,
    .feature-list {
        margin: 0;
        padding: 0;
        display: grid;
        gap: 10px;
        color: var(--download-copy);
        line-height: 1.6;
    }

    .step-list {
        list-style: none;
        counter-reset: step;
    }

    .step-list li {
        counter-increment: step;
        display: grid;
        grid-template-columns: 32px 1fr;
        gap: 12px;
        align-items: start;
        padding: 12px 12px;
        border-radius: 14px;
        background: var(--download-panel);
        border: 1px solid var(--download-border);
    }

    .step-list li::before {
        content: counter(step);
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: rgba(var(--accent-rgb), 0.2);
        color: var(--download-accent);
        font-weight: 700;
    }

    .feature-list {
        list-style: none;
    }

    .feature-list li {
        position: relative;
        padding-left: 22px;
    }

    .feature-list li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.6em;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(var(--accent-rgb), 0.8);
    }

    .faq-list {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .faq-item {
        background: var(--download-panel);
        border-radius: calc(var(--border-radius));
        padding: 12px 14px;
        border: 1px solid var(--download-border);
    }

    .faq-item summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--download-heading);
        list-style: none;
        outline: none;
    }

    .faq-item summary::-webkit-details-marker {
        display: none;
    }

    .faq-item p {
        margin: 8px 0 0 0;
        color: var(--download-muted);
        line-height: 1.6;
    }

    .related-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
    }

    .related-column {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .related-column h3 {
        margin: 0;
        font-size: 14px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--download-accent);
    }

    .related-links {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .related-link {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-height: 40px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--download-border);
        background: var(--download-panel);
        color: var(--download-copy);
        text-decoration: none;
        line-height: 1.45;
    }

    .related-link:hover {
        background: var(--download-panel-hover);
    }

    .related-link--primary {
        border-color: rgba(var(--accent-rgb), 0.35);
        background: rgba(var(--accent-rgb), 0.14);
        color: var(--secondary);
    }

    .related-link--download {
        min-height: 56px;
    }

    .related-link-title {
        font-weight: 600;
    }

    .related-link-desc {
        font-size: 0.83rem;
        opacity: 0.82;
    }


    .disclaimer {
        margin: 4px 0 0;
        padding: 0 2px;
        color: var(--download-muted);
        font-size: 13px;
        line-height: 1.6;
        text-align: center;
    }

    @media screen and (max-width: 700px) {
        .hero {
            padding: 18px;
        }

        .card {
            padding: calc(var(--padding) / 1.5);
        }

        .hero-omnibox {
            padding: 4px 0 0;
        }

        .crumb-links {
            font-size: 0.8rem;
        }

        .step-list li {
            grid-template-columns: 26px 1fr;
        }

        .step-list li::before {
            width: 26px;
            height: 26px;
        }
    }
</style>
