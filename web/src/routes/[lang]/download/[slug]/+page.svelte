<script lang="ts">
    import { onMount } from 'svelte';

    import env from '$lib/env';
    import { getSeoLandingLocale } from '$lib/seo/landing-pages';
    import { getDailymotionUi } from '$lib/seo/dailymotion-ui';
    import { getYouTubeCopy } from '$lib/youtube/copy';
    import { isDePriorityLanding } from '$lib/seo/de-priority-landings';
    import { isThPriorityLanding } from '$lib/seo/th-priority-landings';
    import { getPlatformKey, getSeoRuntimeContent } from '$lib/seo/runtime-content';
    import { FREESAVEVIDEO_EXTENSION_STORE_URL } from '$lib/extension/freesavevideo';
    import { socialPlatformForSlug } from '$lib/seo/social-download-content';
    import { isTiktokLanding } from '$lib/seo/tiktok-content';

    import SupportedServices from '$components/save/SupportedServices.svelte';
    import YouTubeDownloadPage from '$components/youtube/YouTubeDownloadPage.svelte';
    import RedditDownloadPage from '$components/social/RedditDownloadPage.svelte';
    import PinterestDownloadPage from '$components/social/PinterestDownloadPage.svelte';

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
    $: dailymotionUi = getDailymotionUi(data.lang);
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
    $: youtubeCopy = getYouTubeCopy(data.lang);
    $: pageDesc = data.slug === 'youtube-download' && data.lang !== 'en' ? youtubeCopy.description : localeContent.metaDescription;
    $: pageKeywords = localeContent.metaKeywords.join(',');
    $: runtimeContent = getSeoRuntimeContent(data.lang);
    $: platformKey = getPlatformKey(data.slug);
    $: socialPlatform = socialPlatformForSlug(data.slug);
    $: isTiktok = isTiktokLanding(data.slug);
    $: usesFocusedPriorityContent =
        isTiktok ||
        Boolean(socialPlatform) ||
        data.slug === 'dailymotion-video-downloader' ||
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
               ...(socialPlatform || ['xinpianchang-video-download', 'dailymotion-video-downloader'].includes(data.slug) ? {} : { totalTime: 'PT1M' }),
              tool: [
                  {
                      '@type': 'HowToTool',
                      name: data.slug === 'xinpianchang-video-download' ? 'FreeSaveVideo Downloader browser extension' : 'FreeSaveVideo',
                  },
              ],
              step: (data.slug === 'youtube-download'
                  ? [youtubeCopy.step1Body, youtubeCopy.step2Body, youtubeCopy.step3Body]
                  : localeContent.steps).map((step, index) => ({
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
                   operatingSystem: data.slug === 'dailymotion-video-downloader' ? dailymotionUi.browserLabel : data.slug === 'xinpianchang-video-download' ? 'Chrome or Edge on desktop' : isJa ? 'Web ブラウザ' : isZh ? '\u6d4f\u89c8\u5668' : isTh ? 'เว็บเบราว์เซอร์' : localCopy?.browser ?? 'Web browser',
                  featureList: localeContent.features,
                  knowsAbout: [
                      localeContent.h1,
                      ...localeContent.metaKeywords,
                      'public video download',
                        ...(socialPlatform || isTiktok || data.slug === 'dailymotion-video-downloader' ? [] : ['batch download', 'playlist download', 'audio extraction']),
                  ],
                    ...(socialPlatform || isTiktok || data.slug === 'dailymotion-video-downloader' ? {} : { offers: {
                      '@type': 'Offer',
                      price: '0',
                      priceCurrency: 'USD',
                  } }),
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
    let mounted = false;
    let loadingOmnibox = false;

    onMount(() => { mounted = true; });
    $: if (mounted && data.slug !== 'youtube-download' && !socialPlatform && !OmniboxComponent && !loadingOmnibox) {
        loadingOmnibox = true;
        void import('$components/save/Omnibox.svelte')
            .then((module) => {
                OmniboxComponent = module.default;
            })
            .catch((error) => {
                console.debug('Downloader controls failed to load', error);
            });
    }

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
    <meta name="twitter:image:alt" content={socialPlatform || data.slug === 'dailymotion-video-downloader' ? localeContent.h1 : 'FreeSaveVideo video downloader preview'} />
    {#if structuredData.length}
        {#each structuredData as ld}
            {@html `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}
        {/each}
    {/if}
</svelte:head>

{#if data.slug === 'youtube-download'}
    <YouTubeDownloadPage lang={data.lang} content={{ ...localeContent, faqs: mergedFaqs }} guideSlug={data.guideSlug} />
{:else if socialPlatform === 'reddit'}
    <RedditDownloadPage lang={data.lang} content={localeContent} guideSlug={data.guideSlug} />
{:else if socialPlatform === 'pinterest'}
    <PinterestDownloadPage lang={data.lang} content={localeContent} guideSlug={data.guideSlug} />
{:else}
<div class="page" class:dailymotion-page={data.slug === 'dailymotion-video-downloader'}>
    <div class="services">
        <SupportedServices />
    </div>

    <main class="container" tabindex="-1" data-first-focus data-focus-ring-hidden>
        <section class="hero">
            <div class="hero-copy">
                {#if data.slug === 'dailymotion-video-downloader'}
                    <div class="dm-eyebrow"><span></span> FreeSaveVideo / Dailymotion</div>
                {/if}
                <h1>{localeContent.h1}</h1>
                <p class="lede">{localeContent.lede}</p>
                {#if localeContent.heroTags?.length}
                    <ul class="hero-tags" aria-label={isJa ? '対応機能' : isZh ? '支持功能' : isTh ? 'คุณสมบัติที่รองรับ' : data.slug === 'dailymotion-video-downloader' ? dailymotionUi.featuresLabel : 'Supported features'}>
                        {#each localeContent.heroTags as tag}
                            <li>{tag}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
            {#if data.slug === 'dailymotion-video-downloader'}
                <div class="dm-art" aria-hidden="true">
                    <div class="dm-orbit"></div>
                    <div class="dm-video-card">
                        <div class="dm-video-top"><span>dailymotion</span><span class="dm-video-dot"></span></div>
                        <div class="dm-play">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                        <div class="dm-timeline"><span></span><i></i><span></span></div>
                    </div>
                    <div class="dm-file-card">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 14l3 3 3-3M12 11v6" /></svg>
                        <div><strong>MP4</strong><span>{dailymotionUi.videoAudio}</span></div>
                        <span class="dm-file-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m5 12 4 4L19 6" /></svg></span>
                    </div>
                </div>
            {/if}
            <div class="hero-omnibox">
                {#if OmniboxComponent}
                    <svelte:component this={OmniboxComponent} />
                {:else if isTiktok && (data.lang === 'en' || isZh)}
                    <form class="dailymotion-form" action={homeUrl} method="GET">
                        <label for="tiktok-source-url">{isZh ? '\u7c98\u8d34 TikTok \u5206\u4eab\u94fe\u63a5' : 'Paste a TikTok share link'}</label>
                        {#if data.slug === 'tiktok-collection-download'}
                            <textarea id="tiktok-source-url" name="u" rows="3" required placeholder="https://www.tiktok.com/@user/video/..."></textarea>
                        {:else}
                            <input id="tiktok-source-url" name="u" type="url" required placeholder="https://www.tiktok.com/@user/video/..." />
                        {/if}
                        <button type="submit">{isZh ? '\u7ee7\u7eed\u5230\u4e0b\u8f7d\u5668' : 'Continue to downloader'}</button>
                    </form>
                {:else if data.slug === 'dailymotion-video-downloader'}
                    <form class="dailymotion-form" action={homeUrl} method="GET">
                        <label for="dailymotion-url">{dailymotionUi.urlLabel}</label>
                        <input id="dailymotion-url" name="u" type="url" placeholder="https://www.dailymotion.com/video/..." required />
                        <button type="submit">{dailymotionUi.continueLabel}</button>
                    </form>
                {:else}
                    <a class="downloader-fallback" href={homeUrl}>
                        {isJa ? 'ダウンローダーを開く' : isZh ? '打开下载器' : isTh ? 'เปิดเครื่องมือดาวน์โหลด' : localCopy?.downloader ?? 'Open downloader'}
                    </a>
                {/if}
            </div>
        </section>

        {#if (data.lang === 'en' || data.slug === 'dailymotion-video-downloader') && (data.landing.examples?.length || data.landing.supportedLinkFormats?.length)}
            <section class="card example-section" aria-labelledby="supported-example-links">
                <div class="example-heading">
                    <div>
                        <p class="example-eyebrow">{data.slug === 'dailymotion-video-downloader' ? dailymotionUi.exampleEyebrow : 'Try a supported URL shape'}</p>
                        <h2 id="supported-example-links">{data.slug === 'dailymotion-video-downloader' ? dailymotionUi.exampleTitle : 'Supported example links'}</h2>
                    </div>
                    <p>
                        {#if data.slug === 'dailymotion-video-downloader'}
                            {localeContent.disclaimer}
                        {:else}
                        Examples are public links for demonstrating URL input. Only save content you
                        own, have permission to use, or are legally allowed to download.
                        {/if}
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
                        <h3>{data.slug === 'dailymotion-video-downloader' ? dailymotionUi.formatsTitle : localCopy?.collection ?? 'Other supported collection formats'}</h3>
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
                {#if isTiktok && (data.lang === 'en' || isZh)}
                    <a class="related-link" href={FREESAVEVIDEO_EXTENSION_STORE_URL} target="_blank" rel="noreferrer noopener">FreeSaveVideo - Chrome Web Store</a>
                {/if}
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

        {/if}

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
                        {#if data.lang === 'en' && !isTiktok}
                            <a class="related-link" href={learnUrl}>
                                Learning and troubleshooting guides
                            </a>
                        {/if}
                        <a class="related-link" href={faqUrl}>
                            {localizedFaqLabel}
                        </a>
                        {#if !isTiktok}
                        <a class="related-link" href={discoverUrl}>
                            {localizedDiscoverLabel}
                        </a>
                        {/if}
                    </div>
                </section>

                <section class="related-column">
                    <h3>{runtimeContent.labels.similarDownloads}</h3>
                    <div class="related-links">
                        {#each (isTiktok ? data.relatedPages.filter((page) => isTiktokLanding(page.slug)).slice(0, 2) : data.relatedPages.slice(0, 6)) as related}
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

                {#if data.relatedLearnPages.length && !isTiktok}
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
{/if}

<style>
    .dailymotion-form { display: grid; gap: 12px; width: 100%; }
    .dailymotion-form label { font-weight: 600; }
    .dailymotion-form input, .dailymotion-form textarea { box-sizing: border-box; width: 100%; min-width: 0; padding: 14px; border: 1px solid var(--button); border-radius: 12px; background: var(--background); color: var(--text); font: inherit; }
    .dailymotion-form button { padding: 14px 20px; border: 0; border-radius: 12px; background: var(--button); color: var(--text); font: inherit; font-weight: 600; cursor: pointer; }
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
    /* Dailymotion uses the site's theme tokens and keeps the shared downloader. */
    .dailymotion-page {
        --download-surface: var(--background);
        --download-panel: color-mix(in srgb, var(--background) 60%, var(--popup-bg));
        --download-border: var(--popup-stroke);
        box-sizing: border-box;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding-bottom: 64px;
        background: radial-gradient(ellipse at 75% 0%, rgba(var(--accent-rgb), 0.09), transparent 38%);
    }
    .dailymotion-page .container { gap: 28px; padding-top: 12px; }
    .dailymotion-page :global(*) { font-family: inherit; }
    .dailymotion-page .crumb-links { order: -1; padding: 0 4px; font-size: 0.8rem; }
    .dailymotion-page .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.8fr);
        align-items: center;
        gap: 32px;
        padding: clamp(24px, 4vw, 48px);
        border-radius: 28px;
        background: linear-gradient(125deg, var(--background) 15%, color-mix(in srgb, var(--background) 90%, var(--accent)));
        border: 1px solid var(--download-border);
        box-shadow: 0 16px 48px rgba(var(--accent-rgb), 0.06);
    }
    .dm-eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; color: var(--download-accent); font-size: 0.76rem; font-weight: 700; letter-spacing: 0.04em; }
    .dm-eyebrow > span { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
    .dailymotion-page .hero-copy h1 { max-width: 620px; font-size: clamp(32px, 4.1vw, 52px); font-weight: 750; letter-spacing: -0.045em; line-height: 1.08; text-wrap: balance; }
    .dailymotion-page .lede { max-width: 560px; margin-top: 20px; font-size: 1rem; line-height: 1.75; }
    .dailymotion-page .hero-tags { gap: 8px 12px; margin-top: 22px; }
    .dailymotion-page .hero-tags li { padding: 0; border: 0; background: none; font-size: 0.76rem; font-weight: 500; color: var(--download-muted); }
    .dailymotion-page .hero-tags li::before { content: '\2713'; margin-right: 6px; color: var(--download-accent); font-weight: 700; }
    .dm-art { position: relative; height: 260px; min-width: 0; display: grid; align-content: center; padding: 20px 0 40px; }
    .dm-orbit { position: absolute; width: 240px; height: 240px; border: 1px solid rgba(var(--accent-rgb), 0.15); border-radius: 50%; top: 0; left: 50%; transform: translateX(-50%); box-shadow: 0 0 0 25px rgba(var(--accent-rgb), 0.04), 0 0 0 50px rgba(var(--accent-rgb), 0.02); }
    .dm-video-card { position: relative; width: 100%; max-width: 300px; margin: auto; padding: 20px; box-sizing: border-box; border: 1px solid rgba(var(--accent-rgb), 0.24); border-radius: 18px; background: linear-gradient(140deg, color-mix(in srgb, var(--background) 84%, var(--accent)), var(--background)); box-shadow: 0 16px 32px rgba(var(--accent-rgb), 0.12); transform: rotate(-5deg); }
    .dm-video-top { display: flex; align-items: center; justify-content: space-between; color: var(--download-heading); font-size: 0.8rem; font-weight: 700; }
    .dm-video-dot { width: 6px; height: 6px; background: var(--accent); border-radius: 50%; }
    .dm-play { width: 64px; height: 64px; margin: 22px auto; border-radius: 50%; display: grid; place-items: center; color: var(--button-active-text); background: var(--button-active-bg); box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0.1); }
    .dm-play svg { width: 30px; height: 30px; }
    .dm-timeline { display: flex; align-items: center; gap: 5px; }
    .dm-timeline span { height: 3px; border-radius: 4px; background: var(--accent); width: 36%; }
    .dm-timeline span:last-child { flex: 1; background: rgba(var(--accent-rgb), 0.2); }
    .dm-timeline i { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
    .dm-file-card { position: absolute; right: 0; bottom: 12px; display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-radius: 14px; border: 1px solid var(--download-border); background: var(--background); box-shadow: 0 12px 32px rgba(var(--accent-rgb), 0.12); transform: rotate(3deg); }
    .dm-file-card > svg { width: 30px; height: 34px; color: var(--download-accent); }
    .dm-file-card strong { display: block; font-size: 0.9rem; color: var(--text); }
    .dm-file-card div > span { font-size: 0.7rem; color: var(--subtext); }
    .dm-file-check { width: 24px; height: 24px; margin-left: 12px; display: grid; place-items: center; border-radius: 50%; background: rgba(var(--accent-rgb), 0.13); color: var(--download-accent); }
    .dm-file-check svg { width: 14px; height: 14px; }
    .dailymotion-page .hero-omnibox { grid-column: 1 / -1; padding: 20px; background: var(--background); border: 1px solid var(--download-border); border-radius: 18px; box-shadow: 0 6px 24px rgba(var(--accent-rgb), 0.05); }
    .dailymotion-page .dailymotion-form { grid-template-columns: minmax(0, 1fr) auto; }
    .dailymotion-page .dailymotion-form label { grid-column: 1 / -1; font-size: 0.85rem; }
    .dailymotion-page .dailymotion-form input { border-color: var(--input-border); }
    .dailymotion-page .dailymotion-form button { background: var(--button-active-bg); color: var(--button-active-text); }
    .dailymotion-page .card { min-width: 0; padding: 28px; border: 1px solid var(--download-border); border-radius: 20px; box-shadow: none; }
    .dailymotion-page .card h2 { margin-bottom: 22px; font-size: 1.3rem; line-height: 1.3; letter-spacing: -0.025em; }
    .dailymotion-page .fact-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; background: var(--download-panel); }
    .dailymotion-page .fact-summary p { padding-left: 14px; border-left: 2px solid rgba(var(--accent-rgb), 0.45); font-size: 0.83rem; color: var(--download-muted); }
    .dailymotion-page .section-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
    .dailymotion-page .step-list { gap: 16px; }
    .dailymotion-page .step-list li { border: 0; background: transparent; padding: 0; font-size: 0.88rem; }
    .dailymotion-page .step-list li::before { border-radius: 50%; background: rgba(var(--accent-rgb), 0.1); }
    .dailymotion-page .features .feature-list { gap: 20px; font-size: 0.88rem; }
    .dailymotion-page .faq-list { grid-template-columns: 1fr; gap: 0; }
    .dailymotion-page .faq-item { border: 0; border-bottom: 1px solid var(--download-border); border-radius: 0; background: none; padding: 18px 0; }
    .dailymotion-page .faq-item:first-child { padding-top: 0; }
    .dailymotion-page .faq-item:last-child { border-bottom: 0; padding-bottom: 0; }
    .dailymotion-page .faq-item summary { display: flex; justify-content: space-between; align-items: center; gap: 20px; line-height: 1.5; font-size: 0.92rem; }
    .dailymotion-page .faq-item summary::after { content: '+'; flex-shrink: 0; font-size: 1.25rem; font-weight: 400; color: var(--download-accent); }
    .dailymotion-page .faq-item[open] summary::after { content: '\2212'; }
    .dailymotion-page .faq-item summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; border-radius: 3px; }
    .dailymotion-page .faq-item p { max-width: 850px; margin-top: 12px; font-size: 0.88rem; }
    .dailymotion-page .format-list { gap: 16px; }
    .dailymotion-page .example-heading > p { color: var(--download-muted); opacity: 1; font-size: 0.86rem; }
    .dailymotion-page .format-list h3 { color: var(--download-heading); font-size: 0.9rem; }
    .dailymotion-page .format-list .feature-list { overflow-wrap: anywhere; font-family: var(--font-mono, monospace); font-size: 0.8rem; }
    .dailymotion-page .link-type { background: var(--download-panel); padding: 20px; border-radius: 14px; }
    .dailymotion-page .link-type p { font-size: 0.86rem; margin-top: 10px; }
    .dailymotion-page .related-link { padding: 14px; background: var(--download-panel); }
    .dailymotion-page .related-link-desc { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .dailymotion-page .disclaimer { max-width: 760px; margin: 0 auto; }
    @media (max-width: 760px) {
        .dailymotion-page .container { gap: 20px; }
        .dailymotion-page .hero { grid-template-columns: minmax(0, 1fr); gap: 24px; padding: 26px 22px; border-radius: 22px; }
        .dm-art { display: none; }
        .dailymotion-page .hero-omnibox { padding: 14px; }
        .dailymotion-page .fact-summary, .dailymotion-page .section-grid { grid-template-columns: minmax(0, 1fr); gap: 20px; }
        .dailymotion-page .card { padding: 22px; border-radius: 18px; }
        .dailymotion-page .dailymotion-form { grid-template-columns: minmax(0, 1fr); }
        .dailymotion-page .example-heading { grid-template-columns: minmax(0, 1fr); }
        .dailymotion-page .related-grid, .dailymotion-page .link-type-grid { grid-template-columns: minmax(0, 1fr); }
    }
</style>
