import { get } from "svelte/store";
import { device } from "$lib/device";
import { downloadFile } from "$lib/download";
import { queue, updateItem } from "$lib/state/task-manager/queue";
import type { SaveOutcome } from "$lib/analytics/saving";
import type { CobaltQueue, UUID } from "$lib/types/queue";

export const getQueueSaveCandidates = (items: CobaltQueue, individually: boolean) => {
    const ready = Object.entries(items).filter(([, item]) =>
        item.state === "done" && Boolean(item.resultFile) &&
        item.autoSave?.state !== "saved" && item.autoSave?.state !== "saving"
    );
    if (!individually || !ready.length) return ready;
    return [ready.find(([, item]) => !item.saveRequested) || ready[0]];
};

// Saving an existing result never submits another extraction or points request.
export const saveQueueFile = async (id: UUID, source: "queue" | "bulk" = "queue") => {
    const item = get(queue)[id];
    if (item?.state !== "done" || !item.resultFile ||
        item.autoSave?.state === "saved" || item.autoSave?.state === "saving") return;
    const attempts = item.saveAttempts || 0;
    updateItem(id, current => ({ ...current, saveAttempts: attempts + 1 }));
    return downloadFile({
        file: new File([item.resultFile], item.filename, { type: item.mimeType }),
        forceDialog: device.is.iOS,
        saveContext: { source, repeat: attempts > 0 || Boolean(item.saveRequested) },
        onSaveResult: (outcome: SaveOutcome) => updateItem(id, current => ({
            ...current,
            saveOutcome: outcome,
            saveRequested: outcome === "download" || outcome === "shared",
        })),
    });
};
