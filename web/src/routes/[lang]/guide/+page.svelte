<script lang="ts">
    import env from '$lib/env';
    import SupportedServices from '$components/save/SupportedServices.svelte';
    import { getHubDownloadLinks } from '$lib/seo/internal-links';

    export let data: {
        lang: string;
        guides: Array<{
            slug: string;
            landingSlug: string;
            platform: string;
            title: string;
            lede: string;
        }>;
    };

    const fallbackHost = env.HOST || 'freesavevideo.online';
    const isZh = data.lang === 'zh';
    const isJa = data.lang === 'ja';
    const isTh = data.lang === 'th';
    const extraCopy: Record<string, Record<string, string>> = {
        es: { title: 'Guías de descarga de vídeos', desc: 'Guías paso a paso para guardar contenido público de plataformas populares, con límites y soluciones a problemas comunes.', eyebrow: 'Centro de guías', view: 'Ver guía', download: 'Descargar', related: 'Enlaces relacionados', directory: 'Directorio de descargas', faq: 'Preguntas frecuentes', home: 'Volver al descargador', suffix: 'página de descarga' },
        fr: { title: 'Guides de téléchargement vidéo', desc: 'Guides pas à pas pour enregistrer le contenu public des plateformes populaires, avec limites et solutions aux problèmes courants.', eyebrow: 'Centre des guides', view: 'Voir le guide', download: 'Télécharger', related: 'Liens associés', directory: 'Répertoire des téléchargements', faq: 'Questions fréquentes', home: 'Retour au téléchargeur', suffix: 'page de téléchargement' },
        de: { title: 'Video-Download-Anleitungen', desc: 'Schrittweise Anleitungen zum Speichern öffentlicher Inhalte beliebter Plattformen, einschließlich Grenzen und Fehlerbehebung.', eyebrow: 'Anleitungsübersicht', view: 'Anleitung öffnen', download: 'Herunterladen', related: 'Verwandte Links', directory: 'Downloadverzeichnis', faq: 'Häufige Fragen', home: 'Zurück zum Downloader', suffix: 'Downloadseite' },
        vi: { title: 'Hướng dẫn tải video', desc: 'Hướng dẫn từng bước để lưu nội dung công khai từ các nền tảng phổ biến, kèm giới hạn và cách xử lý sự cố.', eyebrow: 'Trung tâm hướng dẫn', view: 'Xem hướng dẫn', download: 'Tải xuống', related: 'Liên kết liên quan', directory: 'Danh mục tải xuống', faq: 'Câu hỏi thường gặp', home: 'Quay lại trình tải xuống', suffix: 'trang tải xuống' },
        ko: { title: '동영상 다운로드 가이드', desc: '인기 플랫폼의 공개 콘텐츠를 저장하는 단계별 방법과 제한 사항, 자주 발생하는 문제의 해결 방법을 안내합니다.', eyebrow: '가이드 모음', view: '가이드 보기', download: '다운로드', related: '관련 링크', directory: '다운로드 목록', faq: '자주 묻는 질문', home: '다운로더로 돌아가기', suffix: '다운로드 페이지' },
        id: { title: 'Panduan unduhan video', desc: 'Panduan langkah demi langkah untuk menyimpan konten publik dari platform populer, beserta batasan dan pemecahan masalah.', eyebrow: 'Pusat panduan', view: 'Lihat panduan', download: 'Unduh', related: 'Tautan terkait', directory: 'Direktori unduhan', faq: 'Pertanyaan umum', home: 'Kembali ke pengunduh', suffix: 'halaman unduhan' },
        ru: { title: 'Руководства по загрузке видео', desc: 'Пошаговые инструкции по сохранению публичного контента популярных платформ, включая ограничения и устранение неполадок.', eyebrow: 'Центр руководств', view: 'Открыть руководство', download: 'Скачать', related: 'Связанные ссылки', directory: 'Каталог загрузок', faq: 'Частые вопросы', home: 'Вернуться к загрузчику', suffix: 'страница загрузки' },
    };
    const localCopy = extraCopy[data.lang];
    const pageTitle = isZh ? '下载指南' : isTh ? 'คู่มือดาวน์โหลดวิดีโอ' : localCopy?.title ?? 'Download Guides';
    const pageDesc = isZh
        ? '为常见平台提供下载步骤与常见问题，一步一步完成。'
        : isTh
          ? 'คำแนะนำทีละขั้นตอนสำหรับดาวน์โหลดเนื้อหาสาธารณะจากแพลตฟอร์มยอดนิยม พร้อมข้อจำกัดและวิธีแก้ปัญหาที่พบบ่อย'
          : localCopy?.desc ?? 'Step-by-step download guides for popular platforms.';
    const featuredDownloads = getHubDownloadLinks(
        6,
        data.lang === 'en' ? 'international' : 'all',
        data.lang,
    );
    const localizedPageTitle = isJa ? '動画ダウンロードガイド' : pageTitle;
    const localizedPageDesc = isJa
        ? 'プラットフォーム別に、公開動画の保存手順、対応リンク、よくある問題を確認できます。'
        : pageDesc;
    const hubEyebrow = isJa ? 'ダウンロードガイド' : isZh ? '下载教程' : isTh ? 'คู่มือการดาวน์โหลด' : localCopy?.eyebrow ?? 'Guide hub';
    const viewGuideLabel = isJa ? 'ガイドを見る' : isZh ? '查看教程' : isTh ? 'ดูคำแนะนำ' : localCopy?.view ?? 'View guide';
    const downloadLabel = isJa ? 'ダウンロード' : isZh ? '去下载' : isTh ? 'ดาวน์โหลด' : localCopy?.download ?? 'Download';
    const relatedLabel = isJa ? '関連リンク' : isZh ? '相关入口' : isTh ? 'ลิงก์ที่เกี่ยวข้อง' : localCopy?.related ?? 'Related links';
    const directoryLabel = isJa ? '動画ダウンロード一覧' : isTh ? 'รายการเครื่องมือดาวน์โหลดวิดีโอ' : localCopy?.directory ?? 'Download directory';
    const faqLabel = isJa ? 'よくある質問' : isZh ? '常见问题 FAQ' : isTh ? 'คำถามที่พบบ่อย' : localCopy?.faq ?? 'Frequently asked questions';
    const homeLabel = isJa ? 'ダウンローダーのホームへ戻る' : isZh ? '返回下载首页' : isTh ? 'กลับไปยังหน้าแรกของเครื่องมือดาวน์โหลด' : localCopy?.home ?? 'Back to home downloader';
    const downloadPageSuffix = isJa ? 'ダウンロードページ' : isZh ? '下载页' : isTh ? 'หน้าดาวน์โหลด' : localCopy?.suffix ?? 'download page';
</script>

<svelte:head>
    <title>{localizedPageTitle}</title>
    <meta name="description" content={localizedPageDesc} />
    <meta property="og:title" content={localizedPageTitle} />
    <meta property="og:description" content={localizedPageDesc} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={localizedPageTitle} />
    <meta name="twitter:description" content={localizedPageDesc} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    <meta name="twitter:image:alt" content="FreeSaveVideo video downloader preview" />
</svelte:head>

<div class="page">
    <div class="services">
        <SupportedServices />
    </div>

    <main class="container">
        <section class="hero">
            <p class="eyebrow">{hubEyebrow}</p>
            <h1>{localizedPageTitle}</h1>
            <p class="lede">{localizedPageDesc}</p>
        </section>

        <section class="grid">
            {#each data.guides as guide}
                <article class="card">
                    <div class="card-body">
                        <h2>{guide.title}</h2>
                        <p>{guide.lede}</p>
                    </div>
                    <div class="actions">
                        <a class="btn ghost" href={`/${data.lang}/guide/${guide.slug}`}>
                            {viewGuideLabel}
                        </a>
                        <a
                            class="btn primary"
                            href={`/${data.lang}/download/${guide.landingSlug}`}
                        >
                            {downloadLabel}
                        </a>
                    </div>
                </article>
            {/each}
        </section>

        <section class="card link-hub">
            <h2>{relatedLabel}</h2>
            <div class="link-grid">
                <a class="link-item link-item--primary" href={`/${data.lang}/download`}>
                    {directoryLabel}
                </a>
                <a class="link-item link-item--primary" href={`/${data.lang}/faq`}>
                    {faqLabel}
                </a>
                {#if data.lang === 'en'}
                    <a class="link-item link-item--primary" href="/en/learn">
                        Learning and troubleshooting guides
                    </a>
                {/if}
                <a class="link-item link-item--primary" href={`/${data.lang}`}>
                    {homeLabel}
                </a>
                {#each featuredDownloads as item}
                    <a class="link-item" href={`/${data.lang}/download/${item.slug}`}>
                        {item.platform} {downloadPageSuffix}
                    </a>
                {/each}
            </div>
        </section>
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
        max-width: 1040px;
    }

    .container {
        width: 100%;
        max-width: 1040px;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) / 1.1);
    }

    .hero {
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

    .hero h1 {
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

    .grid {
        display: grid;
        gap: calc(var(--padding) / 1.15);
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }

    .card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 16px;
        background: var(--button);
        border-radius: calc(var(--border-radius) * 1.25);
        padding: calc(var(--padding) / 1.1);
        border: 1px solid var(--button-stroke);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);
    }

    .card-body h2 {
        margin: 0 0 8px;
        font-size: 18px;
        color: var(--secondary);
    }

    .card-body p {
        margin: 0;
        color: var(--secondary);
        opacity: 0.85;
        line-height: 1.6;
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .link-hub h2 {
        margin: 0 0 10px;
        font-size: 18px;
        color: var(--secondary);
    }

    .link-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
    }

    .link-item {
        display: flex;
        align-items: center;
        min-height: 40px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        text-decoration: none;
        line-height: 1.4;
    }

    .link-item:hover {
        background: var(--button-hover);
    }

    .link-item--primary {
        border-color: rgba(var(--accent-rgb), 0.3);
        background: rgba(var(--accent-rgb), 0.1);
        font-weight: 600;
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

    .btn.ghost:hover {
        background: var(--button-hover);
    }

    @media screen and (max-width: 800px) {
        .hero {
            padding: 18px;
        }
    }
</style>
