import { get } from "svelte/store";

import settings from "$lib/state/settings";

import { device } from "$lib/device";
import { t } from "$lib/i18n/translations";
import { createDialog } from "$lib/state/dialogs";
import { trackSave, type SaveContext, type SaveOutcome } from "$lib/analytics/saving";

import type { DialogInfo } from "$lib/types/dialog";
import type { CobaltFileUrlType } from "$lib/types/api";

type DownloadFileParams = {
    url?: string,
    file?: File,
    urlType?: CobaltFileUrlType,
    forceDialog?: boolean,
    automatic?: boolean,
    onSaveResult?: (outcome: SaveOutcome) => void,
    saveContext?: SaveContext,
}

type SavingDialogParams = {
    url?: string,
    file?: File,
    body?: string,
    urlType?: CobaltFileUrlType,
    onSaveResult?: (outcome: SaveOutcome) => void,
    saveContext?: SaveContext,
}

const openSavingDialog = ({ url, file, body, urlType, onSaveResult, saveContext }: SavingDialogParams) => {
    const dialogData: DialogInfo = {
        type: "saving",
        id: "saving",
        file,
        url,
        urlType,
        onSaveResult,
        saveContext,
    }
    if (body) dialogData.bodyText = body;

    createDialog(dialogData);
    trackSave("dialog", "ask", saveContext);
    onSaveResult?.("dialog");
    return "dialog" as const;
}

export const openFile = (file: File) => {
    const a = document.createElement("a");
    const url = URL.createObjectURL(file);

    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    try {
        a.click();
    } finally {
        a.remove();
        // Give WebKit time to consume the blob before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
}

export const shareFile = async (file: File) => {
    if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
        throw new Error("File sharing unavailable");
    }
    return await navigator?.share({
        files: [
            new File([file], file.name, {
                type: file.type,
            }),
        ],
    });
}

export const openURL = (url: string) => {
    // Some media CDNs return 403 when a foreign Referer is present.
    // Use noreferrer so the download works when opened from our UI.
    let open: Window | null = null;
    try {
        const { hostname } = new URL(url, window.location.href);
        const needsNoReferrer =
            hostname.endsWith("twimg.com") ||
            hostname.endsWith("tiktokcdn.com") ||
            hostname.endsWith("tiktokcdn-us.com") ||
            hostname.endsWith("tiktokcdn-eu.com");

        if (needsNoReferrer) {
            open = window.open(url, "_blank", "noopener,noreferrer");
        } else {
            open = window.open(url, "_blank");
        }
    } catch {
        open = window.open(url, "_blank");
    }

    /* if new tab got blocked by user agent, show a saving dialog */
    if (!open) {
        openSavingDialog({
            url,
            body: get(t)("dialog.saving.blocked")
        });
        return false;
    }
    return true;
}

export const shareURL = async (url: string) => {
    return await navigator?.share({ url });
}

export const copyURL = async (url: string) => {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    return await navigator.clipboard.writeText(url);
}

export const saveWithFeedback = async (
    method: "download" | "share" | "copy",
    { url, file, onSaveResult, saveContext }: DownloadFileParams,
): Promise<SaveOutcome> => {
    trackSave("attempt", method, saveContext);
    let outcome: SaveOutcome;
    try {
        if (method === "share") {
            if (file) await shareFile(file);
            else if (url) await shareURL(url);
            else throw new Error("Missing media");
            outcome = "shared";
        } else if (method === "copy" && url) {
            await copyURL(url);
            outcome = "copied";
        } else if (method === "download" && file) {
            openFile(file);
            outcome = "download";
        } else if (method === "download" && url) {
            outcome = openURL(url) ? "download" : "dialog";
        } else {
            throw new Error("Unsupported saving method");
        }
    } catch (error) {
        outcome = error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed";
    }
    trackSave(outcome, method, saveContext);
    onSaveResult?.(outcome);
    return outcome;
};

export const downloadFile = async (params: DownloadFileParams): Promise<SaveOutcome> => {
    const { url, file, urlType, forceDialog } = params;
    if (!url && !file) throw new Error("attempted to download void");

    const pref = get(settings).save.savingMethod;

    if (forceDialog || pref === "ask") {
        return openSavingDialog(params);
    }

    // A finished local file can be handed to the download manager without
    // opening a new window or invoking a gesture-gated sharing API.
    if (file && pref === "download"
            && device.supports.directDownload && !device.is.iOS) {
        return saveWithFeedback("download", params);
    }

    /*
        user actions (such as invoke share, open new tab) have expiration.
        in webkit, for example, that timeout is 5 seconds.
        https://github.com/WebKit/WebKit/blob/b838f8bb/Source/WebCore/page/LocalDOMWindow.cpp#L167

        navigator.userActivation.isActive makes sure that we're still able to
        invoke an action without the user agent interrupting it.
        if not, we show a saving dialog for user to re-invoke that action.

        if browser is old or doesn't support this API, we just assume that it expired.
    */
    if (!navigator?.userActivation?.isActive) {
        return openSavingDialog({
            ...params,
            body: get(t)("dialog.saving.timeout"),
        });
    }

    try {
        if (file) {
            if (pref === "share" && device.supports.share) {
                return saveWithFeedback("share", params);
            } else if (pref === "download" && device.supports.directDownload) {
                return saveWithFeedback("download", params);
            }
        }

        if (url) {
            if (pref === "share" && device.supports.share) {
                return saveWithFeedback("share", params);
            } else if (pref === "download" && device.supports.directDownload
                    && !(device.is.iOS && urlType === "redirect")) {
                return saveWithFeedback("download", params);
            } else if (pref === "copy" && !file) {
                return saveWithFeedback("copy", params);
            }
        }
    } catch { /* catch & ignore */ }

    return openSavingDialog(params);
}
