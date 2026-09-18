import { error } from "@sveltejs/kit";
import env from "$lib/env";
import type { PageLoad } from "./$types";

export const prerender = false;

export const load: PageLoad = () => {
    if (!env.VIDEO_AGENT_ENABLED) error(404, "Not found");
    return {};
};
