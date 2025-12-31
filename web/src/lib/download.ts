import { get } from "svelte/store";

import settings from "$lib/state/settings";

import { device } from "$lib/device";
import { t } from "$lib/i18n/translations";
import { createDialog } from "$lib/state/dialogs";

import type { DialogInfo } from "$lib/types/dialog";
import type { CobaltFileUrlType } from "$lib/types/api";

type DownloadFileParams = {
    url?: string,
    file?: File,
    urlType?: CobaltFileUrlType,
    preOpenedWindow?: Window | null,
}

type SavingDialogParams = {
    url?: string,
    file?: File,
    body?: string,
    urlType?: CobaltFileUrlType,
}

const openSavingDialog = ({ url, file, body, urlType }: SavingDialogParams) => {
    const dialogData: DialogInfo = {
        type: "saving",
        id: "saving",
        file,
        url,
        urlType,
    }
    if (body) dialogData.bodyText = body;

    createDialog(dialogData)
}

const closePreOpenedWindow = (preOpenedWindow?: Window | null) => {
    try {
        if (preOpenedWindow && !preOpenedWindow.closed) {
            preOpenedWindow.close();
        }
    } catch { /* ignore */ }
}

const openURLInPreOpenedWindow = (url: string, preOpenedWindow?: Window | null) => {
    if (!preOpenedWindow || preOpenedWindow.closed) return false;

    try {
        preOpenedWindow.location.href = url;
        return true;
    } catch {
        return false;
    }
}

export const openFile = (file: File) => {
    const a = document.createElement("a");
    const url = URL.createObjectURL(file);

    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
}

export const shareFile = async (file: File) => {
    return await navigator?.share({
        files: [
            new File([file], file.name, {
                type: file.type,
            }),
        ],
    });
}

export const openURL = (url: string) => {
    const open = window.open(url, "_blank");

    /* if new tab got blocked by user agent, show a saving dialog */
    if (!open) {
        return openSavingDialog({
            url,
            body: get(t)("dialog.saving.blocked")
        });
    }
}

export const shareURL = async (url: string) => {
    return await navigator?.share({ url });
}

export const copyURL = async (url: string) => {
    return await navigator?.clipboard?.writeText(url);
}

export const downloadFile = ({ url, file, urlType, preOpenedWindow }: DownloadFileParams) => {
    if (!url && !file) throw new Error("attempted to download void");

    const pref = get(settings).save.savingMethod;

    if (pref === "ask") {
        closePreOpenedWindow(preOpenedWindow);
        return openSavingDialog({ url, file, urlType });
    }

    if (url && pref === "download" && device.supports.directDownload
        && !(device.is.iOS && urlType === "redirect")
        && openURLInPreOpenedWindow(url, preOpenedWindow)) {
        // Best-effort: close the helper tab after the download likely started.
        // We can't reliably detect "download finished" in browsers.
        const closeDelayMs = urlType === "redirect" ? 4500 : 2500;
        setTimeout(() => closePreOpenedWindow(preOpenedWindow), closeDelayMs);
        return;
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
        closePreOpenedWindow(preOpenedWindow);
        return openSavingDialog({
            url,
            file,
            body: get(t)("dialog.saving.timeout"),
            urlType
        });
    }

    try {
        if (file) {
            if (pref === "share" && device.supports.share) {
                closePreOpenedWindow(preOpenedWindow);
                return shareFile(file);
            } else if (pref === "download" && device.supports.directDownload) {
                closePreOpenedWindow(preOpenedWindow);
                return openFile(file);
            }
        }

        if (url) {
            if (pref === "share" && device.supports.share) {
                closePreOpenedWindow(preOpenedWindow);
                return shareURL(url);
            } else if (pref === "download" && device.supports.directDownload
                    && !(device.is.iOS && urlType === "redirect")) {
                closePreOpenedWindow(preOpenedWindow);
                return openURL(url);
            } else if (pref === "copy" && !file) {
                closePreOpenedWindow(preOpenedWindow);
                return copyURL(url);
            }
        }
    } catch { /* catch & ignore */ }

    closePreOpenedWindow(preOpenedWindow);
    return openSavingDialog({ url, file, urlType });
}
