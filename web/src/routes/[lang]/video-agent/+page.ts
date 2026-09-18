import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

// Keep earlier preview links working inside the AI Video section.
export const load: PageLoad = ({ params, url }) => {
    redirect(307, `/${params.lang}/ai-video/video-agent${url.search}`);
};
