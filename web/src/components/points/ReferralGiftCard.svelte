<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { t } from "$lib/i18n/translations";
    import { clerkUser, getClerkToken } from "$lib/state/clerk";
    import { fetchUserPoints } from "$lib/api/user-points";
    import { referralGiftMoment, referralGiftDay, referralGiftUrl, referralGiftDismissedDay, referralGiftViewed } from "$lib/state/referral-gift";
    import { queueVisible } from "$lib/state/queue-visibility";
    import { trackInviteAction } from "$lib/analytics/invite";

    const dismissalKey = "fsv-referral-gift-dismissed";
    export let surface: "page" | "queue" = "page";
    let mounted = false;
    let loadedFor = "";
    let referralCode = "";
    let busy = false;
    let feedback = "";
    let manualCopy = false;

    onMount(() => {
        try { $referralGiftDismissedDay = localStorage.getItem(dismissalKey) || $referralGiftDismissedDay; } catch { /* optional storage */ }
        mounted = true;
    });

    $: userId = $clerkUser?.id || "";
    $: eligible = mounted && Boolean($referralGiftMoment) && Boolean(userId)
        && $referralGiftDismissedDay !== referralGiftDay()
        && (surface === "queue" ? $queueVisible : !$queueVisible);
    $: if (eligible && loadedFor !== userId) void loadCode(userId);
    $: url = referralCode && loadedFor === userId
        ? referralGiftUrl($page.url.origin, $page.params.lang || "en", referralCode) : "";
    $: visible = eligible && Boolean(url);
    $: if (visible && !$referralGiftViewed) {
        $referralGiftViewed = true;
        trackInviteAction("gift_view", $referralGiftMoment || undefined);
    }

    async function loadCode(id: string) {
        loadedFor = id;
        referralCode = "";
        try {
            const token = await getClerkToken();
            if (!token) return;
            const response = await fetchUserPoints(token);
            const payload = await response.json();
            if (response.ok && $clerkUser?.id === id && loadedFor === id) {
                const code = payload?.data?.user?.referral_code;
                if (typeof code === "string" && code) referralCode = code;
            }
        } catch { /* The invitation must not interrupt downloading. */ }
    }

    function dismiss() {
        $referralGiftDismissedDay = referralGiftDay();
        try { localStorage.setItem(dismissalKey, $referralGiftDismissedDay); } catch { /* optional storage */ }
        trackInviteAction("gift_dismiss");
    }

    async function copy() {
        if (busy || !url) return;
        busy = true;
        feedback = "";
        try {
            await navigator.clipboard.writeText(`${$t("invite.gift_share_text")}\n${url}`);
            feedback = $t("invite.gift_copied");
            trackInviteAction("gift_copied");
        } catch {
            manualCopy = true;
            feedback = $t("invite.gift_copy_manual");
        } finally { busy = false; }
    }

    async function share() {
        if (busy || !url) return;
        if (!navigator.share) { await copy(); return; }
        busy = true;
        feedback = "";
        trackInviteAction("gift_share_opened");
        try {
            await navigator.share({ title: "FreeSaveVideo", text: $t("invite.gift_share_text"), url });
            // Returning from the share sheet is not proof of sending or registration.
            trackInviteAction("gift_share_returned");
        } catch (error) {
            if ((error as Error)?.name === "AbortError") {
                trackInviteAction("gift_share_cancelled");
            } else {
                manualCopy = true;
                feedback = $t("invite.gift_copy_manual");
            }
        } finally { busy = false; }
    }
</script>

{#if visible}
    <aside class="referral-gift" aria-labelledby="referral-gift-title">
        <div class="gift-copy">
            <h2 id="referral-gift-title">{$t("invite.gift_title")}</h2>
            <p>{$t("invite.gift_body")}</p>
        </div>
        <div class="gift-actions">
            <button class="primary" disabled={busy} on:click={share}>{$t("invite.gift_send")}</button>
            <button disabled={busy} on:click={copy}>{$t("invite.gift_copy")}</button>
            <button class="dismiss" on:click={dismiss}>{$t("invite.gift_later")}</button>
        </div>
        {#if manualCopy}
            <textarea readonly rows="4" aria-label={$t("invite.gift_copy")} value={`${$t("invite.gift_share_text")}\n${url}`} on:focus={(event) => event.currentTarget.select()}></textarea>
        {/if}
        <p class="feedback" role="status">{feedback}</p>
    </aside>
{/if}

<style>
    .referral-gift { width: min(100%, 860px); flex-shrink: 0; padding: 16px; border: 1px solid var(--accent); border-radius: 14px; background: var(--background); color: var(--text); }
    h2 { font-size: 17px; margin: 0 0 8px; }
    p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--subtext); }
    .gift-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    button { cursor: pointer; min-height: 44px; padding: 8px 14px; border: 1px solid var(--popup-stroke); border-radius: 9px; background: var(--background); color: var(--text); font: inherit; font-size: 14px; }
    button.primary { background: var(--accent-background); border-color: var(--accent); }
    button.dismiss { border-color: transparent; color: var(--subtext); }
    button:disabled { opacity: .6; cursor: wait; }
    button:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    textarea { width: 100%; margin-top: 12px; padding: 10px; color: var(--text); background: var(--background); border: 1px solid var(--popup-stroke); border-radius: 8px; resize: vertical; }
    .feedback:empty { display: none; }
    .feedback:not(:empty) { margin-top: 8px; }
</style>
