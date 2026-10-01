const friendlyNames = {
    xinpianchang: 'Xinpianchang',
    amazon: "Amazon Live",
    cctv: "CCTV",
    bilibili_cdn: "Bilibili CDN",
    bsky: "bluesky",
    twitch: "twitch clips",
    douyin: "Douyin",
    haokan: "Haokan",
    iqiyi: "iQIYI",
    kuaishou: "Kuaishou",
    magnific: "Magnific",
    kugou: "Kugou Music",
    naver: "Naver",
    niconico: "NicoNico",
    podcast: "Podcast",
    sooplive: "SOOP",
    tencent_video: "Tencent Video",
    threads: "Threads",
    toutiao: "Toutiao",
    weibo: "Weibo",
    wechat_channels: "WeChat Channels",
    zhshjn: "zhshjn"
}

export const friendlyServiceName = (service) => {
    if (service in friendlyNames) {
        return friendlyNames[service];
    }
    return service;
}
