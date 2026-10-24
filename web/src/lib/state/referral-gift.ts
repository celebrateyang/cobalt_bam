import { writable } from "svelte/store";
import {
    canOfferGift, GIFT_DAY_MS, GIFT_VISIBLE_MS, GIFT_STORAGE_KEY, GIFT_SESSION_KEY, readGiftHistory,
} from "$lib/points/referral-gift-policy";

export type ReferralGiftMoment = "browser_handoff" | "extension_handoff" | "file_shared" | "folder_saved";
type GiftState = { candidate: boolean; active: boolean; moment: ReferralGiftMoment | null };
let state: GiftState = { candidate: false, active: false, moment: null };
export const referralGiftState = writable(state);
let history = readGiftHistory(null);
let initialized = false;
let storageAvailable = true;
let seenThisVisit = false;
const countedTasks = new Set<string>();
const countedFiles = new WeakSet<object>();
const visibleOwners = new Set<object>();
const interactingOwners = new Set<object>();
let remainingMs = GIFT_VISIBLE_MS;
let timer: ReturnType<typeof setTimeout> | undefined;
let timerStartedAt = 0;

const publish = (patch: Partial<GiftState>) => {
    state = { ...state, ...patch };
    referralGiftState.set(state);
};

const readHistory = () => {
    try { history = readGiftHistory(window.localStorage.getItem(GIFT_STORAGE_KEY)); }
    catch { storageAvailable = false; }
};
const persist = () => {
    try { window.localStorage.setItem(GIFT_STORAGE_KEY, JSON.stringify(history)); }
    catch { storageAvailable = false; }
};
const initialize = () => {
    if (initialized) return;
    initialized = true;
    readHistory();
    try { seenThisVisit = window.sessionStorage.getItem(GIFT_SESSION_KEY) === "1"; } catch { /* local history still limits frequency */ }
    // Respect a dismissal made by the earlier version of the card.
    try {
        const legacy = window.localStorage.getItem("fsv-referral-gift-dismissed");
        if (legacy && /^\d{4}-\d{1,2}-\d{1,2}$/.test(legacy)) {
            const [year, month, day] = legacy.split("-").map(Number);
            history.quietUntil = Math.max(history.quietUntil, new Date(year, month - 1, day).getTime() + 30 * GIFT_DAY_MS);
            persist();
            window.localStorage.removeItem("fsv-referral-gift-dismissed");
        }
    } catch { /* optional migration */ }
};

const updateTimer = () => {
    if (timer !== undefined) {
        clearTimeout(timer);
        remainingMs = Math.max(0, remainingMs - (Date.now() - timerStartedAt));
        timer = undefined;
    }
    const interacting = [...visibleOwners].some(owner => interactingOwners.has(owner));
    if (state.active && visibleOwners.size && !interacting) {
        timerStartedAt = Date.now();
        timer = setTimeout(() => closeReferralGift("timeout"), remainingMs);
    }
};

// Each task/file counts once. Keys stay in memory; no media URLs or filenames
// are persisted. Failures and copy-only actions never call this function.
export const offerReferralGift = (moment: ReferralGiftMoment, key?: object | string) => {
    if (typeof window === "undefined") return;
    try {
        initialize();
        if (typeof key === "string") {
            if (countedTasks.has(key)) return;
            countedTasks.add(key);
        } else if (key) {
            if (countedFiles.has(key)) return;
            countedFiles.add(key);
        }
        readHistory();
        history.downloads++;
        persist();
        publish({ moment, candidate: storageAvailable && canOfferGift(history, seenThisVisit, Date.now()) });
    } catch { /* Saving must remain independent of the invitation UI. */ }
};

// Only claim an exposure when the card actually enters the viewport.
export const showReferralGift = (): "started" | "active" | false => {
    initialize();
    if (state.active) return "active";
    readHistory();
    if (!state.candidate || !storageAvailable || !canOfferGift(history, seenThisVisit, Date.now())) {
        publish({ candidate: false });
        return false;
    }
    history.lastShownAt = Date.now();
    history.downloadsAtLastShown = history.downloads;
    persist();
    if (!storageAvailable) { publish({ candidate: false }); return false; }
    seenThisVisit = true;
    try { window.sessionStorage.setItem(GIFT_SESSION_KEY, "1"); } catch { /* local cooldown remains */ }
    remainingMs = GIFT_VISIBLE_MS;
    publish({ candidate: false, active: true });
    return "started";
};

export const closeReferralGift = (reason: "dismiss" | "shared" | "copied" | "timeout" | "interrupted") => {
    if (["dismiss", "shared", "copied"].includes(reason)) {
        readHistory();
        history.quietUntil = Math.max(history.quietUntil, Date.now() + 30 * GIFT_DAY_MS);
        persist();
    }
    publish({ candidate: false, active: false });
    updateTimer();
};

// Moving between page and queue cannot reset the 20-second timer.
export const setReferralGiftVisible = (owner: object, visible: boolean) => {
    if (visible) visibleOwners.add(owner);
    else visibleOwners.delete(owner);
    updateTimer();
};
export const setReferralGiftInteracting = (owner: object, interacting: boolean) => {
    if (interacting) interactingOwners.add(owner);
    else interactingOwners.delete(owner);
    updateTimer();
};

export const referralGiftUrl = (origin: string, lang: string, code: string) =>
    `${origin}/${encodeURIComponent(lang)}/invite/${encodeURIComponent(code)}`;
