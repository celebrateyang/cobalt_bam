const labels: Record<string, [string, string, string]> = {
    en: ['Cobalt.tools alternative', 'SaveFrom.net alternative', 'Learn'],
    zh: ['Cobalt.tools 替代方案', 'SaveFrom.net 替代方案', '使用指南'],
    de: ['Alternative zu Cobalt.tools', 'Alternative zu SaveFrom.net', 'Anleitungen'],
    es: ['Alternativa a Cobalt.tools', 'Alternativa a SaveFrom.net', 'Guías'],
    fr: ['Alternative à Cobalt.tools', 'Alternative à SaveFrom.net', 'Guides'],
    ja: ['Cobalt.tools の代替', 'SaveFrom.net の代替', '使い方ガイド'],
    ko: ['Cobalt.tools 대안', 'SaveFrom.net 대안', '사용 가이드'],
    ru: ['Альтернатива Cobalt.tools', 'Альтернатива SaveFrom.net', 'Руководства'],
    th: ['ทางเลือกแทน Cobalt.tools', 'ทางเลือกแทน SaveFrom.net', 'คู่มือ'],
    vi: ['Thay thế Cobalt.tools', 'Thay thế SaveFrom.net', 'Hướng dẫn'],
    id: ['Alternatif Cobalt.tools', 'Alternatif SaveFrom.net', 'Panduan'],
};
export const getAlternativeLabels = (lang: string) => labels[lang] ?? labels.en;
