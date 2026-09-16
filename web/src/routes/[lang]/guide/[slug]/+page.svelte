<script lang="ts">
    import env from '$lib/env';
    import { getYoutubeGuideContent } from '$lib/seo/youtube-guide-content';
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

    $: dedicatedGuide = getYoutubeGuideContent(data.slug, data.lang);
    $: baseLocaleContent = { ...getSeoLandingLocale(data.landing, data.lang), ...dedicatedGuide };
    $: localeContent =
        data.lang === 'en'
            ? {
                  ...baseLocaleContent,
                  stepsTitle: data.guide.enStepsTitle ?? baseLocaleContent.stepsTitle,
                  steps: data.guide.enSteps ?? baseLocaleContent.steps,
                  featuresTitle: data.guide.enFeaturesTitle ?? baseLocaleContent.featuresTitle,
                  features: data.guide.enFeatures ?? baseLocaleContent.features,
                  faqs: data.guide.enFaqs ?? baseLocaleContent.faqs,
              }
            : baseLocaleContent;
    $: isZh = data.lang === 'zh';
    $: isJa = data.lang === 'ja';
    $: isTh = data.lang === 'th';
    type GuideSeoCopy = {
        title: (platform: string) => string;
        description: (platform: string) => string;
    };
    const guideSeoCopy: Record<string, GuideSeoCopy> = {
        id: {
            title: (platform) => `Cara mengunduh video ${platform}`,
            description: (platform) => `Panduan menyalin tautan ${platform} yang didukung, memilih format yang tersedia, menyimpan file, dan memeriksa kesalahan tautan.`,
        },
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
    type GuideUiCopy = {
        directory: string;
        guides: string;
        faq: string;
        discover: string;
        relatedGuide: (label: string) => string;
        douyinTitle: string;
        douyinBody: string;
        cta: string;
        ctaHint: string;
        usageTitle: string;
        usageFirst: string;
        usageSecond: string;
        practical: string;
        flow: string;
        advantages: string;
        troubleshooting: string;
        guidance: string;
        checklist: string;
        failures: string;
        related: string;
    };
    const guideUiCopy: Record<string, GuideUiCopy> = {
        es: {
            directory: 'Directorio de descargadores de vídeo populares', guides: 'Guías de descarga populares', faq: 'Preguntas frecuentes sobre descargas', discover: 'Descubrir vídeos populares',
            relatedGuide: (label) => `Cómo descargar ${label}`, douyinTitle: 'Videotutorial: cómo copiar el enlace correcto de un vídeo de Douyin', douyinBody: 'Si copiaste una página de búsqueda o jingxuan en lugar del enlace para compartir un vídeo, este tutorial muestra cómo abrir primero el vídeo y copiar la URL correcta.',
            cta: 'Descargar ahora', ctaHint: 'Abrir el descargador', usageTitle: 'Notas de uso', usageFirst: 'Copia la URL del contenido público y pégala en el descargador. Los resultados dependen de los archivos disponibles en la plataforma de origen.', usageSecond: 'Si el enlace falla, confirma que el contenido sea público, copia de nuevo la URL y vuelve a intentarlo más tarde o con otra red.',
            practical: 'Funciones y consejos de uso', flow: 'Proceso de descarga y guardado', advantages: 'Ventajas de la plataforma', troubleshooting: 'Solución de problemas por plataforma', guidance: 'Indicaciones clave', checklist: 'Lista de comprobación', failures: 'Casos de error y soluciones', related: 'Enlaces relacionados',
        },
        fr: {
            directory: 'Répertoire des téléchargeurs populaires', guides: 'Guides de téléchargement populaires', faq: 'FAQ sur le téléchargement', discover: 'Découvrir les vidéos populaires',
            relatedGuide: (label) => `Comment télécharger ${label}`, douyinTitle: 'Tutoriel vidéo : copier le bon lien d’une vidéo Douyin', douyinBody: 'Si vous avez copié une page de recherche ou jingxuan au lieu du lien de partage d’une vidéo, ce tutoriel explique comment ouvrir la vidéo puis copier la bonne URL.',
            cta: 'Télécharger maintenant', ctaHint: 'Ouvrir le téléchargeur', usageTitle: 'Conseils d’utilisation', usageFirst: 'Copiez l’URL du contenu public et collez-la dans le téléchargeur. Le résultat dépend des fichiers proposés par la plateforme source.', usageSecond: 'Si le lien échoue, vérifiez que le contenu est public, recopiez l’URL, puis réessayez plus tard ou avec un autre réseau.',
            practical: 'Fonctions et conseils d’utilisation', flow: 'Parcours de téléchargement et d’enregistrement', advantages: 'Avantages de la plateforme', troubleshooting: 'Dépannage par plateforme', guidance: 'Conseils essentiels', checklist: 'Liste de vérification', failures: 'Cas d’échec et solutions', related: 'Liens associés',
        },
        de: {
            directory: 'Beliebte Video-Downloader', guides: 'Beliebte Download-Anleitungen', faq: 'Häufige Fragen zum Download', discover: 'Beliebte Videos entdecken',
            relatedGuide: (label) => `${label} herunterladen`, douyinTitle: 'Videoanleitung: Den richtigen Douyin-Videolink kopieren', douyinBody: 'Falls du statt eines Freigabelinks eine Such- oder jingxuan-Seite kopiert hast, zeigt diese Anleitung, wie du zuerst das Video öffnest und dann die richtige URL kopierst.',
            cta: 'Jetzt herunterladen', ctaHint: 'Downloader öffnen', usageTitle: 'Nutzungshinweise', usageFirst: 'Kopiere die URL des öffentlichen Inhalts und füge sie in den Downloader ein. Das Ergebnis hängt von den Dateien ab, die die Quellplattform bereitstellt.', usageSecond: 'Wenn der Link nicht funktioniert, prüfe, ob der Inhalt öffentlich ist, kopiere die URL erneut und versuche es später oder über ein anderes Netzwerk.',
            practical: 'Funktionen und Nutzungstipps', flow: 'Download- und Speichervorgang', advantages: 'Plattformvorteile', troubleshooting: 'Plattformspezifische Fehlerbehebung', guidance: 'Wichtige Hinweise', checklist: 'Erfolgscheckliste', failures: 'Fehlerfälle und Lösungen', related: 'Verwandte Links',
        },
        vi: {
            directory: 'Danh mục công cụ tải video phổ biến', guides: 'Hướng dẫn tải xuống phổ biến', faq: 'Câu hỏi thường gặp về tải xuống', discover: 'Khám phá video phổ biến',
            relatedGuide: (label) => `Cách tải ${label}`, douyinTitle: 'Video hướng dẫn: cách sao chép đúng liên kết video Douyin', douyinBody: 'Nếu bạn đã sao chép trang tìm kiếm hoặc jingxuan thay vì liên kết chia sẻ video, hướng dẫn này sẽ chỉ cách mở video trước rồi sao chép đúng URL.',
            cta: 'Tải xuống ngay', ctaHint: 'Mở trình tải xuống', usageTitle: 'Lưu ý sử dụng', usageFirst: 'Sao chép URL của nội dung công khai và dán vào trình tải xuống. Kết quả phụ thuộc vào các tệp mà nền tảng nguồn cung cấp.', usageSecond: 'Nếu liên kết không hoạt động, hãy xác nhận nội dung là công khai, sao chép lại URL rồi thử lại sau hoặc đổi mạng.',
            practical: 'Tính năng và mẹo sử dụng', flow: 'Quy trình tải và lưu', advantages: 'Ưu điểm nền tảng', troubleshooting: 'Khắc phục sự cố theo nền tảng', guidance: 'Hướng dẫn chính', checklist: 'Danh sách kiểm tra', failures: 'Trường hợp lỗi và cách khắc phục', related: 'Liên kết liên quan',
        },
        id: {
            directory: 'Direktori pengunduh populer', guides: 'Panduan unduhan populer', faq: 'Tanya jawab unduhan', discover: 'Temukan video populer',
            relatedGuide: (label) => `Cara mengunduh ${label}`, douyinTitle: 'Tutorial video: cara menyalin tautan video Douyin yang benar', douyinBody: 'Jika Anda menyalin halaman pencarian atau jingxuan, bukan tautan berbagi video, tutorial ini menunjukkan cara membuka videonya terlebih dahulu lalu menyalin URL yang benar.',
            cta: 'Unduh sekarang', ctaHint: 'Buka pengunduh', usageTitle: 'Catatan penggunaan', usageFirst: 'Salin URL konten publik lalu tempelkan ke pengunduh. Hasil bergantung pada berkas yang disediakan platform sumber.', usageSecond: 'Jika tautan gagal, pastikan konten bersifat publik, salin ulang URL, lalu coba lagi nanti atau gunakan jaringan lain.',
            practical: 'Fitur dan tips penggunaan', flow: 'Alur unduh dan simpan', advantages: 'Keunggulan platform', troubleshooting: 'Pemecahan masalah per platform', guidance: 'Panduan utama', checklist: 'Daftar pemeriksaan', failures: 'Kasus kegagalan dan solusi', related: 'Tautan terkait',
        },
        ru: {
            directory: 'Каталог популярных загрузчиков', guides: 'Популярные руководства', faq: 'Частые вопросы о загрузке', discover: 'Популярные видео',
            relatedGuide: (label) => `Как скачать ${label}`, douyinTitle: 'Видеоинструкция: как скопировать правильную ссылку на видео Douyin', douyinBody: 'Если вместо ссылки на видео вы скопировали страницу поиска или jingxuan, инструкция покажет, как сначала открыть видео, а затем скопировать правильный URL.',
            cta: 'Скачать сейчас', ctaHint: 'Открыть загрузчик', usageTitle: 'Примечания по использованию', usageFirst: 'Скопируйте URL общедоступного контента и вставьте его в загрузчик. Результат зависит от файлов, доступных на исходной платформе.', usageSecond: 'Если ссылка не работает, убедитесь, что контент открыт для всех, скопируйте URL заново и повторите попытку позже или в другой сети.',
            practical: 'Возможности и советы', flow: 'Процесс загрузки и сохранения', advantages: 'Преимущества платформы', troubleshooting: 'Устранение неполадок платформы', guidance: 'Основные рекомендации', checklist: 'Контрольный список', failures: 'Ошибки и способы исправления', related: 'Связанные ссылки',
        },
    };
    $: uiCopy = guideUiCopy[data.lang];
    const homeLabels: Record<string, string> = { es: 'Inicio', fr: 'Accueil', de: 'Startseite', vi: 'Trang chủ', id: 'Beranda', ru: 'Главная' };
    const guideLabels: Record<string, string> = { es: 'Guía', fr: 'Guide', de: 'Anleitung', vi: 'Hướng dẫn', id: 'Panduan', ru: 'Руководство' };
    $: localizedGuideCopy = guideSeoCopy[data.lang] ?? guideSeoCopy.en;
    $: guideTitle =
        dedicatedGuide ? dedicatedGuide.metaTitle : data.lang === 'en' && data.guide.enTitle
            ? data.guide.enTitle
            : localizedGuideCopy.title(data.guide.platform);
    $: pageTitle = `${guideTitle} - ${isZh ? ZH_BRAND : EN_BRAND}`;
    $: pageDesc =
        dedicatedGuide ? dedicatedGuide.metaDescription : data.lang === 'en' && data.guide.enDescription
            ? data.guide.enDescription
            : localizedGuideCopy.description(data.guide.platform);
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
        data.lang,
    );
    $: relatedDownloads = getRelatedDownloadLinks(
        data.guide.landingSlug,
        6,
        data.lang === 'en' ? 'international' : 'all',
        data.lang,
    );
    $: downloadHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u89c6\u9891\u4e0b\u8f7d\u76ee\u5f55' : isTh ? 'รายการเครื่องมือดาวน์โหลดวิดีโอยอดนิยม' : uiCopy?.directory ?? 'Popular video downloader directory';
    $: currentDownloadLabel = isZh ? localeContent.h1 : localeContent.h1;
    $: guideHubLabel = isZh ? '\u70ed\u95e8\u5e73\u53f0\u4e0b\u8f7d\u6307\u5357' : isTh ? 'คู่มือดาวน์โหลดยอดนิยม' : uiCopy?.guides ?? 'Popular download guides';
    $: faqLabel = isZh ? '\u89c6\u9891\u4e0b\u8f7d\u5e38\u89c1\u95ee\u9898' : isTh ? 'คำถามที่พบบ่อยเกี่ยวกับการดาวน์โหลดวิดีโอ' : uiCopy?.faq ?? 'Video download FAQ';
    $: discoverLabel = isZh ? '\u70ed\u95e8\u89c6\u9891\u53d1\u73b0' : isTh ? 'ค้นพบวิดีโอยอดนิยม' : uiCopy?.discover ?? 'Trending video discovery';
    $: localizedDownloadHubLabel = isJa ? '人気動画ダウンローダー一覧' : downloadHubLabel;
    $: localizedGuideHubLabel = isJa ? '人気プラットフォームのダウンロードガイド' : guideHubLabel;
    $: localizedFaqLabel = isJa ? '動画ダウンロードのよくある質問' : faqLabel;
    $: localizedDiscoverLabel = isJa ? '人気動画を探す' : discoverLabel;
    const relatedGuideLabel = (slug: string, platform: string) => {
        const guide = getGuidePage(slug);
        const landing = guide ? getSeoLandingPage(guide.landingSlug) : null;
        const label = landing ? getSeoLandingLocale(landing, data.lang).h1 : platform;
        return isJa ? `${label} の保存方法` : isZh ? `${label}\u6307\u5357` : isTh ? `วิธีดาวน์โหลด ${label}` : uiCopy?.relatedGuide(label) ?? `How to download ${label}`;
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
        : uiCopy?.douyinTitle ?? 'Video tutorial: how to copy the correct Douyin video link';
    $: douyinTutorialBody = isZh
        ? '\u5982\u679c\u4f60\u590d\u5236\u5230\u7684\u662f search \u6216 jingxuan \u9875\u9762\uff0c\u53ef\u4ee5\u5148\u770b\u4e0b\u9762\u7684\u6f14\u793a\uff0c\u6309\u6d41\u7a0b\u6253\u5f00\u5177\u4f53\u89c6\u9891\u540e\u518d\u590d\u5236\u5206\u4eab\u94fe\u63a5\u3002'
        : uiCopy?.douyinBody ?? 'If you copied a search or jingxuan page instead of a video share link, this tutorial shows how to open the actual video first and copy the right URL.';

    $: ctaLabel = isJa ? '今すぐダウンロード' : isZh ? '\u53bb\u4e0b\u8f7d' : isTh ? 'ดาวน์โหลดเลย' : uiCopy?.cta ?? 'Download Now';
    $: ctaHint = isJa ? 'ダウンローダーを開く' : isZh ? '\u8df3\u8f6c\u5230\u4e0b\u8f7d\u9875\u9762' : isTh ? 'เปิดเครื่องมือดาวน์โหลด' : uiCopy?.ctaHint ?? 'Open the downloader';
    $: runtimeContent = getSeoRuntimeContent(data.lang);
    $: hasLocalizedRuntime = true;
    $: platformKey = getPlatformKey(data.slug);
    $: productFaqs = dedicatedGuide ? [] : runtimeContent.productFaqs;
    $: productTips = dedicatedGuide ? [] : runtimeContent.productTips;
    $: productAdvantages = dedicatedGuide ? [] : runtimeContent.productAdvantages;
    $: platformFaqs = dedicatedGuide ? [] : runtimeContent.platformFaqs[platformKey] ?? runtimeContent.platformFaqs.generic;
    $: platformPlaybook =
        dedicatedGuide ? { heading: '', notes: [], checklist: [] } : runtimeContent.platformPlaybooks[platformKey] ?? runtimeContent.platformPlaybooks.generic;
    $: platformFailureCases =
        dedicatedGuide ? [] : runtimeContent.platformFailureCases[platformKey] ?? runtimeContent.platformFailureCases.generic;
    $: landingFaqs = !dedicatedGuide && data.guide.landingSlug === 'youtube-download'
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
                      name: isJa ? 'ホーム' : isZh ? '\u9996\u9875' : isTh ? 'หน้าแรก' : homeLabels[data.lang] ?? 'Home',
                      item: `https://${fallbackHost}/${data.lang}`,
                  },
                  {
                      '@type': 'ListItem',
                      position: 2,
                      name: isJa ? 'ガイド' : isZh ? '\u6307\u5357' : isTh ? 'คู่มือ' : guideLabels[data.lang] ?? 'Guide',
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
                <p class="eyebrow">{isJa ? 'ダウンロードガイド' : isZh ? '\u4e0b\u8f7d\u6307\u5357' : isTh ? 'คู่มือดาวน์โหลด' : 'Download guide'}</p>
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

        {#if dedicatedGuide}
            {#each dedicatedGuide.sections as section}
                <section class="card details">
                    <h2>{section.title}</h2>
                    {#each section.paragraphs as paragraph}<p>{paragraph}</p>{/each}
                </section>
            {/each}
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
            {#if hasLocalizedRuntime}
            <section class="card details">
                <h2>{isJa ? '利用上の注意' : isZh ? '\u4f7f\u7528\u8bf4\u660e' : isTh ? 'ข้อควรรู้ในการใช้งาน' : uiCopy?.usageTitle ?? 'Usage notes'}</h2>
                <p>
                    {isZh
                        ? '\u590d\u5236\u94fe\u63a5\u540e\u76f4\u63a5\u7c98\u8d34\u5230\u4e0b\u8f7d\u9875\u5373\u53ef\u89e3\u6790\u3002\u89e3\u6790\u7ed3\u679c\u4ee5\u5e73\u53f0\u8fd4\u56de\u7684\u8d44\u6e90\u4e3a\u51c6\u3002'
                        : isJa
                          ? '公開コンテンツの URL をコピーしてダウンローダーへ貼り付けてください。結果はその時点で配信元プラットフォームが提供するファイルによって異なります。'
                        : isTh
                          ? 'คัดลอก URL ของเนื้อหาสาธารณะแล้ววางในเครื่องมือดาวน์โหลด ผลลัพธ์ขึ้นอยู่กับไฟล์ที่แพลตฟอร์มต้นทางมีให้ในขณะนั้น'
                           : uiCopy?.usageFirst ?? 'Copy the link and paste it into the downloader. Results depend on what the platform provides.'}
                </p>
                <p>
                    {isZh
                        ? '\u5982\u679c\u94fe\u63a5\u65e0\u6cd5\u89e3\u6790\uff0c\u8bf7\u786e\u8ba4\u5185\u5bb9\u53ef\u516c\u5f00\u8bbf\u95ee\uff0c\u5fc5\u8981\u65f6\u66f4\u6362\u7f51\u7edc\u6216\u7a0d\u540e\u518d\u8bd5\u3002'
                        : isJa
                          ? '解析できない場合は、公開状態で閲覧できることを確認し、URL をコピーし直してから、時間をおくかネットワークを変えて再試行してください。'
                        : isTh
                          ? 'หากวิเคราะห์ลิงก์ไม่สำเร็จ ให้ตรวจสอบว่าเนื้อหาเปิดดูได้แบบสาธารณะ คัดลอก URL ใหม่ แล้วลองอีกครั้งภายหลังหรือเปลี่ยนเครือข่าย'
                           : uiCopy?.usageSecond ?? 'If a link fails, confirm it is publicly accessible and try again later or switch networks.'}
                </p>
            </section>
            {/if}
        </section>

        {#if productTips.length || productAdvantages.length}
        <section class="card practical">
            <h2>{isJa ? '製品機能と利用のヒント' : isZh ? '产品能力与使用建议' : isTh ? 'ความสามารถและคำแนะนำการใช้งาน' : uiCopy?.practical ?? 'Product strengths and usage notes'}</h2>
            <div class="practical-grid">
                <section>
                    <h3>{isJa ? 'ダウンロードと保存の流れ' : isZh ? '下载与保存' : isTh ? 'ขั้นตอนดาวน์โหลดและบันทึกไฟล์' : uiCopy?.flow ?? 'Download and save flow'}</h3>
                    <ul>
                        {#each productTips as tip}
                            <li>{tip}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isJa ? 'プラットフォーム別の特長' : isZh ? '平台优势' : isTh ? 'จุดเด่นของแพลตฟอร์ม' : uiCopy?.advantages ?? 'Platform advantages'}</h3>
                    <ul>
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
            <h2>{isJa ? 'プラットフォーム別の問題解決' : isZh ? '按平台排查常见问题' : isTh ? 'แก้ปัญหาตามแพลตฟอร์ม' : uiCopy?.troubleshooting ?? 'Platform-specific troubleshooting'}</h2>
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
                    <h3>{isJa ? '重要なポイント' : isZh ? '\u5173\u952e\u5efa\u8bae' : isTh ? 'คำแนะนำสำคัญ' : uiCopy?.guidance ?? 'Key guidance'}</h3>
                    <ul>
                        {#each platformPlaybook.notes as note}
                            <li>{note}</li>
                        {/each}
                    </ul>
                </section>
                <section>
                    <h3>{isJa ? '成功確認チェックリスト' : isZh ? '\u6210\u529f\u68c0\u67e5\u6e05\u5355' : isTh ? 'รายการตรวจสอบก่อนดาวน์โหลด' : uiCopy?.checklist ?? 'Success checklist'}</h3>
                    <ul>
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
            <h2>{isJa ? '失敗例と解決方法' : isZh ? '\u5e73\u53f0\u6545\u969c\u6848\u4f8b\u4e0e\u4fee\u590d\u8def\u5f84' : isTh ? 'กรณีที่ล้มเหลวและวิธีแก้ไข' : uiCopy?.failures ?? 'Failure cases and fix paths'}</h2>
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

        {#if freeTools.length}
        <section class="card related">
            <h2>{isJa ? '関連リンク' : isZh ? '\u5ef6\u4f38\u94fe\u63a5' : isTh ? 'ลิงก์ที่เกี่ยวข้อง' : uiCopy?.related ?? 'Related links'}</h2>
            <div class="related-links">
                <a class="related-link related-link--primary" href={downloadHubUrl}>
                    {localizedDownloadHubLabel}
                </a>
                <a class="related-link related-link--primary" href={downloadUrl}>
                    {currentDownloadLabel}
                </a>
                <a class="related-link related-link--primary" href={guideIndexUrl}>
                    {localizedGuideHubLabel}
                </a>
                {#if data.lang === 'en'}
                    <a class="related-link related-link--primary" href={learnUrl}>
                        Learning and troubleshooting guides
                    </a>
                {/if}
                <a class="related-link related-link--primary" href={faqUrl}>
                    {localizedFaqLabel}
                </a>
                <a class="related-link related-link--primary" href={discoverUrl}>
                    {localizedDiscoverLabel}
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
            <h2>{isJa ? 'ポイント不要の無料ツール' : isZh ? '\u514d\u79ef\u5206\u5de5\u5177' : isTh ? 'เครื่องมือฟรีที่ไม่ใช้คะแนน' : 'Free tools without points'}</h2>
            <div class="related-links">
                {#each freeTools as tool}
                    <a class="related-link" href={tool.href}>
                        <span>{tool.title}</span>
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
