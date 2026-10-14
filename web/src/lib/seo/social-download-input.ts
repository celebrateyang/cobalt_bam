import type { SocialPlatform } from './social-download-content';

/** One source post, not a feed, board, arbitrary CDN URL, or pasted batch. */
export function parseSocialDownloadInput(platform: SocialPlatform, input: string): string | null {
    const matches = input.trim().match(/https?:\/\/[^\s<>"']+/gi) ?? [];
    if (matches.length !== 1) return null;
    try {
        const url = new URL(matches[0]);
        if (url.username || url.password || url.port) return null;
        const host = url.hostname.toLowerCase();
        const path = url.pathname;
        if (platform === 'reddit') {
            const isPostHost = ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com', 'm.reddit.com'].includes(host);
            const isPost = /^(?:\/r\/[^/]+|\/user\/[^/]+)?\/comments\/[a-z0-9]+(?:\/|$)/i.test(path);
            const isShare = /^\/r\/[^/]+\/s\/[a-z0-9]+\/?$/i.test(path);
            const isShort = host === 'redd.it' && /^\/[a-z0-9]+\/?$/i.test(path);
            if (!(isShort || (isPostHost && (isPost || isShare)))) return null;
        } else {
            const pinterestHost = host.replace(/^(?:www|m)\./, '');
            const isPin = ['pinterest.com', 'pinterest.ca', 'pinterest.co.uk', 'pinterest.de', 'pinterest.fr', 'pinterest.es', 'pinterest.it', 'pinterest.jp', 'pinterest.co.kr', 'pinterest.com.au', 'pinterest.com.br', 'pinterest.com.mx'].includes(pinterestHost)
                && /^\/pin\/(?:[a-z0-9-]+--)?[0-9]+\/?$/i.test(path);
            const isShort = host === 'pin.it' && /^\/[a-z0-9]+\/?$/i.test(path);
            if (!(isPin || isShort)) return null;
        }
        url.protocol = 'https:';
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

type FormCopy = {
    label: string; action: string; busy: string; queued: string; invalid: string; error: string;
};
const copy: Record<string, [string, string, string, string, string, string]> = {
    en: ['Post or Pin link', 'Download', 'Preparing download…', 'Download task started. Check the queue for processing and saving progress.', 'Paste one public source post link. Feeds, boards, profiles and direct media resources are not accepted here.', 'The download could not be started. Check the original post and try again.'],
    zh: ['帖子或 Pin 链接', '下载', '正在准备下载…', '下载任务已开始，请在队列中查看处理与保存进度。', '请粘贴一个公开原帖链接。本页不接收列表、画板、主页或媒体资源直链。', '未能开始下载，请检查原帖后重试。'],
    de: ['Beitrags- oder Pin-Link', 'Herunterladen', 'Download wird vorbereitet…', 'Auftrag gestartet. Verarbeitung und Speichern siehst du in der Warteschlange.', 'Füge einen öffentlichen Beitragslink ein. Feeds, Pinnwände, Profile und direkte Medienadressen werden hier nicht angenommen.', 'Der Download konnte nicht gestartet werden. Prüfe den Originalbeitrag und versuche es erneut.'],
    es: ['Enlace de publicación o Pin', 'Descargar', 'Preparando descarga…', 'Tarea iniciada. Consulta el procesamiento y guardado en la cola.', 'Pega un enlace público individual. No se aceptan listas, tableros, perfiles ni recursos multimedia directos.', 'No se pudo iniciar la descarga. Comprueba la publicación y vuelve a intentarlo.'],
    fr: ['Lien de publication ou d’épingle', 'Télécharger', 'Préparation du téléchargement…', 'Tâche démarrée. Consultez la progression du traitement et de l’enregistrement dans la file.', 'Collez un lien public unique. Les flux, tableaux, profils et ressources multimédias directes ne sont pas acceptés ici.', 'Le téléchargement n’a pas pu démarrer. Vérifiez la publication originale et réessayez.'],
    ja: ['投稿またはピンのリンク', 'ダウンロード', 'ダウンロードを準備中…', 'タスクを開始しました。処理と保存の進行状況はキューで確認してください。', '公開投稿のリンクを1つ貼り付けてください。一覧、ボード、プロフィール、メディアの直接リンクは対象外です。', 'ダウンロードを開始できませんでした。元の投稿を確認して再試行してください。'],
    ko: ['게시물 또는 핀 링크', '다운로드', '다운로드 준비 중…', '작업을 시작했습니다. 대기열에서 처리 및 저장 진행 상황을 확인하세요.', '공개 원본 게시물 링크 하나를 붙여넣으세요. 목록, 보드, 프로필, 미디어 직접 주소는 지원하지 않습니다.', '다운로드를 시작할 수 없습니다. 원본 게시물을 확인하고 다시 시도하세요.'],
    ru: ['Ссылка на пост или пин', 'Скачать', 'Подготовка загрузки…', 'Задача запущена. Обработка и сохранение отображаются в очереди.', 'Вставьте одну ссылку на публичный пост. Ленты, доски, профили и прямые медиаресурсы здесь не принимаются.', 'Не удалось начать загрузку. Проверьте исходный пост и повторите попытку.'],
    th: ['ลิงก์โพสต์หรือพิน', 'ดาวน์โหลด', 'กำลังเตรียมดาวน์โหลด…', 'เริ่มงานแล้ว ดูความคืบหน้าการประมวลผลและบันทึกในคิว', 'วางลิงก์โพสต์สาธารณะหนึ่งรายการ ไม่รองรับหน้ารวม บอร์ด โปรไฟล์ หรือลิงก์สื่อโดยตรง', 'เริ่มดาวน์โหลดไม่ได้ โปรดตรวจสอบโพสต์ต้นฉบับแล้วลองอีกครั้ง'],
    vi: ['Liên kết bài đăng hoặc Pin', 'Tải xuống', 'Đang chuẩn bị tải…', 'Đã bắt đầu tác vụ. Xem tiến độ xử lý và lưu trong hàng đợi.', 'Dán một liên kết bài đăng công khai. Không nhận danh sách, bảng, hồ sơ hoặc tài nguyên media trực tiếp.', 'Không thể bắt đầu tải. Kiểm tra bài đăng gốc và thử lại.'],
    id: ['Tautan postingan atau Pin', 'Unduh', 'Menyiapkan unduhan…', 'Tugas dimulai. Lihat progres pemrosesan dan penyimpanan di antrean.', 'Tempel satu tautan postingan publik. Feed, papan, profil, dan sumber media langsung tidak diterima di sini.', 'Unduhan tidak dapat dimulai. Periksa postingan asli dan coba lagi.'],
};

const sourceLabels: Record<string, [string, string]> = {
    en: ['Reddit post link', 'Pinterest Pin link'],
    zh: ['Reddit 帖子链接', 'Pinterest Pin 链接'],
    de: ['Reddit-Beitragslink', 'Pinterest-Pin-Link'],
    es: ['Enlace de publicación de Reddit', 'Enlace del Pin de Pinterest'],
    fr: ['Lien de publication Reddit', 'Lien d’épingle Pinterest'],
    ja: ['Reddit投稿リンク', 'Pinterestピンのリンク'],
    ko: ['Reddit 게시물 링크', 'Pinterest 핀 링크'],
    ru: ['Ссылка на пост Reddit', 'Ссылка на пин Pinterest'],
    th: ['ลิงก์โพสต์ Reddit', 'ลิงก์พิน Pinterest'],
    vi: ['Liên kết bài đăng Reddit', 'Liên kết Pin Pinterest'],
    id: ['Tautan postingan Reddit', 'Tautan Pin Pinterest'],
};

export function getSocialFormCopy(lang: string, platform: SocialPlatform): FormCopy {
    const [label, action, busy, queued, invalid, error] = copy[lang] ?? copy.en;
    return { label: (sourceLabels[lang] ?? sourceLabels.en)[platform === 'reddit' ? 0 : 1] || label, action, busy, queued, invalid, error };
}
