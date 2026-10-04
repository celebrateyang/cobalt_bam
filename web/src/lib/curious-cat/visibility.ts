import type { CobaltQueue } from "$lib/types/queue";

// Activities currently contain Chinese copy only. Do not interrupt saving or
// troubleshooting, even when processing itself has already finished.
export const canShowCampaign = (lang: string, items: CobaltQueue) =>
    lang === "zh" && !Object.values(items).some(item =>
        item.state === "waiting" || item.state === "running" ||
        item.state === "error" ||
        (item.state === "done" && item.autoSave?.state !== "saved")
    );
