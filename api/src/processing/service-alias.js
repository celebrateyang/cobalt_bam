const friendlyNames = {
    bsky: "bluesky",
    twitch: "twitch clips",
    douyin: "Douyin",
    kuaishou: "Kuaishou"
}

export const friendlyServiceName = (service) => {
    if (service in friendlyNames) {
        return friendlyNames[service];
    }
    return service;
}
