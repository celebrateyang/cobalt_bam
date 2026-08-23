type RandomChatAnalyticsWindow = Window & {
    gtag?: (...args: unknown[]) => void;
};

export type RandomChatCampaignIntent =
    | "western_asia_social"
    | "asia_english_practice"
    | "international_social";

export const getRandomChatCampaignIntent = (
    lang: string,
): RandomChatCampaignIntent => {
    if (["en", "de", "fr", "es"].includes(lang)) {
        return "western_asia_social";
    }
    if (["zh", "ja", "ko", "vi", "th"].includes(lang)) {
        return "asia_english_practice";
    }
    return "international_social";
};

export const trackRandomChatEvent = (
    action: string,
    params: Record<string, string | number | boolean | null> = {},
) => {
    if (typeof window === "undefined") return;
    const target = window as RandomChatAnalyticsWindow;
    target.gtag?.("event", "random_chat_funnel", {
        action,
        ...params,
    });
};
