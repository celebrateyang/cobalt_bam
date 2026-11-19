import { writable } from "svelte/store";

export const subtitleDownloadNotice = writable<{ url: string; filename: string } | null>(null);
