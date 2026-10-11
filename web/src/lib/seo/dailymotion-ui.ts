type DailymotionUi = {
    videoAudio: string;
    featuresLabel: string;
    urlLabel: string;
    continueLabel: string;
    exampleEyebrow: string;
    exampleTitle: string;
    formatsTitle: string;
    browserLabel: string;
};

export const dailymotionUiLocales: Record<string, DailymotionUi> = {
    en: {
        videoAudio: 'Video + audio', featuresLabel: 'Supported features',
        urlLabel: 'Dailymotion video URL', continueLabel: 'Continue to download',
        exampleEyebrow: 'Supported link formats', exampleTitle: 'Supported video links',
        formatsTitle: 'Supported video URL formats', browserLabel: 'Web browser',
    },
    fr: {
        videoAudio: 'Vidéo + audio', featuresLabel: 'Fonctionnalités disponibles',
        urlLabel: 'Lien de la vidéo Dailymotion', continueLabel: 'Continuer le téléchargement',
        exampleEyebrow: 'Formats de liens acceptés', exampleTitle: 'Liens vidéo compatibles',
        formatsTitle: 'Formats d’adresses vidéo acceptés', browserLabel: 'Navigateur web',
    },
    zh: {
        videoAudio: '视频 + 音频', featuresLabel: '支持功能',
        urlLabel: 'Dailymotion 视频链接', continueLabel: '继续下载',
        exampleEyebrow: '支持的链接格式', exampleTitle: '支持的视频链接',
        formatsTitle: '支持的视频地址格式', browserLabel: '浏览器',
    },
    de: {
        videoAudio: 'Video + Audio', featuresLabel: 'Unterstützte Funktionen',
        urlLabel: 'Dailymotion-Videolink', continueLabel: 'Zum Download',
        exampleEyebrow: 'Unterstützte Linkformate', exampleTitle: 'Unterstützte Videolinks',
        formatsTitle: 'Unterstützte Video-URL-Formate', browserLabel: 'Webbrowser',
    },
    es: {
        videoAudio: 'Vídeo + audio', featuresLabel: 'Funciones disponibles',
        urlLabel: 'Enlace del vídeo de Dailymotion', continueLabel: 'Continuar con la descarga',
        exampleEyebrow: 'Formatos de enlace compatibles', exampleTitle: 'Enlaces de vídeo compatibles',
        formatsTitle: 'Formatos de URL de vídeo compatibles', browserLabel: 'Navegador web',
    },
    ja: {
        videoAudio: '映像 + 音声', featuresLabel: '対応機能',
        urlLabel: 'Dailymotion動画のURL', continueLabel: 'ダウンロードへ進む',
        exampleEyebrow: '対応するリンク形式', exampleTitle: '対応する動画リンク',
        formatsTitle: '対応する動画URL形式', browserLabel: 'Webブラウザ',
    },
    ko: {
        videoAudio: '영상 + 오디오', featuresLabel: '지원 기능',
        urlLabel: 'Dailymotion 동영상 링크', continueLabel: '다운로드 계속하기',
        exampleEyebrow: '지원되는 링크 형식', exampleTitle: '지원되는 동영상 링크',
        formatsTitle: '지원되는 동영상 URL 형식', browserLabel: '웹 브라우저',
    },
    ru: {
        videoAudio: 'Видео + аудио', featuresLabel: 'Поддерживаемые функции',
        urlLabel: 'Ссылка на видео Dailymotion', continueLabel: 'Перейти к скачиванию',
        exampleEyebrow: 'Поддерживаемые форматы ссылок', exampleTitle: 'Поддерживаемые ссылки на видео',
        formatsTitle: 'Поддерживаемые форматы адресов видео', browserLabel: 'Веб-браузер',
    },
    th: {
        videoAudio: 'วิดีโอ + เสียง', featuresLabel: 'คุณสมบัติที่รองรับ',
        urlLabel: 'ลิงก์วิดีโอ Dailymotion', continueLabel: 'ดำเนินการดาวน์โหลดต่อ',
        exampleEyebrow: 'รูปแบบลิงก์ที่รองรับ', exampleTitle: 'ลิงก์วิดีโอที่รองรับ',
        formatsTitle: 'รูปแบบที่อยู่วิดีโอที่รองรับ', browserLabel: 'เว็บเบราว์เซอร์',
    },
    vi: {
        videoAudio: 'Video + âm thanh', featuresLabel: 'Tính năng được hỗ trợ',
        urlLabel: 'Liên kết video Dailymotion', continueLabel: 'Tiếp tục tải xuống',
        exampleEyebrow: 'Định dạng liên kết được hỗ trợ', exampleTitle: 'Liên kết video được hỗ trợ',
        formatsTitle: 'Định dạng URL video được hỗ trợ', browserLabel: 'Trình duyệt web',
    },
    id: {
        videoAudio: 'Video + audio', featuresLabel: 'Fitur yang didukung',
        urlLabel: 'Tautan video Dailymotion', continueLabel: 'Lanjutkan unduhan',
        exampleEyebrow: 'Format tautan yang didukung', exampleTitle: 'Tautan video yang didukung',
        formatsTitle: 'Format URL video yang didukung', browserLabel: 'Peramban web',
    },
};

export const getDailymotionUi = (lang: string): DailymotionUi =>
    dailymotionUiLocales[lang] ?? dailymotionUiLocales.en;
