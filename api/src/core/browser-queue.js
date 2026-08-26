export const isBrowserQueuedDownload = ({ request, response }) => {
    const bodyStatus = response?.status ?? "unknown";
    const service = response?.service ?? null;

    if (bodyStatus === "local-processing") return true;
    if (request?.localProcessing === "forced" && bodyStatus === "tunnel") return true;

    // WeChat article selections are returned as direct CDN redirects, but the
    // web app still downloads them through its processing queue. Keep their
    // points deferred until that queue reports a completed file.
    return request?.batch === true &&
        service === "wechat_channels" &&
        bodyStatus === "redirect";
};
