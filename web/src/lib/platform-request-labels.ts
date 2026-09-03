const PLATFORM_LABELS: Record<string, string> = {
    "bilivideo.com": "哔哩哔哩（B站）",
    "magnific.com": "Magnific AI",
    "qq.com": "微信视频号、微信公众号",
    "qy.net": "爱奇艺",
    "vjshi.com": "光厂（VJ师网）",
    "xinpiancang.com": "新片场",
    "yangshipin.cn": "央视频",
    "youzan.com": "有赞",
};

export const platformRequestLabel = (domain: string) => {
    const normalizedDomain = domain.trim().toLowerCase().replace(/^www\./, "");
    return PLATFORM_LABELS[normalizedDomain] ?? null;
};
