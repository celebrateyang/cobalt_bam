import { currentApiURL } from "$lib/api/api-url";
import { getClerkToken } from "$lib/state/clerk";
import type { CobaltFetchFailureDiagnostic } from "$lib/types/workers";

// Best-effort telemetry must never prevent completing or refunding a task.
export const reportDownloadOutcome = async (
    requestId: string | undefined,
    state: "processed" | "failed",
    errorCode?: string,
    diagnostic?: CobaltFetchFailureDiagnostic,
) => {
    if (!requestId) return;
    try {
        const token = await getClerkToken();
        if (!token) return;
        const payload = JSON.stringify({ requestId, state, errorCode, diagnostic });
        for (const delay of [0, 500, 1500]) {
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            const response = await fetch(`${currentApiURL()}/user/downloads/outcome`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: payload,
                signal: AbortSignal.timeout(10_000),
            }).catch(() => null);
            if (response?.ok) return;
            // A pending audit insert may temporarily return 404.
            if (response && response.status !== 404 && response.status < 500) return;
        }
    } catch (error) {
        console.warn("[queue] could not persist browser outcome", error);
    }
};
