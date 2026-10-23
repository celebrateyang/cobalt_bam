import { writable } from "svelte/store";

export type ReferralGiftMoment = "browser_handoff" | "extension_handoff" | "file_shared" | "folder_saved";

export const referralGiftMoment = writable<ReferralGiftMoment | null>(null);
export const referralGiftDismissedDay = writable("");
export const referralGiftViewed = writable(false);

// Saving must remain independent of the invitation UI and its subscribers.
export const offerReferralGift = (moment: ReferralGiftMoment) => {
    try { referralGiftMoment.set(moment); } catch { /* best effort */ }
};

export const referralGiftDay = (date = new Date()) =>
    `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

export const referralGiftUrl = (origin: string, lang: string, code: string) =>
    `${origin}/${encodeURIComponent(lang)}/invite/${encodeURIComponent(code)}`;
