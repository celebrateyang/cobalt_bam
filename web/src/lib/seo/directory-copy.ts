import type { SupportedLanguage } from './language-routing';

type DirectoryCopy = {
    title: string;
    description: string;
    home: string;
    guides: string;
    open: string;
    guide: string;
    faq: string;
};

export const directoryCopy: Record<SupportedLanguage, DirectoryCopy> = {
    en: {
        title: 'Video downloaders by platform',
        description: 'Choose a downloader for a YouTube video, Shorts, a public playlist, or another supported platform. Each page explains accepted links and available video or audio options.',
        home: 'Home downloader', guides: 'Download guides', open: 'Open downloader', guide: 'Read guide', faq: 'Frequently asked questions',
    },
    zh: {
        title: '按平台和任务选择视频下载器',
        description: '根据 YouTube 单个视频、Shorts、公开播放列表或其他平台链接选择下载器。各下载页说明支持的链接类型、操作步骤及可用的视频或音频选项。',
        home: '首页下载器', guides: '下载指南', open: '打开下载器', guide: '阅读指南', faq: '常见问题',
    },
    de: {
        title: 'Video-Downloader nach Plattform',
        description: 'Wählen Sie einen Downloader für YouTube-Videos, Shorts, öffentliche Playlists oder andere unterstützte Plattformen. Jede Seite erklärt die passenden Links und verfügbaren Video- oder Audiooptionen.',
        home: 'Zum Downloader', guides: 'Download-Anleitungen', open: 'Downloader öffnen', guide: 'Anleitung lesen', faq: 'Häufige Fragen',
    },
    es: {
        title: 'Descargadores de videos por plataforma',
        description: 'Elige un descargador para videos de YouTube, Shorts, listas públicas u otras plataformas compatibles. Cada página explica los enlaces admitidos y las opciones de video o audio disponibles.',
        home: 'Descargador principal', guides: 'Guías de descarga', open: 'Abrir descargador', guide: 'Leer guía', faq: 'Preguntas frecuentes',
    },
    fr: {
        title: 'Téléchargeurs de vidéos par plateforme',
        description: 'Choisissez un outil pour les vidéos YouTube, les Shorts, les playlists publiques ou une autre plateforme prise en charge. Chaque page présente les liens acceptés et les options vidéo ou audio disponibles.',
        home: 'Outil principal', guides: 'Guides de téléchargement', open: 'Ouvrir le téléchargeur', guide: 'Lire le guide', faq: 'Questions fréquentes',
    },
    ja: {
        title: 'プラットフォーム別動画ダウンローダー',
        description: 'YouTube動画、Shorts、公開プレイリストなど、リンクの種類に合うダウンローダーを選べます。各ページで対応リンクと利用可能な動画・音声の選択肢を確認できます。',
        home: 'ホームのダウンローダー', guides: 'ダウンロードガイド', open: 'ダウンローダーを開く', guide: 'ガイドを読む', faq: 'よくある質問',
    },
    ko: {
        title: '플랫폼별 동영상 다운로더',
        description: 'YouTube 동영상, Shorts, 공개 재생목록 또는 다른 지원 플랫폼에 맞는 다운로더를 선택하세요. 각 페이지에서 지원 링크와 사용 가능한 동영상 및 오디오 옵션을 확인할 수 있습니다.',
        home: '홈 다운로더', guides: '다운로드 가이드', open: '다운로더 열기', guide: '가이드 읽기', faq: '자주 묻는 질문',
    },
    ru: {
        title: 'Загрузчики видео по платформам',
        description: 'Выберите загрузчик для видео YouTube, Shorts, общедоступного плейлиста или другой поддерживаемой платформы. На каждой странице указаны подходящие ссылки и доступные варианты видео и аудио.',
        home: 'Основной загрузчик', guides: 'Инструкции по скачиванию', open: 'Открыть загрузчик', guide: 'Читать инструкцию', faq: 'Частые вопросы',
    },
    th: {
        title: 'ตัวดาวน์โหลดวิดีโอตามแพลตฟอร์ม',
        description: 'เลือกตัวดาวน์โหลดสำหรับวิดีโอ YouTube, Shorts, เพลย์ลิสต์สาธารณะ หรือแพลตฟอร์มอื่นที่รองรับ แต่ละหน้าอธิบายลิงก์ที่ใช้ได้และตัวเลือกวิดีโอหรือเสียงที่มีให้',
        home: 'ตัวดาวน์โหลดหน้าหลัก', guides: 'คู่มือดาวน์โหลด', open: 'เปิดตัวดาวน์โหลด', guide: 'อ่านคู่มือ', faq: 'คำถามที่พบบ่อย',
    },
    vi: {
        title: 'Trình tải video theo nền tảng',
        description: 'Chọn công cụ cho video YouTube, Shorts, danh sách phát công khai hoặc nền tảng được hỗ trợ khác. Mỗi trang giải thích các liên kết phù hợp và tùy chọn video hoặc âm thanh có sẵn.',
        home: 'Trình tải chính', guides: 'Hướng dẫn tải xuống', open: 'Mở trình tải', guide: 'Đọc hướng dẫn', faq: 'Câu hỏi thường gặp',
    },
    id: {
        title: 'Pengunduh video menurut platform',
        description: 'Pilih pengunduh untuk video YouTube, Shorts, playlist publik, atau platform lain yang didukung. Setiap halaman menjelaskan tautan yang diterima serta pilihan video atau audio yang tersedia.',
        home: 'Pengunduh utama', guides: 'Panduan unduhan', open: 'Buka pengunduh', guide: 'Baca panduan', faq: 'Pertanyaan umum',
    },
};

export const getDirectoryCopy = (lang: string): DirectoryCopy =>
    directoryCopy[lang as SupportedLanguage] ?? directoryCopy.en;
