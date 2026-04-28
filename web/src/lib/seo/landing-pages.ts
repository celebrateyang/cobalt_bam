export type SeoLandingFaqItem = {
    q: string;
    a: string;
};

export type SeoLandingLocaleContent = {
    metaTitle: string;
    metaDescription: string;
    metaKeywords: string[];
    h1: string;
    lede: string;
    stepsTitle: string;
    steps: string[];
    featuresTitle: string;
    features: string[];
    faqTitle: string;
    faqs: SeoLandingFaqItem[];
    disclaimer: string;
};

export type SeoLandingPage = {
    slug: string;
    locales: Record<string, SeoLandingLocaleContent>;
};

export const EN_BRAND = 'FreeSaveVideo';
export const ZH_BRAND = 'FreeSaveVideo';

const fallbackFaqs: Record<string, SeoLandingFaqItem[]> = {
    en: [
        {
            q: 'Do I need to install an app?',
            a: 'No. It works directly in your browser.',
        },
        {
            q: 'Can I download private content?',
            a: 'No. Only publicly accessible content can be downloaded.',
        },
        {
            q: 'Why is the download slow?',
            a: 'Network conditions and source limits can affect speed. Try again later or switch networks.',
        },
        {
            q: 'Is audio-only supported?',
            a: 'If the source provides audio-only options, they will appear in the results.',
        },
        {
            q: 'Is there a batch limit?',
            a: 'Batch limits may apply depending on the server settings.',
        },
    ],
    zh: [
        {
            q: '需要安装 App 吗？',
            a: '不需要，直接在浏览器内解析与下载。',
        },
        {
            q: '私密内容可以下载吗？',
            a: '不可以，仅支持公开可访问内容。',
        },
        {
            q: '下载速度慢怎么办？',
            a: '可能是网络或源站限制导致，可换网络或稍后再试。',
        },
        {
            q: '支持仅音频下载吗？',
            a: '如源站提供音频资源，解析结果中会显示音频选项。',
        },
        {
            q: '有批量下载限制吗？',
            a: '批量限制以页面提示/服务器配置为准。',
        },
    ],
    es: [
        {
            q: '¿Necesito instalar una app?',
            a: 'No. Funciona directamente en el navegador.',
        },
        {
            q: '¿Puedo descargar contenido privado?',
            a: 'No. Solo se puede descargar contenido público.',
        },
        {
            q: '¿Por qué va lento?',
            a: 'La red o el origen pueden limitar la velocidad. Prueba más tarde o cambia de red.',
        },
        {
            q: '¿Hay opción solo audio?',
            a: 'Si el origen la ofrece, aparecerá en los resultados.',
        },
        {
            q: '¿Hay límite de descarga?',
            a: 'Puede haber límites según la configuración del servidor.',
        },
    ],
    fr: [
        {
            q: 'Dois-je installer une appli ?',
            a: 'Non. Cela fonctionne directement dans le navigateur.',
        },
        {
            q: 'Puis-je télécharger du contenu privé ?',
            a: 'Non. Seul le contenu public est pris en charge.',
        },
        {
            q: 'Pourquoi c’est lent ?',
            a: 'Le réseau ou la source peut limiter la vitesse. Réessayez plus tard.',
        },
        {
            q: 'Audio seul disponible ?',
            a: 'Si la source le propose, l’option apparaît.',
        },
        {
            q: 'Y a-t-il une limite ?',
            a: 'Des limites peuvent s’appliquer selon le serveur.',
        },
    ],
    de: [
        {
            q: 'Muss ich eine App installieren?',
            a: 'Nein. Es funktioniert direkt im Browser.',
        },
        {
            q: 'Kann ich private Inhalte herunterladen?',
            a: 'Nein. Nur öffentliche Inhalte werden unterstützt.',
        },
        {
            q: 'Warum ist es langsam?',
            a: 'Netzwerk oder Quelle können die Geschwindigkeit begrenzen. Versuche es später erneut.',
        },
        {
            q: 'Gibt es nur Audio?',
            a: 'Wenn die Quelle Audio anbietet, erscheint die Option.',
        },
        {
            q: 'Gibt es ein Limit?',
            a: 'Je nach Servereinstellungen kann es Limits geben.',
        },
    ],
    ja: [
        {
            q: 'アプリのインストールは必要？',
            a: '不要です。ブラウザで利用できます。',
        },
        {
            q: '非公開コンテンツはダウンロードできますか？',
            a: 'いいえ。公開コンテンツのみ対応です。',
        },
        {
            q: '遅い場合は？',
            a: '回線や提供元の制限が原因のことがあります。時間をおいてください。',
        },
        {
            q: '音声のみは対応？',
            a: '提供元に音声があれば、選択肢に表示されます。',
        },
        {
            q: '制限はありますか？',
            a: 'サーバー設定により制限がある場合があります。',
        },
    ],
    ko: [
        {
            q: '앱 설치가 필요한가요?',
            a: '아니요. 브라우저에서 바로 사용할 수 있습니다.',
        },
        {
            q: '비공개 콘텐츠도 가능한가요?',
            a: '아니요. 공개된 콘텐츠만 지원합니다.',
        },
        {
            q: '속도가 느린 이유는?',
            a: '네트워크 또는 원본 제한일 수 있습니다. 나중에 다시 시도하세요.',
        },
        {
            q: '오디오 전용도 지원하나요?',
            a: '원본에 오디오가 있으면 옵션으로 표시됩니다.',
        },
        {
            q: '다운로드 제한이 있나요?',
            a: '서버 설정에 따라 제한이 있을 수 있습니다.',
        },
    ],
    ru: [
        {
            q: 'Нужно ли устанавливать приложение?',
            a: 'Нет. Работает прямо в браузере.',
        },
        {
            q: 'Можно скачать приватный контент?',
            a: 'Нет. Поддерживается только публичный контент.',
        },
        {
            q: 'Почему загрузка медленная?',
            a: 'Сеть или источник могут ограничивать скорость. Попробуйте позже.',
        },
        {
            q: 'Есть только аудио?',
            a: 'Если источник предоставляет аудио, опция появится.',
        },
        {
            q: 'Есть ли лимиты?',
            a: 'Возможны ограничения в зависимости от настроек сервера.',
        },
    ],
    th: [
        {
            q: 'ต้องติดตั้งแอปไหม?',
            a: 'ไม่ต้อง ใช้ผ่านเบราว์เซอร์ได้เลย',
        },
        {
            q: 'ดาวน์โหลดเนื้อหาส่วนตัวได้ไหม?',
            a: 'ไม่ได้ รองรับเฉพาะเนื้อหาสาธารณะ',
        },
        {
            q: 'ทำไมถึงช้า?',
            a: 'อาจมีข้อจำกัดจากเครือข่ายหรือแหล่งที่มา ลองใหม่ภายหลัง',
        },
        {
            q: 'มีโหมดเฉพาะเสียงไหม?',
            a: 'ถ้าแหล่งที่มามีเสียง จะมีตัวเลือกให้',
        },
        {
            q: 'มีข้อจำกัดการดาวน์โหลดไหม?',
            a: 'อาจมีข้อจำกัดตามการตั้งค่าเซิร์ฟเวอร์',
        },
    ],
    vi: [
        {
            q: 'Có cần cài ứng dụng không?',
            a: 'Không. Dùng trực tiếp trên trình duyệt.',
        },
        {
            q: 'Có tải được nội dung riêng tư không?',
            a: 'Không. Chỉ hỗ trợ nội dung công khai.',
        },
        {
            q: 'Vì sao tải chậm?',
            a: 'Mạng hoặc nguồn có thể giới hạn tốc độ. Hãy thử lại sau.',
        },
        {
            q: 'Có chế độ chỉ âm thanh không?',
            a: 'Nếu nguồn có âm thanh, tùy chọn sẽ xuất hiện.',
        },
        {
            q: 'Có giới hạn tải xuống không?',
            a: 'Có thể có giới hạn tùy cấu hình máy chủ.',
        },
    ],
};

const ensureFaqs = (faqs: SeoLandingFaqItem[], lang: string): SeoLandingFaqItem[] => {
    if (faqs.length >= 5) return faqs;
    const pool = fallbackFaqs[lang] ?? fallbackFaqs.en;
    const next = [...faqs];
    for (const item of pool) {
        if (next.length >= 5) break;
        if (!next.some((faq) => faq.q === item.q)) {
            next.push(item);
        }
    }
    return next;
};

const withFaqs = (
    page: Omit<SeoLandingLocaleContent, 'disclaimer'>,
    lang: string,
): Omit<SeoLandingLocaleContent, 'disclaimer'> => ({
    ...page,
    faqs: ensureFaqs(page.faqs, lang),
});

const en = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'en'),
    disclaimer:
        'Only download publicly accessible content. Respect copyrights and give credit to creators.',
});

const zh = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'zh'),
    disclaimer:
        '仅支持下载公开可访问内容；请尊重版权与平台规则，二次创作请注明来源并获得授权。',
});

const es = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'es'),
    disclaimer:
        'Descarga solo contenido público. Respeta los derechos de autor y da crédito a los creadores.',
});

const fr = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'fr'),
    disclaimer:
        'Ne télécharge que du contenu public. Respecte les droits d’auteur et crédite les créateurs.',
});

const de = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'de'),
    disclaimer:
        'Lade nur öffentlich zugängliche Inhalte herunter. Respektiere Urheberrechte und nenne die Quelle.',
});

const ja = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'ja'),
    disclaimer:
        '公開されているコンテンツのみダウンロードしてください。著作権を尊重し、作成者をクレジットしてください。',
});

const ko = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'ko'),
    disclaimer:
        '공개된 콘텐츠만 다운로드하세요. 저작권을 존중하고 제작자에게 크레딧을 남기세요.',
});

const ru = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'ru'),
    disclaimer:
        'Скачивайте только общедоступный контент. Соблюдайте авторские права и указывайте автора.',
});

const th = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'th'),
    disclaimer:
        'ดาวน์โหลดเฉพาะเนื้อหาที่เป็นสาธารณะ เคารพลิขสิทธิ์และให้เครดิตผู้สร้าง',
});

const vi = (page: Omit<SeoLandingLocaleContent, 'disclaimer'>): SeoLandingLocaleContent => ({
    ...withFaqs(page, 'vi'),
    disclaimer:
        'Chỉ tải nội dung công khai. Tôn trọng bản quyền và ghi nguồn cho tác giả.',
});

type GenericLocaleLang = 'es' | 'fr' | 'de' | 'ja' | 'ko' | 'ru' | 'th' | 'vi';
type ContentLabelKey =
    | 'video'
    | 'video_gif'
    | 'video_image_gif'
    | 'reels_video_photo'
    | 'spotlight_story'
    | 'audio';

type GenericLocaleParams = {
    platform: string;
    kind: 'video' | 'audio';
    contentKey: ContentLabelKey;
    keywords: string[];
    publicOnly?: boolean;
};

type LocaleTemplate = {
    title: (platform: string, kind: GenericLocaleParams['kind']) => string;
    description: (platform: string, contentLabel: string) => string;
    h1: (platform: string, kind: GenericLocaleParams['kind']) => string;
    lede: (platform: string, contentLabel: string) => string;
    stepsTitle: (platform: string, kind: GenericLocaleParams['kind']) => string;
    step1: (platform: string) => string;
    step2: string;
    step3: (kind: GenericLocaleParams['kind']) => string;
    featuresTitle: string;
    featurePublicOnly: string;
    featureQualityVideo: string;
    featureQualityAudio: string;
    featureDevice: string;
    faqTitle: string;
    faqQ1: string;
    faqA1: string;
    faqQ2: string;
    faqA2: string;
};

const contentLabels: Record<GenericLocaleLang, Record<ContentLabelKey, string>> = {
    es: {
        video: 'videos',
        video_gif: 'videos o GIFs',
        video_image_gif: 'videos, imágenes o GIFs',
        reels_video_photo: 'reels, videos o fotos',
        spotlight_story: 'videos de Spotlight o Historias',
        audio: 'audio',
    },
    fr: {
        video: 'vidéos',
        video_gif: 'vidéos ou GIF',
        video_image_gif: 'vidéos, images ou GIF',
        reels_video_photo: 'reels, vidéos ou photos',
        spotlight_story: 'vidéos Spotlight ou Stories',
        audio: 'audio',
    },
    de: {
        video: 'Videos',
        video_gif: 'Videos oder GIFs',
        video_image_gif: 'Videos, Bilder oder GIFs',
        reels_video_photo: 'Reels, Videos oder Fotos',
        spotlight_story: 'Spotlight- oder Story-Videos',
        audio: 'Audio',
    },
    ja: {
        video: '動画',
        video_gif: '動画またはGIF',
        video_image_gif: '動画、画像、またはGIF',
        reels_video_photo: 'リール、動画、または写真',
        spotlight_story: 'Spotlightまたはストーリーの動画',
        audio: '音声',
    },
    ko: {
        video: '동영상',
        video_gif: '동영상 또는 GIF',
        video_image_gif: '동영상, 이미지 또는 GIF',
        reels_video_photo: '릴스, 동영상 또는 사진',
        spotlight_story: 'Spotlight 또는 스토리 동영상',
        audio: '오디오',
    },
    ru: {
        video: 'видео',
        video_gif: 'видео или GIF',
        video_image_gif: 'видео, изображения или GIF',
        reels_video_photo: 'Reels, видео или фото',
        spotlight_story: 'видео Spotlight или Stories',
        audio: 'аудио',
    },
    th: {
        video: 'วิดีโอ',
        video_gif: 'วิดีโอหรือ GIF',
        video_image_gif: 'วิดีโอ รูปภาพ หรือ GIF',
        reels_video_photo: 'รีล วิดีโอ หรือรูปภาพ',
        spotlight_story: 'วิดีโอ Spotlight หรือสตอรี่',
        audio: 'เสียง',
    },
    vi: {
        video: 'video',
        video_gif: 'video hoặc GIF',
        video_image_gif: 'video, ảnh hoặc GIF',
        reels_video_photo: 'reels, video hoặc ảnh',
        spotlight_story: 'video Spotlight hoặc Story',
        audio: 'âm thanh',
    },
};

const localeTemplates: Record<GenericLocaleLang, LocaleTemplate> = {
    es: {
        title: (platform, kind) =>
            kind === 'audio'
                ? `Descargador de audio de ${platform}`
                : `Descargador de videos de ${platform}`,
        description: (platform, contentLabel) =>
            `Descarga ${contentLabel} de ${platform}: copia el enlace → pégalo → guarda. Funciona en el navegador, sin app.`,
        h1: (platform, kind) =>
            kind === 'audio'
                ? `Descargador de audio de ${platform}`
                : `Descargador de videos de ${platform}`,
        lede: (platform, contentLabel) =>
            `Pega un enlace de ${platform} para descargar ${contentLabel}.`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `Cómo descargar audio de ${platform}`
                : `Cómo descargar videos de ${platform}`,
        step1: (platform) => `Abre ${platform} y copia el enlace para compartir.`,
        step2: 'Pega el enlace abajo y haz clic en descargar.',
        step3: (kind) =>
            kind === 'audio'
                ? 'Elige un audio disponible y guarda.'
                : 'Elige una calidad disponible y guarda.',
        featuresTitle: 'Destacados',
        featurePublicOnly: 'Solo contenido público.',
        featureQualityVideo: 'Opciones HD cuando estén disponibles.',
        featureQualityAudio: 'Opciones de calidad cuando estén disponibles.',
        featureDevice: 'Funciona en móvil y escritorio.',
        faqTitle: 'Preguntas frecuentes',
        faqQ1: '¿Puedo descargar contenido privado?',
        faqA1: 'No. Solo se puede descargar contenido público.',
        faqQ2: '¿Por qué falla a veces?',
        faqA2:
            'El contenido puede estar restringido o el enlace caducó. Prueba otro enlace o inténtalo más tarde.',
    },
    fr: {
        title: (platform, kind) =>
            kind === 'audio'
                ? `Téléchargeur audio ${platform}`
                : `Téléchargeur de vidéos ${platform}`,
        description: (platform, contentLabel) =>
            `Téléchargez ${contentLabel} depuis ${platform} : copiez le lien → collez → enregistrez. Fonctionne dans le navigateur, sans appli.`,
        h1: (platform, kind) =>
            kind === 'audio'
                ? `Téléchargeur audio ${platform}`
                : `Téléchargeur de vidéos ${platform}`,
        lede: (platform, contentLabel) =>
            `Collez un lien ${platform} pour télécharger ${contentLabel}.`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `Comment télécharger de l’audio ${platform}`
                : `Comment télécharger des vidéos ${platform}`,
        step1: (platform) => `Ouvrez ${platform} et copiez le lien de partage.`,
        step2: 'Collez le lien ci-dessous et cliquez sur Télécharger.',
        step3: (kind) =>
            kind === 'audio'
                ? 'Choisissez un audio disponible et enregistrez.'
                : 'Choisissez une qualité disponible et enregistrez.',
        featuresTitle: 'Points forts',
        featurePublicOnly: 'Contenu public uniquement.',
        featureQualityVideo: 'Options HD lorsqu’elles sont disponibles.',
        featureQualityAudio: 'Options de qualité lorsqu’elles sont disponibles.',
        featureDevice: 'Fonctionne sur mobile et ordinateur.',
        faqTitle: 'FAQ',
        faqQ1: 'Puis-je télécharger du contenu privé ?',
        faqA1: 'Non. Seul le contenu public peut être téléchargé.',
        faqQ2: 'Pourquoi ça échoue parfois ?',
        faqA2:
            'Le contenu peut être restreint ou le lien expiré. Essayez un autre lien ou réessayez plus tard.',
    },
    de: {
        title: (platform, kind) =>
            kind === 'audio'
                ? `Audio-Downloader für ${platform}`
                : `Video-Downloader für ${platform}`,
        description: (platform, contentLabel) =>
            `Lade ${contentLabel} von ${platform} herunter: Link kopieren → einfügen → speichern. Funktioniert im Browser, ohne App.`,
        h1: (platform, kind) =>
            kind === 'audio'
                ? `Audio-Downloader für ${platform}`
                : `Video-Downloader für ${platform}`,
        lede: (platform, contentLabel) =>
            `Füge einen ${platform}-Link ein, um ${contentLabel} herunterzuladen.`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `So lädst du ${platform}-Audio herunter`
                : `So lädst du ${platform}-Videos herunter`,
        step1: (platform) => `Öffne ${platform} und kopiere den Teilen-Link.`,
        step2: 'Füge den Link unten ein und klicke auf Download.',
        step3: (kind) =>
            kind === 'audio'
                ? 'Wähle eine verfügbare Audio-Option und speichere.'
                : 'Wähle eine verfügbare Qualität und speichere.',
        featuresTitle: 'Highlights',
        featurePublicOnly: 'Nur öffentliche Inhalte.',
        featureQualityVideo: 'HD-Optionen, wenn verfügbar.',
        featureQualityAudio: 'Qualitätsoptionen, wenn verfügbar.',
        featureDevice: 'Funktioniert auf Handy und Desktop.',
        faqTitle: 'FAQ',
        faqQ1: 'Kann ich private Inhalte herunterladen?',
        faqA1: 'Nein. Nur öffentlich zugängliche Inhalte können heruntergeladen werden.',
        faqQ2: 'Warum schlägt es manchmal fehl?',
        faqA2:
            'Der Inhalt kann eingeschränkt sein oder der Link ist abgelaufen. Probiere einen anderen Link oder später erneut.',
    },
    ja: {
        title: (platform, kind) =>
            kind === 'audio' ? `${platform}音声ダウンローダー` : `${platform}動画ダウンローダー`,
        description: (platform, contentLabel) =>
            `${platform}の${contentLabel}をダウンロード：リンクをコピー → 貼り付け → 保存。ブラウザで使え、アプリ不要。`,
        h1: (platform, kind) =>
            kind === 'audio' ? `${platform}音声ダウンローダー` : `${platform}動画ダウンローダー`,
        lede: (platform, contentLabel) =>
            `${platform}のリンクを貼り付けて${contentLabel}をダウンロード。`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `${platform}の音声をダウンロードする方法`
                : `${platform}の動画をダウンロードする方法`,
        step1: (platform) => `${platform}を開いて共有リンクをコピーします。`,
        step2: '下のボックスに貼り付けてダウンロードをクリックします。',
        step3: (kind) =>
            kind === 'audio'
                ? '利用可能な音声を選んで保存します。'
                : '利用可能な画質を選んで保存します。',
        featuresTitle: '特徴',
        featurePublicOnly: '公開コンテンツのみ対応。',
        featureQualityVideo: '可能な場合はHDに対応。',
        featureQualityAudio: '可能な場合は音質オプションに対応。',
        featureDevice: 'スマホとPCの両方で利用可能。',
        faqTitle: 'FAQ',
        faqQ1: '非公開コンテンツはダウンロードできますか？',
        faqA1: 'いいえ。公開されているコンテンツのみダウンロードできます。',
        faqQ2: '失敗することがあるのはなぜ？',
        faqA2:
            'コンテンツが制限されているか、リンクが期限切れの可能性があります。別のリンクを試すか、時間をおいてください。',
    },
    ko: {
        title: (platform, kind) =>
            kind === 'audio' ? `${platform} 오디오 다운로드` : `${platform} 동영상 다운로드`,
        description: (platform, contentLabel) =>
            `${platform}의 ${contentLabel} 다운로드: 링크 복사 → 붙여넣기 → 저장. 브라우저에서 사용, 앱 필요 없음.`,
        h1: (platform, kind) =>
            kind === 'audio' ? `${platform} 오디오 다운로드` : `${platform} 동영상 다운로드`,
        lede: (platform, contentLabel) =>
            `${platform} 링크를 붙여넣어 ${contentLabel}를 다운로드하세요.`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `${platform} 오디오 다운로드 방법`
                : `${platform} 동영상 다운로드 방법`,
        step1: (platform) => `${platform}에서 공유 링크를 복사합니다.`,
        step2: '아래에 링크를 붙여넣고 다운로드를 클릭합니다.',
        step3: (kind) =>
            kind === 'audio'
                ? '가능한 오디오 옵션을 선택하고 저장합니다.'
                : '가능한 화질을 선택하고 저장합니다.',
        featuresTitle: '특징',
        featurePublicOnly: '공개 콘텐츠만 지원.',
        featureQualityVideo: '가능한 경우 HD 옵션 제공.',
        featureQualityAudio: '가능한 경우 품질 옵션 제공.',
        featureDevice: '모바일과 데스크톱에서 사용 가능.',
        faqTitle: '자주 묻는 질문',
        faqQ1: '비공개 콘텐츠도 다운로드할 수 있나요?',
        faqA1: '아니요. 공개된 콘텐츠만 다운로드할 수 있습니다.',
        faqQ2: '가끔 실패하는 이유는?',
        faqA2:
            '콘텐츠가 제한되었거나 링크가 만료되었을 수 있습니다. 다른 링크를 시도하거나 나중에 다시 시도하세요.',
    },
    ru: {
        title: (platform, kind) =>
            kind === 'audio' ? `Загрузчик аудио ${platform}` : `Загрузчик видео ${platform}`,
        description: (platform, contentLabel) =>
            `Скачайте ${contentLabel} с ${platform}: скопируйте ссылку → вставьте → сохраните. Работает в браузере, без приложения.`,
        h1: (platform, kind) =>
            kind === 'audio' ? `Загрузчик аудио ${platform}` : `Загрузчик видео ${platform}`,
        lede: (platform, contentLabel) =>
            `Вставьте ссылку ${platform}, чтобы скачать ${contentLabel}.`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `Как скачать аудио с ${platform}`
                : `Как скачать видео с ${platform}`,
        step1: (platform) => `Откройте ${platform} и скопируйте ссылку на публикацию.`,
        step2: 'Вставьте ссылку ниже и нажмите Скачать.',
        step3: (kind) =>
            kind === 'audio'
                ? 'Выберите доступный вариант аудио и сохраните.'
                : 'Выберите доступное качество и сохраните.',
        featuresTitle: 'Преимущества',
        featurePublicOnly: 'Только публичный контент.',
        featureQualityVideo: 'HD-опции при наличии.',
        featureQualityAudio: 'Опции качества при наличии.',
        featureDevice: 'Работает на мобильных и ПК.',
        faqTitle: 'FAQ',
        faqQ1: 'Можно скачать приватный контент?',
        faqA1: 'Нет. Можно скачать только публичный контент.',
        faqQ2: 'Почему иногда не работает?',
        faqA2:
            'Контент может быть ограничен или ссылка устарела. Попробуйте другую ссылку или позже.',
    },
    th: {
        title: (platform, kind) =>
            kind === 'audio' ? `ดาวน์โหลดเสียง ${platform}` : `ดาวน์โหลดวิดีโอ ${platform}`,
        description: (platform, contentLabel) =>
            `ดาวน์โหลด${contentLabel}จาก ${platform}: คัดลอกลิงก์ → วาง → บันทึก ใช้งานในเบราว์เซอร์ ไม่ต้องติดตั้งแอป`,
        h1: (platform, kind) =>
            kind === 'audio' ? `ดาวน์โหลดเสียง ${platform}` : `ดาวน์โหลดวิดีโอ ${platform}`,
        lede: (platform, contentLabel) =>
            `วางลิงก์ ${platform} เพื่อดาวน์โหลด${contentLabel}`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `วิธีดาวน์โหลดเสียงจาก ${platform}`
                : `วิธีดาวน์โหลดวิดีโอจาก ${platform}`,
        step1: (platform) => `เปิด ${platform} แล้วคัดลอกลิงก์แชร์`,
        step2: 'วางลิงก์ด้านล่างแล้วคลิกดาวน์โหลด',
        step3: (kind) =>
            kind === 'audio'
                ? 'เลือกตัวเลือกเสียงที่มีแล้วบันทึก'
                : 'เลือกคุณภาพที่มีแล้วบันทึก',
        featuresTitle: 'จุดเด่น',
        featurePublicOnly: 'รองรับเฉพาะเนื้อหาสาธารณะ',
        featureQualityVideo: 'มีตัวเลือก HD เมื่อมีให้',
        featureQualityAudio: 'มีตัวเลือกคุณภาพเมื่อมีให้',
        featureDevice: 'ใช้ได้ทั้งมือถือและคอมพิวเตอร์',
        faqTitle: 'คำถามที่พบบ่อย',
        faqQ1: 'ดาวน์โหลดเนื้อหาส่วนตัวได้ไหม?',
        faqA1: 'ไม่ได้ รองรับเฉพาะเนื้อหาที่สาธารณะเท่านั้น',
        faqQ2: 'ทำไมบางครั้งถึงดาวน์โหลดไม่ได้?',
        faqA2:
            'เนื้อหาอาจถูกจำกัดหรือลิงก์หมดอายุ ลองลิงก์อื่นหรือใหม่อีกครั้งภายหลัง',
    },
    vi: {
        title: (platform, kind) =>
            kind === 'audio' ? `Trình tải âm thanh ${platform}` : `Trình tải video ${platform}`,
        description: (platform, contentLabel) =>
            `Tải ${contentLabel} từ ${platform}: sao chép liên kết → dán → lưu. Dùng ngay trên trình duyệt, không cần ứng dụng.`,
        h1: (platform, kind) =>
            kind === 'audio' ? `Trình tải âm thanh ${platform}` : `Trình tải video ${platform}`,
        lede: (platform, contentLabel) =>
            `Dán liên kết ${platform} để tải ${contentLabel}.`,
        stepsTitle: (platform, kind) =>
            kind === 'audio'
                ? `Cách tải âm thanh từ ${platform}`
                : `Cách tải video từ ${platform}`,
        step1: (platform) => `Mở ${platform} và sao chép liên kết chia sẻ.`,
        step2: 'Dán liên kết bên dưới và bấm tải xuống.',
        step3: (kind) =>
            kind === 'audio'
                ? 'Chọn tùy chọn âm thanh khả dụng và lưu.'
                : 'Chọn chất lượng khả dụng và lưu.',
        featuresTitle: 'Điểm nổi bật',
        featurePublicOnly: 'Chỉ hỗ trợ nội dung công khai.',
        featureQualityVideo: 'Có tùy chọn HD khi có sẵn.',
        featureQualityAudio: 'Có tùy chọn chất lượng khi có sẵn.',
        featureDevice: 'Hoạt động trên di động và máy tính.',
        faqTitle: 'Câu hỏi thường gặp',
        faqQ1: 'Có thể tải nội dung riêng tư không?',
        faqA1: 'Không. Chỉ có thể tải nội dung công khai.',
        faqQ2: 'Vì sao đôi khi thất bại?',
        faqA2:
            'Nội dung có thể bị hạn chế hoặc liên kết hết hạn. Hãy thử liên kết khác hoặc thử lại sau.',
    },
};

const genericLocaleWrappers: Record<
    GenericLocaleLang,
    (page: Omit<SeoLandingLocaleContent, 'disclaimer'>) => SeoLandingLocaleContent
> = {
    es,
    fr,
    de,
    ja,
    ko,
    ru,
    th,
    vi,
};

const wrapGenericLocale = (
    lang: GenericLocaleLang,
    page: Omit<SeoLandingLocaleContent, 'disclaimer'>,
): SeoLandingLocaleContent => genericLocaleWrappers[lang](page);

const buildGenericLocale = (
    lang: GenericLocaleLang,
    params: GenericLocaleParams,
): SeoLandingLocaleContent => {
    const template = localeTemplates[lang];
    const contentLabel = contentLabels[lang][params.contentKey];
    const publicOnly = params.publicOnly ?? true;

    return wrapGenericLocale(lang, {
        metaTitle: `${template.title(params.platform, params.kind)} - ${EN_BRAND}`,
        metaDescription: template.description(params.platform, contentLabel),
        metaKeywords: params.keywords,
        h1: template.h1(params.platform, params.kind),
        lede: template.lede(params.platform, contentLabel),
        stepsTitle: template.stepsTitle(params.platform, params.kind),
        steps: [
            template.step1(params.platform),
            template.step2,
            template.step3(params.kind),
        ],
        featuresTitle: template.featuresTitle,
        features: [
            publicOnly ? template.featurePublicOnly : template.featureDevice,
            params.kind === 'audio'
                ? template.featureQualityAudio
                : template.featureQualityVideo,
            template.featureDevice,
        ],
        faqTitle: template.faqTitle,
        faqs: [
            { q: template.faqQ1, a: template.faqA1 },
            { q: template.faqQ2, a: template.faqA2 },
        ],
    });
};

const buildGenericLocales = (params: GenericLocaleParams) => ({
    es: buildGenericLocale('es', params),
    fr: buildGenericLocale('fr', params),
    de: buildGenericLocale('de', params),
    ja: buildGenericLocale('ja', params),
    ko: buildGenericLocale('ko', params),
    ru: buildGenericLocale('ru', params),
    th: buildGenericLocale('th', params),
    vi: buildGenericLocale('vi', params),
});

export const seoLandingPages: SeoLandingPage[] = [
    {
        slug: 'tiktok-no-watermark',
        locales: {
            zh: zh({
                metaTitle: `下载TikTok视频 - 免费无水印在线下载器 | ${ZH_BRAND}`,
                metaDescription:
                    'FreeSaveVideo 支持在线下载 TikTok 视频，无需安装软件。粘贴链接即可保存高清无水印视频，支持批次下载、合集解析、音频提取与静音模式。',
                metaKeywords: [
                    '下载tiktok视频',
                    'tiktok无水印下载',
                    'tiktok视频下载',
                    'tiktok下载器',
                    'tiktok保存视频',
                    'tiktok去水印',
                ],
                h1: 'TikTok视频无水印下载',
                lede: '复制 TikTok 视频链接后即可在线解析下载，支持手机和电脑浏览器直接使用。',
                stepsTitle: '如何下载 TikTok 视频',
                steps: [
                    '在 TikTok 打开视频，点击“分享”并复制链接。',
                    '把链接粘贴到下方输入框，点击下载。',
                    '选择清晰度、原声/静音或音频模式后保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持下载 TikTok 无水印视频，高清选项以解析结果为准。',
                    '支持批次下载、合集解析与音频提取。',
                    '可切换自动、音频或静音模式，适合不同保存场景。',
                    '免安装，手机/电脑浏览器都能直接使用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '怎么下载 TikTok 视频到手机？',
                        a: '在 TikTok 视频页点击“分享”复制链接，回到本页粘贴后点击下载，即可将视频保存到手机相册或文件中。',
                    },
                    {
                        q: 'TikTok 视频下载后一定是无水印吗？',
                        a: '如果源站提供无水印资源，解析结果会优先显示无水印版本；个别内容可能受平台限制。',
                    },
                    {
                        q: '可以批量下载或下载合集吗？',
                        a: '支持一次粘贴多条 TikTok 链接进行批次解析；合集或 playlist 是否可整组下载，以页面解析结果为准。',
                    },
                    {
                        q: '为什么有些 TikTok 链接解析失败？',
                        a: '部分视频可能受地区、账号权限或平台风控限制。建议确认链接可在浏览器打开，再换网络或稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `TikTok No Watermark Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download TikTok videos without watermark: copy link → paste → save. Supports HD and batch link parsing. No app needed.',
                metaKeywords: [
                    'tiktok no watermark',
                    'tiktok downloader',
                    'tiktok video download',
                    'download tiktok without watermark',
                    'tiktok hd downloader',
                ],
                h1: 'TikTok No Watermark Downloader',
                lede: 'Copy link → paste → download. Works on mobile and desktop.',
                stepsTitle: 'How to download TikTok without watermark',
                steps: [
                    'Open a TikTok video and copy the share link.',
                    'Paste the link into the box below and click download.',
                    'Pick the quality option (if available) and save the file.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'No watermark, HD options when available.',
                    'Supports batch parsing multiple links.',
                    'Works in browser — no app install.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Is it safe to use?',
                        a: 'You can download in your browser without installing extra apps. Only save content you have rights to use.',
                    },
                    {
                        q: 'Why does it fail sometimes?',
                        a: 'Some videos are region/age/account restricted or temporarily blocked. Try again later or switch networks.',
                    },
                    {
                        q: 'Can I download multiple links?',
                        a: 'Yes, you can paste multiple links for batch parsing (limits may apply).',
                    },
                ],
            }),
        },
    },
    {
        slug: 'tiktok-collection-download',
        locales: {
            zh: zh({
                metaTitle: `TikTok合集下载 - 批量保存视频/Playlist | ${ZH_BRAND}`,
                metaDescription:
                    '在线下载 TikTok 合集、批次视频和 playlist 链接。粘贴一个或多个 TikTok 链接即可统一解析，支持高清视频、音频提取与免安装使用。',
                metaKeywords: [
                    'tiktok合集下载',
                    'tiktok批量下载',
                    'tiktok playlist 下载',
                    'tiktok批次下载',
                    'tiktok视频批量保存',
                ],
                h1: 'TikTok合集 / Playlist 下载',
                lede: '支持一次解析 TikTok 合集、playlist 或多条视频链接，适合批量保存视频素材。',
                stepsTitle: '如何下载 TikTok 合集或批量视频',
                steps: [
                    '复制 TikTok 合集、playlist 或多条视频分享链接。',
                    '将一个或多个链接粘贴到下方输入框，点击下载。',
                    '等待解析完成后，按需保存整组视频、音频或单条文件。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 TikTok 合集、playlist 和多链接批量解析。',
                    '可按解析结果保存高清视频、音频或静音版本。',
                    '免安装，手机和电脑浏览器均可使用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: 'TikTok 可以批量下载多个视频吗？',
                        a: '可以。你可以一次粘贴多条 TikTok 链接进行批量解析，具体数量限制以页面提示为准。',
                    },
                    {
                        q: 'TikTok playlist 或合集一定能整组下载吗？',
                        a: '是否能完整识别合集或 playlist，取决于链接结构和平台返回的数据。若支持，页面会直接展示整组下载结果。',
                    },
                    {
                        q: '批量下载时可以提取音频吗？',
                        a: '可以。如解析结果提供音频资源，你可以切换到音频模式后再保存。',
                    },
                    {
                        q: '为什么部分 TikTok 链接没有被识别出来？',
                        a: '可能是链接失效、内容权限受限，或平台暂时限制了解析。建议确认链接可在浏览器打开，再换网络或稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `TikTok Playlist Downloader (Batch Video Save) - ${EN_BRAND}`,
                metaDescription:
                    'Download TikTok playlists, collection links, or multiple videos at once. Paste one or more TikTok links to batch save videos online with no app install.',
                metaKeywords: [
                    'tiktok playlist downloader',
                    'tiktok batch download',
                    'download tiktok collection',
                    'save multiple tiktok videos',
                    'tiktok multi downloader',
                ],
                h1: 'TikTok Playlist and Batch Downloader',
                lede: 'Paste playlist, collection, or multiple TikTok links to save videos in one run.',
                stepsTitle: 'How to batch download TikTok videos',
                steps: [
                    'Copy a TikTok playlist, collection, or multiple share links.',
                    'Paste the links into the box below and start parsing.',
                    'Save the available video or audio files after parsing finishes.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Batch parsing for TikTok links and supported playlists.',
                    'Video, audio-only, and mute options when available.',
                    'Browser-based workflow with no app install.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download multiple TikTok videos at once?',
                        a: 'Yes. Paste multiple TikTok links and the page will parse them together as a batch.',
                    },
                    {
                        q: 'Will every TikTok playlist be detected automatically?',
                        a: 'Not always. Detection depends on the link type and the source response returned by TikTok.',
                    },
                    {
                        q: 'Can I extract audio from batch results?',
                        a: 'If audio resources are available, you can switch to audio mode before saving.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'TikTok',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'tiktok playlist downloader',
                    'tiktok batch download',
                    'download tiktok collection',
                    'save multiple tiktok videos',
                ],
            }),
        },
    },
    {
        slug: 'tiktok-mp3-download',
        locales: {
            zh: zh({
                metaTitle: `TikTok MP3 下载 - 在线提取视频音频 | ${ZH_BRAND}`,
                metaDescription:
                    '在线提取 TikTok 视频音频并保存为可用的 MP3/音频资源。粘贴 TikTok 链接即可解析下载，无需安装软件，支持手机和电脑浏览器。',
                metaKeywords: [
                    'tiktok mp3 下载',
                    'tiktok音频下载',
                    'tiktok音频提取',
                    'tiktok转mp3',
                    'tiktok音乐下载',
                ],
                h1: 'TikTok 音频 / MP3 下载',
                lede: '复制 TikTok 视频链接后即可在线提取音频，适合保存背景音乐、对白或素材配乐。',
                stepsTitle: '如何下载 TikTok 音频',
                steps: [
                    '在 TikTok 打开视频，点击“分享”复制链接。',
                    '把链接粘贴到下方输入框，点击下载。',
                    '在解析结果中选择音频或 MP3 选项并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持从 TikTok 视频中提取可用音频资源。',
                    '适合保存背景音乐、配音和短视频原声。',
                    '无需安装软件，手机和电脑浏览器均可使用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: 'TikTok 视频可以直接提取 MP3 吗？',
                        a: '如果解析结果中提供音频资源，你可以直接选择音频或 MP3 选项进行保存。',
                    },
                    {
                        q: '为什么有些 TikTok 视频没有音频下载选项？',
                        a: '部分视频的音频资源可能受版权、平台策略或链接类型限制，若未提供音频结果则无法单独提取。',
                    },
                    {
                        q: '手机上也能下载 TikTok 音频吗？',
                        a: '可以。网页支持手机浏览器访问，复制链接后粘贴到本页即可提取并保存音频。',
                    },
                    {
                        q: '下载的 TikTok 音频格式能选吗？',
                        a: '格式取决于解析结果和源资源。若有多个可选项，会在下载结果中显示。',
                    },
                ],
            }),
            en: en({
                metaTitle: `TikTok MP3 Downloader - Extract Audio Online | ${EN_BRAND}`,
                metaDescription:
                    'Extract TikTok audio online from public video links. Paste a TikTok URL to download available MP3 or audio options in your browser.',
                metaKeywords: [
                    'tiktok mp3 downloader',
                    'download tiktok audio',
                    'tiktok to mp3',
                    'extract tiktok sound',
                ],
                h1: 'TikTok MP3 and Audio Downloader',
                lede: 'Paste a TikTok video link to extract available audio in your browser.',
                stepsTitle: 'How to download TikTok audio',
                steps: [
                    'Copy the TikTok video share link.',
                    'Paste it into the box below and start parsing.',
                    'Choose the available audio option and save it.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Extract audio from public TikTok videos when available.',
                    'Good for saving music, voice clips, and source audio.',
                    'No app install required.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I convert TikTok videos to MP3 online?',
                        a: 'If the source returns audio resources, the page will show an available audio option you can save.',
                    },
                    {
                        q: 'Why do some TikTok videos have no audio option?',
                        a: 'Audio availability depends on the source response, copyright restrictions, and link type.',
                    },
                    {
                        q: 'Does it work on mobile?',
                        a: 'Yes. Paste a TikTok link in your mobile browser and save the available audio result.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'TikTok',
                kind: 'audio',
                contentKey: 'audio',
                keywords: [
                    'tiktok mp3 downloader',
                    'download tiktok audio',
                    'tiktok to mp3',
                    'extract tiktok sound',
                ],
            }),
        },
    },
    {
        slug: 'douyin-no-watermark',
        locales: {
            zh: zh({
                metaTitle: `抖音视频下载 - 免费无水印在线下载器 | ${ZH_BRAND}`,
                metaDescription:
                    '使用 FreeSaveVideo 在线下载抖音视频，支持无水印保存、批次下载、合集解析、音频提取与静音模式，无需安装 App。',
                metaKeywords: [
                    '抖音视频下载',
                    '抖音无水印下载',
                    '抖音保存视频',
                    '抖音去水印',
                    '抖音链接解析',
                    '抖音批量下载',
                ],
                h1: '抖音视频无水印下载',
                lede: '复制抖音分享链接即可在线下载视频，支持手机和电脑浏览器直接使用。',
                stepsTitle: '如何下载抖音视频',
                steps: [
                    '在抖音打开视频，点击“分享”复制链接。',
                    '把链接粘贴到下方输入框，点击下载。',
                    '保存到本地相册/文件，并按需选择画质、音频或静音模式。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持抖音无水印视频下载，高清选项以解析结果为准。',
                    '支持批次下载、合集解析与多链接统一处理。',
                    '支持音频提取和静音模式，适合保存不同素材。',
                    '免安装，打开网页即可使用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '怎么下载抖音视频到相册？',
                        a: '在抖音视频页点击“分享”复制链接，粘贴到本页输入框后点击下载，即可将视频保存到手机相册或文件中。',
                    },
                    {
                        q: '抖音视频下载后会有水印吗？',
                        a: '如果解析结果中提供无水印资源，页面会优先展示无水印下载选项；个别内容可能受平台限制。',
                    },
                    {
                        q: '可以批量下载或下载抖音合集吗？',
                        a: '支持一次粘贴多条抖音链接进行批次解析；合集和分组内容是否支持整组下载，以页面解析结果为准。',
                    },
                    {
                        q: '抖音链接解析失败怎么办？',
                        a: '请先确认链接能在浏览器中打开。若仍失败，可能是平台风控、网络环境或内容权限限制，建议换网络或稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Douyin No Watermark Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download Douyin videos without watermark: copy share link → paste → save. Supports HD options and batch parsing.',
                metaKeywords: [
                    'douyin no watermark',
                    'douyin downloader',
                    'download douyin video',
                    'remove douyin watermark',
                ],
                h1: 'Douyin No Watermark Downloader',
                lede: 'Copy share link → paste → download. No app required.',
                stepsTitle: 'How to download Douyin without watermark',
                steps: [
                    'Open a Douyin video and copy the share link.',
                    'Paste the link into the box below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'No watermark when available.',
                    'Batch parsing multiple links.',
                    'Works in browser — mobile and desktop.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why does it sometimes fail?',
                        a: 'Douyin may block automated access. Try again later or switch networks.',
                    },
                    {
                        q: 'Can I download photo posts?',
                        a: 'It depends on the content type and availability. Paste the link to see supported options.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Douyin',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'douyin no watermark',
                    'douyin downloader',
                    'download douyin video',
                    'remove douyin watermark',
                ],
            }),
        },
    },
    {
        slug: 'douyin-mp3-download',
        locales: {
            zh: zh({
                metaTitle: `抖音 MP3 下载 - 在线提取视频音频 | ${ZH_BRAND}`,
                metaDescription:
                    '在线提取抖音视频音频并保存为可用的 MP3/音频资源。粘贴抖音链接即可解析下载，无需安装 App，支持手机和电脑浏览器。',
                metaKeywords: [
                    '抖音mp3下载',
                    '抖音音频下载',
                    '抖音音频提取',
                    '抖音转mp3',
                    '抖音音乐下载',
                ],
                h1: '抖音音频 / MP3 下载',
                lede: '复制抖音视频链接后即可在线提取音频，适合保存背景音乐、对白或短视频原声。',
                stepsTitle: '如何下载抖音音频',
                steps: [
                    '在抖音打开视频，点击“分享”复制链接。',
                    '把链接粘贴到下方输入框，点击下载。',
                    '在解析结果中选择音频或 MP3 选项并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持从抖音视频中提取可用音频资源。',
                    '适合保存背景音乐、配音和短视频原声。',
                    '免安装，网页直接使用，手机和电脑均可访问。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '抖音视频可以直接提取 MP3 吗？',
                        a: '如果解析结果中提供音频资源，你可以直接选择音频或 MP3 选项保存到本地。',
                    },
                    {
                        q: '为什么有些抖音视频没有音频下载选项？',
                        a: '部分视频的音频资源可能受版权、平台策略或链接类型限制，若未提供音频结果则无法单独提取。',
                    },
                    {
                        q: '手机上也能下载抖音音频吗？',
                        a: '可以。网页支持手机浏览器访问，复制抖音链接后粘贴到本页即可提取并保存音频。',
                    },
                    {
                        q: '下载的抖音音频格式能选吗？',
                        a: '格式取决于解析结果和源资源。若有多个可选项，会在下载结果中显示。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Douyin MP3 Downloader - Extract Audio Online | ${EN_BRAND}`,
                metaDescription:
                    'Extract Douyin audio online from public video links. Paste a Douyin URL to download available MP3 or audio options in your browser.',
                metaKeywords: [
                    'douyin mp3 downloader',
                    'download douyin audio',
                    'douyin to mp3',
                    'extract douyin sound',
                ],
                h1: 'Douyin MP3 and Audio Downloader',
                lede: 'Paste a Douyin video link to extract available audio in your browser.',
                stepsTitle: 'How to download Douyin audio',
                steps: [
                    'Copy the Douyin video share link.',
                    'Paste it into the box below and start parsing.',
                    'Choose the available audio option and save it.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Extract audio from public Douyin videos when available.',
                    'Good for saving music, voice clips, and source audio.',
                    'No app install required.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I convert Douyin videos to MP3 online?',
                        a: 'If the source returns audio resources, the page will show an available audio option you can save.',
                    },
                    {
                        q: 'Why do some Douyin videos have no audio option?',
                        a: 'Audio availability depends on the source response, copyright restrictions, and link type.',
                    },
                    {
                        q: 'Does it work on mobile?',
                        a: 'Yes. Paste a Douyin link in your mobile browser and save the available audio result.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Douyin',
                kind: 'audio',
                contentKey: 'audio',
                keywords: [
                    'douyin mp3 downloader',
                    'download douyin audio',
                    'douyin to mp3',
                    'extract douyin sound',
                ],
            }),
        },
    },
    {
        slug: 'douyin-collection-download',
        locales: {
            zh: zh({
                metaTitle: `抖音合集下载 - 批量解析视频合集 | ${ZH_BRAND}`,
                metaDescription:
                    '在线下载抖音合集、批次视频和多条分享链接。粘贴一个或多个抖音链接即可统一解析，支持高清视频、音频提取和免安装使用。',
                metaKeywords: [
                    '抖音合集下载',
                    '抖音批量下载',
                    '抖音批次下载',
                    '抖音视频批量保存',
                    '抖音playlist下载',
                ],
                h1: '抖音合集 / 批次下载',
                lede: '支持解析抖音合集链接和多条视频链接，适合批量保存视频素材到手机或电脑。',
                stepsTitle: '如何下载抖音合集或批量视频',
                steps: [
                    '复制抖音合集、分组内容或多条视频分享链接。',
                    '将一个或多个链接粘贴到下方输入框，点击下载。',
                    '解析完成后按需保存整组视频、音频或单条文件。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持抖音合集、批次链接和多视频统一解析。',
                    '支持高清视频、音频提取与静音模式，具体以解析结果为准。',
                    '免安装，网页直接使用，手机和电脑浏览器均可访问。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '抖音可以批量下载多个视频吗？',
                        a: '可以。你可以一次粘贴多条抖音分享链接进行批量解析，具体数量限制以页面提示为准。',
                    },
                    {
                        q: '抖音合集一定能整组下载吗？',
                        a: '是否能完整识别合集内容，取决于分享链接结构和平台返回的数据。若支持，页面会直接展示整组下载结果。',
                    },
                    {
                        q: '批量下载时可以同时提取音频吗？',
                        a: '可以。如解析结果提供音频资源，你可以切换到音频模式后再统一保存。',
                    },
                    {
                        q: '为什么部分抖音链接没有被识别？',
                        a: '可能是链接失效、内容权限受限，或平台暂时限制了解析。建议确认链接可在浏览器打开，再换网络或稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Douyin Collection Downloader (Batch Video Save) - ${EN_BRAND}`,
                metaDescription:
                    'Download Douyin collection links or batch save multiple videos online. Paste one or more Douyin share links to parse them together in your browser.',
                metaKeywords: [
                    'douyin collection downloader',
                    'douyin batch download',
                    'download douyin playlist',
                    'save multiple douyin videos',
                ],
                h1: 'Douyin Collection and Batch Downloader',
                lede: 'Paste collection or multiple Douyin links to save videos in one run.',
                stepsTitle: 'How to batch download Douyin videos',
                steps: [
                    'Copy a Douyin collection link or multiple share links.',
                    'Paste the links into the box below and start parsing.',
                    'Save the available video or audio files after parsing finishes.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Batch parsing for Douyin links and supported collections.',
                    'Video, audio-only, and mute options when available.',
                    'No app install required.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download multiple Douyin videos at once?',
                        a: 'Yes. Paste multiple Douyin links and the page will parse them together as a batch.',
                    },
                    {
                        q: 'Will every Douyin collection be detected automatically?',
                        a: 'Not always. Detection depends on the shared link format and the source response returned by Douyin.',
                    },
                    {
                        q: 'Can I extract audio from batch results?',
                        a: 'If audio resources are available, you can switch to audio mode before saving.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Douyin',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'douyin collection downloader',
                    'douyin batch download',
                    'download douyin playlist',
                    'save multiple douyin videos',
                ],
            }),
        },
    },
    {
        slug: 'bilibili-video-download',
        locales: {
            zh: zh({
                metaTitle: `B站视频下载 - 在线保存哔哩哔哩视频 | ${ZH_BRAND}`,
                metaDescription:
                    '在线下载 B站视频，支持普通投稿、部分合集/分P解析与音频提取。复制哔哩哔哩链接后粘贴即可保存高清视频。',
                metaKeywords: [
                    'b站视频下载',
                    '哔哩哔哩视频下载',
                    'bilibili视频下载',
                    'b站下载器',
                    'b站保存视频',
                    'bilibili链接解析',
                ],
                h1: 'B站视频下载',
                lede: '复制 B站视频链接后即可在线解析下载，支持视频保存与音频提取。',
                stepsTitle: '如何下载 B站视频',
                steps: [
                    '在 Bilibili 打开视频，点击“分享”复制链接。',
                    '把链接粘贴到下方输入框，点击下载。',
                    '选择清晰度、分P结果或音频（如可用）并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 B站高清视频下载与音频提取，具体以解析结果为准。',
                    '部分视频支持分P、合集或课程条目识别。',
                    '免安装，网页直接使用，手机和电脑均可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '怎么下载 B站视频到本地？',
                        a: '在 B站视频页点击“分享”复制链接，粘贴到本页输入框后点击下载，即可保存视频或音频到本地。',
                    },
                    {
                        q: 'B站分P或合集视频可以下载吗？',
                        a: '部分分P、合集或课程内容可以识别并展示下载选项，具体以页面解析结果为准。',
                    },
                    {
                        q: '会员或付费视频可以下载吗？',
                        a: '不可以。仅支持公开可访问内容，付费、会员专享或权限受限的视频无法解析。',
                    },
                    {
                        q: 'B站视频解析失败怎么办？',
                        a: '请确认链接可在浏览器正常打开；如仍失败，可能是内容权限、地区限制或网络问题，建议稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Bilibili Video Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download Bilibili videos: copy link → paste → save. Supports HD and audio options when available.',
                metaKeywords: [
                    'bilibili video downloader',
                    'download bilibili video',
                    'bilibili video download',
                    'bilibili audio download',
                ],
                h1: 'Bilibili Video Downloader',
                lede: 'Paste a Bilibili link to download video or audio.',
                stepsTitle: 'How to download Bilibili videos',
                steps: [
                    'Open a Bilibili video and copy the share link.',
                    'Paste the link below and click download.',
                    'Choose an available quality or audio option and save.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'HD and audio options when available.',
                    'Browser-based, no app install.',
                    'Works on mobile and desktop.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download member-only videos?',
                        a: 'No. Only publicly accessible content can be downloaded.',
                    },
                    {
                        q: 'Why does it fail sometimes?',
                        a: 'The link may be restricted or expired. Try another link or retry later.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Bilibili',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'bilibili video downloader',
                    'download bilibili video',
                    'bilibili video download',
                    'bilibili audio download',
                ],
            }),
        },
    },
    {
        slug: 'kuaishou-no-watermark',
        locales: {
            zh: zh({
                metaTitle: `快手视频下载 - 免费无水印在线保存 | ${ZH_BRAND}`,
                metaDescription:
                    '在线下载快手视频，支持无水印保存、批量解析与手机浏览器直接使用。复制快手链接即可快速下载。',
                metaKeywords: [
                    '快手视频下载',
                    '快手无水印下载',
                    '快手保存视频',
                    '快手去水印',
                    '快手链接解析',
                    '快手批量下载',
                ],
                h1: '快手视频无水印下载',
                lede: '复制快手视频链接后即可在线解析下载，支持手机与电脑浏览器直接使用。',
                stepsTitle: '如何下载快手视频',
                steps: [
                    '在快手打开视频，点击“分享”复制链接。',
                    '粘贴链接到下方输入框，点击下载。',
                    '选择清晰度或可用下载选项后保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持快手无水印下载，高清画质以解析结果为准。',
                    '支持批量解析多个快手链接，适合整理素材。',
                    '免安装，网页直接使用，安卓和 iPhone 都能访问。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '怎么下载快手视频到手机？',
                        a: '在快手视频页点击“分享”复制链接，回到本页粘贴后点击下载，即可保存到手机相册或文件。',
                    },
                    {
                        q: '快手视频下载后一定无水印吗？',
                        a: '如果源站返回无水印资源，页面会优先显示无水印版本；个别内容可能只提供带水印选项。',
                    },
                    {
                        q: '支持批量下载快手视频吗？',
                        a: '支持一次粘贴多条快手链接进行批量解析，具体数量限制以页面提示为准。',
                    },
                    {
                        q: '快手链接解析失败怎么办？',
                        a: '请确认复制的是公开可访问的分享链接；若仍失败，可能是平台限制或网络问题，建议稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Kuaishou No Watermark Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Kuaishou videos without watermark (when available). Copy link → paste → save. Supports batch parsing.',
                metaKeywords: [
                    'kuaishou no watermark',
                    'kuaishou downloader',
                    'download kuaishou video',
                ],
                h1: 'Kuaishou No Watermark Downloader',
                lede: 'Paste a Kuaishou link to download in your browser.',
                stepsTitle: 'How it works',
                steps: [
                    'Copy the Kuaishou share link.',
                    'Paste it below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: ['Browser-based, no install.', 'Batch parsing supported.'],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Will it always be no watermark?',
                        a: 'Availability depends on the source content and platform response.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Kuaishou',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'kuaishou no watermark',
                    'kuaishou downloader',
                    'download kuaishou video',
                ],
            }),
        },
    },
    {
        slug: 'xiaohongshu-video-download',
        locales: {
            zh: zh({
                metaTitle: `小红书视频下载 - 在线去水印保存视频 | ${ZH_BRAND}`,
                metaDescription:
                    '使用 FreeSaveVideo 在线下载小红书视频，支持去除站内水印并保存高清视频与原声音频，无需安装软件。',
                metaKeywords: [
                    '小红书视频下载',
                    '小红书去水印',
                    '小红书保存视频',
                    '小红书视频保存',
                    '小红书链接解析',
                    'xhs视频下载',
                ],
                h1: '小红书视频下载',
                lede: '复制小红书分享链接后即可在线解析下载，适合保存视频素材到手机或电脑。',
                stepsTitle: '如何下载小红书视频',
                steps: [
                    '在小红书打开笔记，点击“分享”复制链接。',
                    '粘贴链接到下方输入框，点击下载。',
                    '保存视频到本地相册/文件，并按解析结果选择可用资源。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持小红书视频下载与去水印保存，高清资源以解析结果为准。',
                    '无需安装 App，网页直接使用，手机和电脑都可访问。',
                    '支持批量解析多个小红书链接（如可用）。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '怎么下载小红书视频到相册？',
                        a: '在小红书笔记页点击“分享”复制链接，回到本页粘贴后点击下载，即可将视频保存到相册或文件中。',
                    },
                    {
                        q: '小红书视频下载后会有水印吗？',
                        a: '如果解析结果提供去水印资源，页面会优先展示可直接保存的视频版本；个别内容可能受平台限制。',
                    },
                    {
                        q: '能下载小红书图文里的图片吗？',
                        a: '是否支持取决于内容类型与解析结果；粘贴链接后可以查看当前笔记支持下载的视频或图片资源。',
                    },
                    {
                        q: '小红书链接解析失败怎么办？',
                        a: '请确认复制的是可公开访问的分享链接，并保证链接能在浏览器打开；如仍失败，建议换网络或稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Xiaohongshu Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Xiaohongshu videos: copy share link → paste → save. No app needed.',
                metaKeywords: [
                    'xiaohongshu video download',
                    'xhs video downloader',
                    'download xiaohongshu',
                ],
                h1: 'Xiaohongshu Video Downloader',
                lede: 'Paste a Xiaohongshu share link to download in your browser.',
                stepsTitle: 'How it works',
                steps: [
                    'Copy the share link from Xiaohongshu.',
                    'Paste it below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: ['Works in browser.', 'Fast and simple.'],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why does it fail?',
                        a: 'Some posts may be restricted or blocked. Try again later or switch networks.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Xiaohongshu',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'xiaohongshu video download',
                    'xhs video downloader',
                    'download xiaohongshu',
                ],
            }),
        },
    },
    {
        slug: 'instagram-reels-download',
        locales: {
            zh: zh({
                metaTitle: `Instagram Reels下载（无水印/高清）- ${ZH_BRAND}`,
                metaDescription:
                    'Instagram Reels下载：复制链接→粘贴→一键保存。支持无水印与高清画质（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'instagram reels下载',
                    'ins reels下载',
                    'instagram无水印下载',
                    'ins去水印',
                    'instagram视频下载',
                ],
                h1: 'Instagram Reels下载',
                lede: '一键保存 Reels：复制链接 → 粘贴 → 下载。',
                stepsTitle: '如何下载 Instagram Reels',
                steps: [
                    '在 Instagram 打开 Reels，复制分享链接。',
                    '粘贴到下方输入框，点击下载。',
                    '保存到本地（可选清晰度/音频）。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 Reels/视频/图片链接解析（以结果为准）。',
                    '支持批量解析多个链接。',
                    '免安装，浏览器即可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '私密账号/好友可见能下载吗？',
                        a: '仅支持公开可访问内容；私密内容无法解析下载。',
                    },
                    {
                        q: '为什么清晰度选项很少？',
                        a: '不同视频提供的资源不同；如只有单一清晰度属正常情况。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Instagram Reels Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download Instagram Reels: copy link → paste → save. Works in browser with HD options when available.',
                metaKeywords: [
                    'instagram reels download',
                    'instagram reels downloader',
                    'download reels',
                ],
                h1: 'Instagram Reels Downloader',
                lede: 'Copy link → paste → download. No app required.',
                stepsTitle: 'How to download Reels',
                steps: [
                    'Copy the Instagram Reels link.',
                    'Paste it below and click download.',
                    'Save the file to your device.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Supports reels/videos/photos (when available).',
                    'Batch parsing supported.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download private content?',
                        a: 'No. Only publicly accessible content can be downloaded.',
                    },
                ],
            }),
        },
    },
    {
        slug: 'youtube-shorts-download',
        locales: {
            zh: zh({
                metaTitle: `YouTube Shorts下载（高清/音频）- ${ZH_BRAND}`,
                metaDescription:
                    'YouTube Shorts下载：复制链接→粘贴→一键保存。支持高清与音频提取（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'youtube shorts下载',
                    'shorts视频下载',
                    'youtube短视频下载',
                    'youtube下载',
                    'youtube音频提取',
                ],
                h1: 'YouTube Shorts下载',
                lede: '保存 Shorts 到本地：复制链接 → 粘贴 → 下载。',
                stepsTitle: '如何下载 YouTube Shorts',
                steps: [
                    '在 YouTube 打开 Shorts，复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择清晰度或仅音频（如可用）并保存。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 Shorts/视频链接解析（以结果为准）。',
                    '支持仅音频下载（如有资源）。',
                    '免安装，浏览器即可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '为什么有些 Shorts 无法下载？',
                        a: '可能是地区限制、版权限制或平台策略变更导致；可尝试更换链接或稍后重试。',
                    },
                    {
                        q: '能下载 4K/高帧率吗？',
                        a: '清晰度取决于原视频提供的资源与解析结果；如可用会在选项中展示。',
                    },
                ],
            }),
            en: en({
                metaTitle: `YouTube Shorts Downloader (HD) - ${EN_BRAND}`,
                metaDescription:
                    'Download YouTube Shorts: copy link → paste → save. Supports HD options and audio-only when available.',
                metaKeywords: [
                    'youtube shorts downloader',
                    'download youtube shorts',
                    'shorts video download',
                    'youtube audio download',
                ],
                h1: 'YouTube Shorts Downloader',
                lede: 'Paste a Shorts link and download in your browser.',
                stepsTitle: 'How it works',
                steps: [
                    'Copy the YouTube Shorts link.',
                    'Paste it below and click download.',
                    'Pick a quality option (if available) and save.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'HD options when available.',
                    'Audio-only option when available.',
                    'No install, works in browser.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why does it fail sometimes?',
                        a: 'Some Shorts are restricted or the platform changes delivery. Try again later.',
                    },
                ],
            }),
        },
    },
    {
        slug: 'facebook-video-download',
        locales: {
            zh: zh({
                metaTitle: `Facebook视频下载（高清/免安装）- ${ZH_BRAND}`,
                metaDescription:
                    'Facebook视频下载工具：复制链接→粘贴→一键保存。支持公开视频，免安装在线使用。',
                metaKeywords: [
                    'facebook视频下载',
                    'fb视频下载',
                    'facebook下载器',
                    'facebook保存视频',
                    'facebook链接解析',
                ],
                h1: 'Facebook视频下载',
                lede: '复制Facebook公开视频链接，在线解析并保存。',
                stepsTitle: '如何下载 Facebook 视频',
                steps: [
                    '在 Facebook 打开公开视频，点击“分享”复制链接。',
                    '粘贴链接到下方输入框，点击下载。',
                    '选择清晰度（如有）并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持公开视频解析下载。',
                    '可选不同清晰度（以解析结果为准）。',
                    '免安装，手机/电脑浏览器均可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '好友可见/私密视频能下载吗？',
                        a: '仅支持公开可访问内容；私密或权限受限的视频无法解析。',
                    },
                    {
                        q: '下载失败怎么办？',
                        a: '可能是内容受限或链接失效；请确认链接可在浏览器打开，再重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Facebook Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Facebook videos online: copy link → paste → save. Works for public videos, no app needed.',
                metaKeywords: [
                    'facebook video downloader',
                    'download facebook video',
                    'facebook video download',
                    'fb video downloader',
                    'save facebook video',
                ],
                h1: 'Facebook Video Downloader',
                lede: 'Paste a public Facebook video link to download in your browser.',
                stepsTitle: 'How to download Facebook videos',
                steps: [
                    'Open a public Facebook video and copy the share link.',
                    'Paste the link below and click download.',
                    'Pick a quality option (if available) and save.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Public video support.',
                    'HD options when available.',
                    'Works on mobile and desktop.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download private or friends-only videos?',
                        a: 'No. Only publicly accessible videos can be downloaded.',
                    },
                    {
                        q: 'Why does it fail sometimes?',
                        a: 'The video may be restricted or the link expired. Try another link or retry later.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Facebook',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'facebook video downloader',
                    'download facebook video',
                    'facebook video download',
                    'fb video downloader',
                    'save facebook video',
                ],
            }),
        },
    },
    {
        slug: 'instagram-video-download',
        locales: {
            zh: zh({
                metaTitle: `Instagram视频下载（Reels/图片）- ${ZH_BRAND}`,
                metaDescription:
                    'Instagram视频下载：复制链接→粘贴→一键保存。支持 Reels/视频/图片（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'instagram视频下载',
                    'ins视频下载',
                    'instagram下载器',
                    'instagram reels下载',
                    'ins保存视频',
                ],
                h1: 'Instagram视频下载',
                lede: '保存 Reels/视频/图片：复制链接 → 粘贴 → 下载。',
                stepsTitle: '如何下载 Instagram 视频',
                steps: [
                    '在 Instagram 打开内容并复制分享链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择可用的清晰度或素材并保存。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 Reels/视频/图片解析（以结果为准）。',
                    '可选清晰度或素材（如有）。',
                    '免安装，浏览器即可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '私密账号内容能下载吗？',
                        a: '仅支持公开可访问内容；私密内容无法解析。',
                    },
                    {
                        q: '为什么只有一个清晰度选项？',
                        a: '不同内容提供的资源不同；若只显示一个选项属正常情况。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Instagram Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Instagram videos: copy link → paste → save. Supports reels, videos, and photos when available.',
                metaKeywords: [
                    'instagram video downloader',
                    'download instagram video',
                    'instagram reels downloader',
                    'ins video download',
                ],
                h1: 'Instagram Video Downloader',
                lede: 'Copy link → paste → download. Works in your browser.',
                stepsTitle: 'How to download Instagram videos',
                steps: [
                    'Copy the Instagram share link.',
                    'Paste it below and click download.',
                    'Save the available media options.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Supports reels, videos, and photos when available.',
                    'Quality options when provided by the source.',
                    'No app install required.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download private posts?',
                        a: 'No. Only publicly accessible content can be downloaded.',
                    },
                    {
                        q: 'Why does it fail?',
                        a: 'Some posts are restricted or temporarily blocked. Try again later or switch networks.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Instagram',
                kind: 'video',
                contentKey: 'reels_video_photo',
                keywords: [
                    'instagram video downloader',
                    'download instagram video',
                    'instagram reels downloader',
                    'ins video download',
                ],
            }),
        },
    },
    {
        slug: 'twitter-x-video-download',
        locales: {
            zh: zh({
                metaTitle: `Twitter/X视频下载（高清视频）- ${ZH_BRAND}`,
                metaDescription:
                    'X（Twitter）视频下载：复制链接→粘贴→一键保存。支持视频/GIF（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'twitter视频下载',
                    'x视频下载',
                    'twitter下载器',
                    'x视频保存',
                    '推特视频下载',
                ],
                h1: 'X（Twitter）视频下载',
                lede: '复制帖子链接，在线解析并保存视频或 GIF。',
                stepsTitle: '如何下载 X（Twitter）视频',
                steps: [
                    '在 X 打开包含视频的帖子并复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择清晰度或素材（如有）并保存。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持视频与 GIF（以解析结果为准）。',
                    '可选多种清晰度（如可用）。',
                    '免安装，手机/电脑均可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '为什么解析失败？',
                        a: '平台可能临时调整或内容受限；可稍后重试或更换链接。',
                    },
                    {
                        q: '支持多媒体帖子吗？',
                        a: '支持解析多媒体帖子中的可下载素材（以结果为准）。',
                    },
                ],
            }),
            en: en({
                metaTitle: `X (Twitter) Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download X (Twitter) videos: copy link → paste → save. Supports video and GIF when available.',
                metaKeywords: [
                    'twitter video downloader',
                    'x video downloader',
                    'download twitter video',
                    'twitter gif download',
                ],
                h1: 'X (Twitter) Video Downloader',
                lede: 'Paste a post link to download video or GIF in your browser.',
                stepsTitle: 'How to download X videos',
                steps: [
                    'Copy the X post link that contains a video.',
                    'Paste it below and click download.',
                    'Choose an available quality option and save.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Supports videos and GIFs when available.',
                    'Multiple quality options when provided.',
                    'No install required.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why does it fail sometimes?',
                        a: 'Platform restrictions or temporary changes can block downloads. Try again later.',
                    },
                    {
                        q: 'Does it work with multi-media posts?',
                        a: 'It can parse available media from multi-media posts when supported.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'X (Twitter)',
                kind: 'video',
                contentKey: 'video_gif',
                keywords: [
                    'twitter video downloader',
                    'x video downloader',
                    'download twitter video',
                    'twitter gif download',
                ],
            }),
        },
    },
    {
        slug: 'reddit-video-download',
        locales: {
            zh: zh({
                metaTitle: `Reddit视频下载（GIF/视频）- ${ZH_BRAND}`,
                metaDescription:
                    'Reddit视频下载：复制帖子链接→粘贴→一键保存。支持视频与GIF（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'reddit视频下载',
                    'reddit下载器',
                    'reddit gif下载',
                    'reddit保存视频',
                    'reddit链接解析',
                ],
                h1: 'Reddit视频下载',
                lede: '复制 Reddit 帖子链接，在线解析并保存视频/GIF。',
                stepsTitle: '如何下载 Reddit 视频',
                steps: [
                    '在 Reddit 打开帖子并复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择可用的素材并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持视频与 GIF（以解析结果为准）。',
                    '免安装，浏览器即可用。',
                    '适配手机与电脑。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '为什么有些帖子无法下载？',
                        a: '可能是内容受限、已删除或仅限特定地区访问；可尝试其他链接。',
                    },
                    {
                        q: '支持评论里的视频吗？',
                        a: '取决于链接类型与解析结果；粘贴链接后可查看可下载项。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Reddit Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Reddit videos and GIFs: copy post link → paste → save. No app needed.',
                metaKeywords: [
                    'reddit video downloader',
                    'download reddit video',
                    'reddit gif download',
                    'save reddit video',
                ],
                h1: 'Reddit Video Downloader',
                lede: 'Paste a Reddit post link to download video or GIF.',
                stepsTitle: 'How to download Reddit videos',
                steps: [
                    'Open a Reddit post and copy the link.',
                    'Paste it below and click download.',
                    'Save the available media options.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Supports videos and GIFs when available.',
                    'Works in browser — no install.',
                    'Mobile and desktop friendly.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why can’t some posts be downloaded?',
                        a: 'The content may be deleted or restricted. Try another link.',
                    },
                    {
                        q: 'Does it work for comment links?',
                        a: 'It depends on the link and availability; paste it to see results.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Reddit',
                kind: 'video',
                contentKey: 'video_gif',
                keywords: [
                    'reddit video downloader',
                    'download reddit video',
                    'reddit gif download',
                    'save reddit video',
                ],
            }),
        },
    },
    {
        slug: 'pinterest-video-download',
        locales: {
            zh: zh({
                metaTitle: `Pinterest视频下载（图片/GIF）- ${ZH_BRAND}`,
                metaDescription:
                    'Pinterest视频下载：复制链接→粘贴→一键保存。支持视频、图片与GIF（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'pinterest视频下载',
                    'pinterest下载器',
                    'pinterest保存图片',
                    'pinterest gif下载',
                    'pinterest链接解析',
                ],
                h1: 'Pinterest视频下载',
                lede: '复制 Pinterest Pin 链接，在线解析并保存素材。',
                stepsTitle: '如何下载 Pinterest 视频/图片',
                steps: [
                    '在 Pinterest 打开 Pin 并复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择可用的视频/图片/GIF 并保存。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持视频、图片与 GIF（以解析结果为准）。',
                    '免安装，网页直接用。',
                    '适配手机与电脑浏览器。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '为什么只有图片没有视频？',
                        a: '不同 Pin 类型提供的素材不同；若无视频资源属正常情况。',
                    },
                    {
                        q: '下载失败怎么办？',
                        a: '确认链接可在浏览器打开；必要时更换网络或稍后重试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Pinterest Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Pinterest videos, images, or GIFs: copy link → paste → save. No app needed.',
                metaKeywords: [
                    'pinterest video downloader',
                    'download pinterest video',
                    'pinterest image download',
                    'pinterest gif download',
                ],
                h1: 'Pinterest Video Downloader',
                lede: 'Paste a Pin link to download available media.',
                stepsTitle: 'How to download Pinterest videos',
                steps: [
                    'Copy the Pinterest Pin link.',
                    'Paste it below and click download.',
                    'Save the available video/image/GIF options.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Supports videos, images, and GIFs when available.',
                    'Browser-based, no install.',
                    'Works on mobile and desktop.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why do I only see images?',
                        a: 'Some Pins only include images. Paste the link to see available media.',
                    },
                    {
                        q: 'Why does it fail?',
                        a: 'The link may be invalid or restricted. Try again later.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Pinterest',
                kind: 'video',
                contentKey: 'video_image_gif',
                keywords: [
                    'pinterest video downloader',
                    'download pinterest video',
                    'pinterest image download',
                    'pinterest gif download',
                ],
            }),
        },
    },
    {
        slug: 'snapchat-video-download',
        locales: {
            zh: zh({
                metaTitle: `Snapchat视频下载（Spotlight/故事）- ${ZH_BRAND}`,
                metaDescription:
                    'Snapchat视频下载：复制链接→粘贴→一键保存。支持 Spotlight 与故事（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'snapchat视频下载',
                    'snapchat下载器',
                    'snapchat spotlight下载',
                    'snapchat故事下载',
                    'snapchat保存视频',
                ],
                h1: 'Snapchat视频下载',
                lede: '复制 Snapchat 链接，在线解析并保存视频。',
                stepsTitle: '如何下载 Snapchat 视频',
                steps: [
                    '在 Snapchat 打开 Spotlight 或故事并复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '保存可用的视频素材到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持 Spotlight 与故事（以解析结果为准）。',
                    '免安装，网页直接用。',
                    '手机/电脑浏览器均可使用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '私密内容能下载吗？',
                        a: '仅支持公开可访问内容；私密内容无法解析。',
                    },
                    {
                        q: '为什么链接无法解析？',
                        a: '可能是链接失效或地区限制；请更换链接或稍后再试。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Snapchat Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Snapchat videos: copy link → paste → save. Supports Spotlight and Stories when available.',
                metaKeywords: [
                    'snapchat video downloader',
                    'download snapchat video',
                    'snapchat spotlight download',
                    'snapchat story download',
                ],
                h1: 'Snapchat Video Downloader',
                lede: 'Paste a Snapchat link to download available videos.',
                stepsTitle: 'How to download Snapchat videos',
                steps: [
                    'Copy the Snapchat Spotlight or Story link.',
                    'Paste it below and click download.',
                    'Save the available video to your device.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Supports Spotlight and Stories when available.',
                    'Browser-based, no install.',
                    'Works on mobile and desktop.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Can I download private content?',
                        a: 'No. Only publicly accessible content can be downloaded.',
                    },
                    {
                        q: 'Why does the link fail?',
                        a: 'The link may be expired or restricted. Try another link.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Snapchat',
                kind: 'video',
                contentKey: 'spotlight_story',
                keywords: [
                    'snapchat video downloader',
                    'download snapchat video',
                    'snapchat spotlight download',
                    'snapchat story download',
                ],
            }),
        },
    },
    {
        slug: 'vimeo-video-download',
        locales: {
            zh: zh({
                metaTitle: `Vimeo视频下载（高清）- ${ZH_BRAND}`,
                metaDescription:
                    'Vimeo视频下载：复制链接→粘贴→一键保存。支持高清选项（以解析结果为准），免安装在线使用。',
                metaKeywords: [
                    'vimeo视频下载',
                    'vimeo下载器',
                    'vimeo保存视频',
                    'vimeo链接解析',
                    'vimeo高清视频下载',
                ],
                h1: 'Vimeo视频下载',
                lede: '复制 Vimeo 视频链接，在线解析并保存。',
                stepsTitle: '如何下载 Vimeo 视频',
                steps: [
                    '在 Vimeo 打开视频并复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择可用清晰度并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持多清晰度（以解析结果为准）。',
                    '免安装，浏览器即可用。',
                    '适配手机与电脑。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '为什么没有高清选项？',
                        a: '清晰度取决于源视频提供的资源；若无高清资源属正常情况。',
                    },
                    {
                        q: '下载失败怎么办？',
                        a: '确认链接可访问；若仍失败可稍后重试或换网络。',
                    },
                ],
            }),
            en: en({
                metaTitle: `Vimeo Video Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download Vimeo videos: copy link → paste → save. HD options when available. No app required.',
                metaKeywords: [
                    'vimeo video downloader',
                    'download vimeo video',
                    'vimeo hd download',
                    'save vimeo video',
                ],
                h1: 'Vimeo Video Downloader',
                lede: 'Paste a Vimeo link to download in your browser.',
                stepsTitle: 'How to download Vimeo videos',
                steps: [
                    'Copy the Vimeo video link.',
                    'Paste it below and click download.',
                    'Choose an available quality option and save.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'HD options when available.',
                    'Browser-based, no install.',
                    'Mobile and desktop friendly.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why is HD missing?',
                        a: 'HD availability depends on the source video. If it is not provided, it cannot be downloaded.',
                    },
                    {
                        q: 'Why does it fail?',
                        a: 'The video may be restricted or removed. Try another link or retry later.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'Vimeo',
                kind: 'video',
                contentKey: 'video',
                keywords: [
                    'vimeo video downloader',
                    'download vimeo video',
                    'vimeo hd download',
                    'save vimeo video',
                ],
            }),
        },
    },
    {
        slug: 'soundcloud-audio-download',
        locales: {
            zh: zh({
                metaTitle: `SoundCloud音频下载（高音质）- ${ZH_BRAND}`,
                metaDescription:
                    'SoundCloud音频下载：复制链接→粘贴→一键保存。支持公开音频解析（以结果为准），免安装在线使用。',
                metaKeywords: [
                    'soundcloud音频下载',
                    'soundcloud下载器',
                    'soundcloud歌曲下载',
                    'soundcloud保存音频',
                    'soundcloud链接解析',
                ],
                h1: 'SoundCloud音频下载',
                lede: '复制 SoundCloud 链接，在线解析并保存音频。',
                stepsTitle: '如何下载 SoundCloud 音频',
                steps: [
                    '在 SoundCloud 打开音频并复制链接。',
                    '粘贴到下方输入框，点击下载。',
                    '选择可用音频并保存到本地。',
                ],
                featuresTitle: '功能亮点',
                features: [
                    '支持公开音频解析（以结果为准）。',
                    '免安装，网页直接用。',
                    '手机/电脑浏览器均可用。',
                ],
                faqTitle: '常见问题',
                faqs: [
                    {
                        q: '为什么某些链接无法下载？',
                        a: '可能是私密或受限内容；仅支持公开可访问音频。',
                    },
                    {
                        q: '音频格式可以选择吗？',
                        a: '格式取决于源资源提供情况；如有可选项会在解析结果中展示。',
                    },
                ],
            }),
            en: en({
                metaTitle: `SoundCloud Audio Downloader - ${EN_BRAND}`,
                metaDescription:
                    'Download SoundCloud audio: copy link → paste → save. Works for public tracks. No app required.',
                metaKeywords: [
                    'soundcloud audio downloader',
                    'download soundcloud',
                    'soundcloud mp3 download',
                    'save soundcloud audio',
                ],
                h1: 'SoundCloud Audio Downloader',
                lede: 'Paste a SoundCloud link to download available audio.',
                stepsTitle: 'How to download SoundCloud audio',
                steps: [
                    'Copy the SoundCloud track link.',
                    'Paste it below and click download.',
                    'Save the available audio option.',
                ],
                featuresTitle: 'Highlights',
                features: [
                    'Public track support.',
                    'Browser-based, no install.',
                    'Works on mobile and desktop.',
                ],
                faqTitle: 'FAQ',
                faqs: [
                    {
                        q: 'Why can’t some links be downloaded?',
                        a: 'Private or restricted tracks cannot be downloaded. Only public tracks are supported.',
                    },
                    {
                        q: 'Can I choose the audio format?',
                        a: 'Format availability depends on the source. Options appear when provided.',
                    },
                ],
            }),
            ...buildGenericLocales({
                platform: 'SoundCloud',
                kind: 'audio',
                contentKey: 'audio',
                keywords: [
                    'soundcloud audio downloader',
                    'download soundcloud',
                    'soundcloud mp3 download',
                    'save soundcloud audio',
                ],
            }),
        },
    },
];

export const seoLandingSlugs = seoLandingPages.map((page) => page.slug);

export const getSeoLandingPage = (slug: string): SeoLandingPage | undefined =>
    seoLandingPages.find((page) => page.slug === slug);

const zhLandingMeta: Record<string, { platform: string; kind: 'video' | 'audio' | 'collection' | 'reels' }> = {
    'tiktok-no-watermark': { platform: 'TikTok', kind: 'video' },
    'tiktok-collection-download': { platform: 'TikTok playlist', kind: 'collection' },
    'tiktok-mp3-download': { platform: 'TikTok', kind: 'audio' },
    'douyin-no-watermark': { platform: 'Douyin', kind: 'video' },
    'douyin-mp3-download': { platform: 'Douyin', kind: 'audio' },
    'douyin-collection-download': { platform: 'Douyin collection', kind: 'collection' },
    'bilibili-video-download': { platform: 'Bilibili', kind: 'video' },
    'kuaishou-no-watermark': { platform: 'Kuaishou', kind: 'video' },
    'xiaohongshu-video-download': { platform: 'Xiaohongshu', kind: 'video' },
    'instagram-reels-download': { platform: 'Instagram Reels', kind: 'reels' },
    'youtube-shorts-download': { platform: 'YouTube Shorts', kind: 'video' },
    'facebook-video-download': { platform: 'Facebook', kind: 'video' },
    'instagram-video-download': { platform: 'Instagram', kind: 'video' },
    'twitter-x-video-download': { platform: 'X/Twitter', kind: 'video' },
    'reddit-video-download': { platform: 'Reddit', kind: 'video' },
    'pinterest-video-download': { platform: 'Pinterest', kind: 'video' },
    'snapchat-video-download': { platform: 'Snapchat', kind: 'video' },
    'vimeo-video-download': { platform: 'Vimeo', kind: 'video' },
    'soundcloud-audio-download': { platform: 'SoundCloud', kind: 'audio' },
};

const cleanZhLandingLocale = (page: SeoLandingPage): SeoLandingLocaleContent | null => {
    const meta = zhLandingMeta[page.slug];
    if (!meta) return null;

    const isAudio = meta.kind === 'audio';
    const isCollection = meta.kind === 'collection';
    const noun = isAudio ? '\u97f3\u9891' : isCollection ? '\u5408\u96c6 / playlist' : '\u89c6\u9891';
    const h1 = `${meta.platform}${noun}\u4e0b\u8f7d`;
    const lede = isAudio
        ? `\u7c98\u8d34 ${meta.platform} \u94fe\u63a5\uff0c\u5728\u7ebf\u89e3\u6790\u5e76\u4fdd\u5b58\u53ef\u7528\u97f3\u9891\u3002`
        : isCollection
          ? `\u7c98\u8d34 ${meta.platform} \u94fe\u63a5\uff0c\u6279\u91cf\u89e3\u6790\u5e76\u4fdd\u5b58\u53ef\u7528\u5185\u5bb9\u3002`
          : `\u7c98\u8d34 ${meta.platform} \u94fe\u63a5\uff0c\u5728\u7ebf\u89e3\u6790\u5e76\u4fdd\u5b58\u53ef\u7528\u89c6\u9891\u3002`;

    return {
        metaTitle: `${h1} - ${ZH_BRAND}`,
        metaDescription: `${h1}\uff1a\u590d\u5236\u94fe\u63a5\u3001\u7c98\u8d34\u5230 FreeSaveVideo\u3001\u4fdd\u5b58\u53ef\u7528\u7ed3\u679c\u3002\u652f\u6301\u516c\u5f00\u53ef\u8bbf\u95ee\u5185\u5bb9\uff0c\u514d\u5b89\u88c5\u5728\u7ebf\u4f7f\u7528\u3002`,
        metaKeywords: [
            `${meta.platform}\u4e0b\u8f7d`,
            `${meta.platform}${noun}\u4e0b\u8f7d`,
            `${meta.platform}\u94fe\u63a5\u89e3\u6790`,
            'FreeSaveVideo',
        ],
        h1,
        lede,
        stepsTitle: `\u5982\u4f55\u4e0b\u8f7d ${meta.platform} ${noun}`,
        steps: [
            `\u6253\u5f00 ${meta.platform} \u5185\u5bb9\u5e76\u590d\u5236\u5206\u4eab\u94fe\u63a5\u3002`,
            '\u5c06\u94fe\u63a5\u7c98\u8d34\u5230\u4e0b\u65b9\u8f93\u5165\u6846\uff0c\u70b9\u51fb\u4e0b\u8f7d\u3002',
            '\u9009\u62e9\u53ef\u7528\u7684\u89c6\u9891\u3001\u97f3\u9891\u6216\u6279\u91cf\u7ed3\u679c\u5e76\u4fdd\u5b58\u3002',
        ],
        featuresTitle: '\u529f\u80fd\u4eae\u70b9',
        features: [
            '\u652f\u6301\u516c\u5f00\u53ef\u8bbf\u95ee\u5185\u5bb9\u89e3\u6790\u3002',
            '\u652f\u6301\u624b\u673a\u548c\u7535\u8111\u6d4f\u89c8\u5668\u4f7f\u7528\uff0c\u65e0\u9700\u5b89\u88c5 App\u3002',
            '\u53ef\u4e0e\u6279\u91cf\u4e0b\u8f7d\u3001\u97f3\u9891\u63d0\u53d6\u548c\u672c\u5730\u5de5\u5177\u914d\u5408\u4f7f\u7528\u3002',
        ],
        faqTitle: '\u5e38\u89c1\u95ee\u9898',
        faqs: [
            {
                q: '\u9700\u8981\u5b89\u88c5 App \u5417\uff1f',
                a: '\u4e0d\u9700\u8981\uff0c\u76f4\u63a5\u5728\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00 FreeSaveVideo \u5373\u53ef\u4f7f\u7528\u3002',
            },
            {
                q: '\u53ef\u4ee5\u4e0b\u8f7d\u79c1\u5bc6\u5185\u5bb9\u5417\uff1f',
                a: '\u4e0d\u53ef\u4ee5\u3002FreeSaveVideo \u4ec5\u652f\u6301\u516c\u5f00\u53ef\u8bbf\u95ee\u7684\u5185\u5bb9\u3002',
            },
            {
                q: '\u89e3\u6790\u7ed3\u679c\u4e3a\u4ec0\u4e48\u4f1a\u4e0d\u540c\uff1f',
                a: '\u4e0d\u540c\u5e73\u53f0\u548c\u94fe\u63a5\u7c7b\u578b\u63d0\u4f9b\u7684\u8d44\u6e90\u4e0d\u540c\uff0c\u8bf7\u4ee5\u9875\u9762\u5b9e\u9645\u89e3\u6790\u7ed3\u679c\u4e3a\u51c6\u3002',
            },
        ],
        disclaimer:
            '\u4ec5\u652f\u6301\u4e0b\u8f7d\u516c\u5f00\u53ef\u8bbf\u95ee\u5185\u5bb9\uff1b\u8bf7\u5c0a\u91cd\u7248\u6743\u3001\u521b\u4f5c\u8005\u6743\u5229\u548c\u5e73\u53f0\u89c4\u5219\u3002',
    };
};

export const getSeoLandingLocale = (
    page: SeoLandingPage,
    lang: string,
): SeoLandingLocaleContent => {
    if (lang === 'zh') {
        const clean = cleanZhLandingLocale(page);
        if (clean) return clean;
    }
    return page.locales[lang] ?? page.locales.en;
};
