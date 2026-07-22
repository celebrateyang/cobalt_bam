import type { CobaltErrorResponse } from "$lib/types/api";

export type CobaltExpandItem = {
    url: string;
    title?: string;
    duration?: number;
    itemKey?: string;
    availability?: "available" | "platform_restricted";
};

export type CobaltExpandOkResponse = {
    status: "ok";
    service?: string;
    kind:
        | "single"
        | "bilibili-ugc-season"
        | "bilibili-ugc-season-pages"
        | "bilibili-multi-page"
        | "douyin-mix"
        | "tiktok-playlist"
        | "youtube-playlist";
    title?: string;
    collectionKey?: string;
    items: CobaltExpandItem[];
};

export type CobaltExpandResponse = CobaltExpandOkResponse | CobaltErrorResponse;
