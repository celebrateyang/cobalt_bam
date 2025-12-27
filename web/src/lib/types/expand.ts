import type { CobaltErrorResponse } from "$lib/types/api";

export type CobaltExpandItem = {
    url: string;
    title?: string;
    duration?: number;
};

export type CobaltExpandOkResponse = {
    status: "ok";
    service?: string;
    kind: "single" | "bilibili-ugc-season" | "bilibili-multi-page";
    title?: string;
    items: CobaltExpandItem[];
};

export type CobaltExpandResponse = CobaltExpandOkResponse | CobaltErrorResponse;
