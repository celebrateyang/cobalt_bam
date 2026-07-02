export const FREESAVEVIDEO_EXTENSION_ID = "pcpbaaiagdihbnbpbcdkeofheepadcid";
export const FREESAVEVIDEO_EXTENSION_STORE_URL =
    "https://chromewebstore.google.com/detail/freesavevideo-downloader/pcpbaaiagdihbnbpbcdkeofheepadcid";

export const isChromiumLike = () => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /\b(?:Chrome|Chromium|Edg)\//.test(ua) &&
        !/\b(?:OPR|Opera|SamsungBrowser|CriOS|FxiOS)\//.test(ua);
};

export const sendExternalExtensionMessage = <T,>(message: Record<string, unknown>) =>
    new Promise<T | null>((resolve) => {
        const runtime = (globalThis as typeof globalThis & {
            chrome?: {
                runtime?: {
                    sendMessage?: (
                        extensionId: string,
                        message: Record<string, unknown>,
                        callback: (response?: T) => void,
                    ) => void;
                    lastError?: { message?: string };
                };
            };
        }).chrome?.runtime;

        if (!runtime?.sendMessage) {
            resolve(null);
            return;
        }

        try {
            runtime.sendMessage(FREESAVEVIDEO_EXTENSION_ID, message, (response?: T) => {
                if (runtime.lastError) {
                    resolve(null);
                    return;
                }
                resolve(response ?? null);
            });
        } catch {
            resolve(null);
        }
    });

const detectExtensionInstalledExternally = async () => {
    const response = await sendExternalExtensionMessage<{ ok?: boolean }>({
        type: "FSV_EXTERNAL_PING",
    });
    return response?.ok === true;
};

const detectExtensionInstalledFromBridge = (timeoutMs = 900) => new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
        resolve(false);
        return;
    }

    const requestId = `fsv-extension-ping-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
        cleanup();
        resolve(false);
    }, timeoutMs);

    const cleanup = () => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
    };

    const onMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;

        const data = event.data;
        if (!data || data.source !== "freesavevideo-extension") return;
        if (data.type === "FSV_EXTENSION_READY") {
            cleanup();
            resolve(true);
            return;
        }
        if (data.type !== "FSV_EXTENSION_PONG") return;
        if (data.requestId !== requestId) return;

        cleanup();
        resolve(data.ok === true);
    };

    window.addEventListener("message", onMessage);
    window.postMessage({
        source: "freesavevideo-page",
        type: "FSV_EXTENSION_PING",
        requestId,
    }, window.location.origin);
});

export const detectFreeSaveVideoExtensionInstalled = async () => (
    await detectExtensionInstalledFromBridge() ||
    await detectExtensionInstalledExternally()
);

export const openFreeSaveVideoExtensionStore = () => {
    if (typeof window === "undefined") return;
    window.open(FREESAVEVIDEO_EXTENSION_STORE_URL, "_blank", "noopener,noreferrer");
};
