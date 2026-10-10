import { currentApiURL } from "$lib/api/api-url";
import { syncMissingUser } from "$lib/state/clerk";

export const fetchUserPoints = async (token: string): Promise<Response> => {
    return fetchWithUserSync(retryToken => fetch(`${currentApiURL()}/user/points`, {
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${retryToken}` },
    }), token);
};

// Retry only a response proving that the original request did not mutate points.
export const fetchWithUserSync = async (
    request: (token: string) => Promise<Response>,
    token: string,
): Promise<Response> => {
    const response = await request(token);
    if (response.status === 404) {
        const payload = await response.clone().json().catch(() => null);
        if (payload?.error?.code === "USER_NOT_SYNCED") {
            const retryToken = await syncMissingUser(token);
            if (retryToken) return request(retryToken);
        }
    }
    return response;
};
