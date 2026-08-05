type InviteAction =
    | "view"
    | "sign_up_click"
    | "sign_in_click"
    | "claim_success"
    | "claim_already"
    | "claim_failed";

type AnalyticsWindow = Window & {
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
};

export const trackInviteAction = (
    action: InviteAction,
    detail?: string,
) => {
    const target = window as AnalyticsWindow;
    target.gtag?.("event", "invite_funnel", {
        action,
        ...(detail ? { detail } : {}),
    });
    target.clarity?.("set", "invite_action", action);
    if (detail) target.clarity?.("set", "invite_detail", detail);
    target.clarity?.("event", "invite_funnel");
};
