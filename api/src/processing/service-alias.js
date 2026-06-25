const friendlyNames = {
    amazon: "Amazon Live",
    cctv: "CCTV",
    bsky: "bluesky",
    twitch: "twitch clips",
    douyin: "Douyin",
    haokan: "Haokan",
    kuaishou: "Kuaishou",
    kugou: "Kugou Music",
    naver: "Naver",
    niconico: "NicoNico",
    threads: "Threads",
    toutiao: "Toutiao",
    weibo: "Weibo",
    zhshjn: "zhshjn"
}

export const friendlyServiceName = (service) => {
    if (service in friendlyNames) {
        return friendlyNames[service];
    }
    return service;
}
