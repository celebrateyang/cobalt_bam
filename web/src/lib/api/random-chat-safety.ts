import { currentApiURL } from "$lib/api/api-url";

export type RandomChatEligibility = {
    eligible: boolean;
    reason?: string | null;
    adultConfirmed: boolean;
    adultConfirmedAt?: number | null;
};

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
});

export const fetchRandomChatEligibility = async (
    token: string,
): Promise<RandomChatEligibility> => {
    const response = await fetch(`${currentApiURL()}/user/chat/eligibility`, {
        headers: authHeaders(token),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error?.message || "Failed to check chat eligibility");
    }
    return data?.data as RandomChatEligibility;
};

export const confirmRandomChatAdult = async (token: string) => {
    const response = await fetch(`${currentApiURL()}/user/chat/age-confirmation`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ isAdult: true }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error?.message || "Failed to save age confirmation");
    }
    return data?.data as { confirmed: boolean; confirmedAt: number };
};
