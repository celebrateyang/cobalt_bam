export type AttributionTouch = {
    source: string;
    medium: string;
    campaign?: string;
    content?: string;
    term?: string;
    landingPath: string;
    capturedAt: number;
};

export type OrderAttribution = {
    firstTouch: AttributionTouch;
    lastTouch: AttributionTouch;
};

const STORAGE_KEY = "fsv_attribution_v1";
const MAX_VALUE_LENGTH = 200;

const clean = (value: string | null) =>
    String(value || "")
        .trim()
        .slice(0, MAX_VALUE_LENGTH);

const readStored = (): OrderAttribution | null => {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
        if (!parsed?.firstTouch?.source || !parsed?.lastTouch?.source) return null;
        return parsed as OrderAttribution;
    } catch {
        return null;
    }
};

const externalReferrerSource = () => {
    try {
        const referrer = new URL(document.referrer);
        return referrer.hostname !== window.location.hostname
            ? clean(referrer.hostname)
            : "";
    } catch {
        return "";
    }
};

const organicSearchHosts = new Set([
    "baidu.com",
    "bing.com",
    "duckduckgo.com",
    "google.com",
    "search.yahoo.com",
    "yandex.com",
]);

const isOrganicSearchSource = (source: string) =>
    [...organicSearchHosts].some(
        (host) => source === host || source.endsWith(`.${host}`),
    );

export const captureAttribution = () => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const utmSource = clean(params.get("utm_source"));
    const referrerSource = externalReferrerSource();
    const previous = readStored();
    if (!utmSource && previous) return;
    const source = utmSource || referrerSource || "(direct)";
    const inferredMedium = referrerSource
        ? isOrganicSearchSource(referrerSource)
            ? "organic"
            : "referral"
        : "(none)";

    const touch: AttributionTouch = {
        source,
        medium:
            clean(params.get("utm_medium")) ||
            (utmSource ? "campaign" : inferredMedium),
        landingPath: clean(window.location.pathname),
        capturedAt: Date.now(),
    };

    const campaign = clean(params.get("utm_campaign"));
    const content = clean(params.get("utm_content"));
    const term = clean(params.get("utm_term"));
    if (campaign) touch.campaign = campaign;
    if (content) touch.content = content;
    if (term) touch.term = term;

    const attribution: OrderAttribution = {
        firstTouch: previous?.firstTouch || touch,
        lastTouch: touch,
    };

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    } catch {
        // Attribution remains best-effort when storage is unavailable.
    }
};

export const getOrderAttribution = (): OrderAttribution | null => {
    if (typeof window === "undefined") return null;
    return readStored();
};
