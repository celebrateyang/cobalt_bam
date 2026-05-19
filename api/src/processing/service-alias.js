const friendlyNames = {
    cctv: "CCTV",
    bsky: "bluesky",
    twitch: "twitch clips",
    douyin: "Douyin",
    haokan: "Haokan",
    kuaishou: "Kuaishou",
    naver: "Naver"
}

export const friendlyServiceName = (service) => {
    if (service in friendlyNames) {
        return friendlyNames[service];
    }
    return service;
}
