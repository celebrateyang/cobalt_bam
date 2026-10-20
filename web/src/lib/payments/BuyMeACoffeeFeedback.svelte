<script lang="ts">
    import { onDestroy } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { clerkUser, getClerkToken } from "$lib/state/clerk";
    import { currentApiURL } from "$lib/api/api-url";
    import { feedbackSeen, markFeedbackSeen } from "./buymeacoffee-feedback";

    export let userId: string;
    export let orderId: number;
    export let kind: "credit" | "membership";
    export let returnCheck = 0;
    export let loading = false;
    export let statusError = false;
    export let savedFeedback: unknown = null;
    export let recheck: () => Promise<unknown>;

    let visible = false;
    let observedReturn = 0;
    let submitting = false;
    let failed = false;
    let done = Boolean(savedFeedback);
    let issuePicker = false;
    let note = "";
    let selectedReason = savedFeedback && typeof savedFeedback === "object" && "reason" in savedFeedback ? String(savedFeedback.reason) : "";
    let selectedIssue = "";
    const reasons = ["paid_not_received", "payment_issue", "trust", "still_paying", "not_now"];
    const issues = ["page", "method", "declined", "other"];
    const storageKey = `fsv_bmc_feedback_seen:${userId}:${kind}:${orderId}`;
    let mounted = true;
    onDestroy(() => { mounted = false; });

    const wasSeen = () => {
        try { return feedbackSeen(storageKey, window.localStorage); } catch { return feedbackSeen(storageKey, { getItem: () => null }); }
    };
    const markSeen = () => {
        try { markFeedbackSeen(storageKey, window.localStorage); } catch { markFeedbackSeen(storageKey, { setItem: () => {} }); }
    };
    $: if (returnCheck > observedReturn) {
        observedReturn = returnCheck;
        if (!done && !wasSeen()) { visible = true; markSeen(); }
    }
    $: if (savedFeedback) done = true;

    const submit = async (reason: string, issue = "") => {
        if (submitting || done || loading || statusError) return;
        selectedReason = reason;
        selectedIssue = issue;
        failed = false;
        submitting = true;
        try {
            const token = await getClerkToken();
            if (!mounted || !token || $clerkUser?.id !== userId) return;
            const response = await fetch(`${currentApiURL()}/payments/${kind === "membership" ? "memberships" : "credits"}/orders/${orderId}/payment-feedback`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ reason, issue, note }),
                signal: AbortSignal.timeout(10000),
            });
            const result = await response.json();
            if (!mounted || $clerkUser?.id !== userId) return;
            if (!response.ok || result.status !== "success") throw new Error("feedback failed");
            done = true;
            if (reason === "paid_not_received" || result.data?.status !== "CREATED") await recheck();
            if (reason === "still_paying" || reason === "not_now") visible = false;
        } catch { if (mounted && $clerkUser?.id === userId) failed = true; }
        finally { submitting = false; }
    };
</script>

{#if !visible}
    <button type="button" class="feedback-link" on:click={() => { visible = true; markSeen(); }}>
        {$t("auth.bmc_feedback_open")}
    </button>
{:else}
    <section class="feedback" aria-label={$t("auth.bmc_feedback_title")}>
        <strong>{$t("auth.bmc_feedback_title")}</strong>
        {#if loading}
            <p role="status">{$t("auth.loading")}</p>
        {:else if statusError}
            <p role="alert">{$t("auth.bmc_status_error")}</p>
            <button type="button" on:click={() => recheck()}>{$t("auth.check_status")}</button>
        {:else if done}
            <p role="status">{$t("auth.bmc_feedback_thanks")}</p>
            {#if selectedReason === "paid_not_received"}
                <p>{$t("auth.bmc_feedback_paid_help")}</p>
            {:else if selectedReason === "trust"}
                <p>{$t("auth.bmc_payment_destination")}</p>
                <p>{$t("auth.bmc_feedback_trust_help")}</p>
            {:else if selectedReason === "payment_issue"}
                <p>{$t("auth.bmc_feedback_issue_help")}</p>
            {/if}
        {:else}
            <p>{$t("auth.bmc_feedback_hint")}</p>
            <label>
                {$t("auth.bmc_feedback_note")}
                <textarea bind:value={note} maxlength="500" rows="2" disabled={submitting}></textarea>
            </label>
            <div class="choices">
                {#if issuePicker}
                    {#each issues as issue}
                        <button type="button" disabled={submitting} on:click={() => submit("payment_issue", issue)}>{$t(`auth.bmc_feedback_issue_${issue}`)}</button>
                    {/each}
                    <button type="button" disabled={submitting} on:click={() => { issuePicker = false; failed = false; }}>{$t("auth.bmc_feedback_back")}</button>
                {:else}
                    {#each reasons as reason}
                        <button type="button" disabled={submitting} on:click={() => reason === "payment_issue" ? issuePicker = true : submit(reason)}>{$t(`auth.bmc_feedback_reason_${reason}`)}</button>
                    {/each}
                {/if}
            </div>
            {#if failed}
                <p role="alert">{$t("auth.bmc_feedback_error")}</p>
                <button type="button" disabled={submitting} on:click={() => submit(selectedReason, selectedIssue)}>{$t("auth.bmc_feedback_retry")}</button>
            {/if}
        {/if}
        <button type="button" class="feedback-link" on:click={() => { visible = false; markSeen(); }}>{$t("auth.bmc_feedback_close")}</button>
    </section>
{/if}

<style>
    .feedback { border: 1px solid var(--surface-2); border-radius: var(--border-radius); padding: 12px; display: grid; gap: 10px; }
    p { margin: 0; font-size: .85rem; }
    label { display: grid; gap: 6px; font-size: .85rem; }
    textarea { width: 100%; box-sizing: border-box; resize: vertical; color: var(--text); background: var(--surface-1); border: 1px solid var(--surface-2); border-radius: 6px; padding: 8px; font: inherit; }
    .choices { display: grid; gap: 8px; }
    button { cursor: pointer; font: inherit; font-size: .85rem; text-align: start; padding: 8px; color: var(--text); background: var(--button); border: 1px solid var(--surface-2); border-radius: 6px; overflow-wrap: anywhere; }
    button:disabled { opacity: .6; cursor: wait; }
    .feedback-link { background: transparent; text-decoration: underline; border: 0; }
</style>
