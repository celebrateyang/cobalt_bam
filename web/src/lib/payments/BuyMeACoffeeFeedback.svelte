<script lang="ts">
    import { onDestroy } from "svelte";
    import { t } from "$lib/i18n/translations";
    import { clerkUser, getClerkToken } from "$lib/state/clerk";
    import { currentApiURL } from "$lib/api/api-url";

    export let userId: string;
    export let orderId: number;
    export let kind: "credit" | "membership";
    export let summary = "";
    export let accountEmail = "";
    export let checkoutUrl = "";
    export let statusError = false;
    export let savedFeedback: unknown = null;
    export let recheck: () => Promise<unknown>;
    export let onCheckout: () => void = () => {};
    export let onClose: () => void = () => {};

    let screen: "overview" | "paid" | "issues" | "abandon" | "thanks" = "overview";
    let submitting = false;
    let failed = false;
    let done = Boolean(savedFeedback);
    let checking = false;
    let checkedPending = false;
    let checkFailed = false;
    let note = "";
    let selectedReason = "";
    let selectedIssue = "";
    let mounted = true;
    let checkVersion = 0;
    const issues = ["page", "method", "declined", "other"];
    const abandonReasons = ["browsing", "price", "unclear", "trust", "other"];
    onDestroy(() => { mounted = false; checkVersion += 1; });
    $: if (savedFeedback) done = true;
    $: supportUrl = `mailto:celebrateyang@gmail.com?subject=${encodeURIComponent(`FreeSaveVideo payment help: ${kind} order ${orderId}`)}&body=${encodeURIComponent(`Account email: ${accountEmail}\nOrder: ${orderId}\nPlease attach your Buy Me a Coffee receipt. Do not include card details.`)}`;

    const navigate = (next: typeof screen) => {
        checkVersion += 1;
        checking = false;
        screen = next;
        selectedReason = "";
        selectedIssue = "";
        failed = false;
        checkFailed = false;
    };
    const selectReason = (reason: string, issue = "") => {
        selectedReason = reason;
        selectedIssue = issue;
        failed = false;
    };
    const checkPaid = async () => {
        if (checking) return;
        navigate("paid");
        checking = true;
        checkedPending = false;
        const version = checkVersion;
        try {
            const order = await recheck();
            if (!mounted || version !== checkVersion || $clerkUser?.id !== userId) return;
            checkedPending = Boolean(order && typeof order === "object" && "status" in order && order.status === "CREATED");
            if (checkedPending) selectReason("paid_not_received");
        } catch { if (mounted && version === checkVersion) checkFailed = true; }
        finally { if (mounted && version === checkVersion) checking = false; }
    };
    const submit = async () => {
        if (submitting || done || statusError || !selectedReason) return;
        failed = false;
        submitting = true;
        try {
            const token = await getClerkToken();
            if (!mounted || !token || $clerkUser?.id !== userId) return;
            const response = await fetch(`${currentApiURL()}/payments/${kind === "membership" ? "memberships" : "credits"}/orders/${orderId}/payment-feedback`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ reason: selectedReason, issue: selectedIssue, note }),
                signal: AbortSignal.timeout(10000),
            });
            const result = await response.json();
            if (!mounted || $clerkUser?.id !== userId) return;
            if (!response.ok || result.status !== "success") throw new Error("feedback failed");
            done = true;
            screen = "thanks";
            if (result.data?.status !== "CREATED") await recheck();
        } catch { if (mounted && $clerkUser?.id === userId) failed = true; }
        finally { submitting = false; }
    };
</script>

<section class="return-help" aria-label={$t("auth.bmc_return_title")}>
    <header>
        <h2>{$t("auth.bmc_return_title")}</h2>
        <p class="summary">{summary}</p>
        <p>{$t("auth.bmc_automatic_delivery")}</p>
    </header>
    {#if statusError || checkFailed}
        <div class="status-message" role="alert">
            <p>{$t("auth.bmc_status_error")}</p>
            <button type="button" disabled={checking} on:click={checkPaid}>{$t("auth.check_status")}</button>
        </div>
    {/if}
    {#if screen === "overview"}
        <div class="actions">
            <button type="button" class="primary" on:click={checkPaid}>{$t("auth.bmc_return_paid")}</button>
            <button type="button" on:click={() => navigate("issues")}>{$t("auth.bmc_return_problem")}</button>
            <button type="button" on:click={() => navigate("abandon")}>{$t("auth.bmc_return_not_now")}</button>
        </div>
    {:else if screen === "thanks"}
        <div class="status-message" role="status"><strong>{$t("auth.bmc_feedback_thanks")}</strong></div>
        <button type="button" on:click={onClose}>{$t("auth.close")}</button>
    {:else}
        <div class="step">
            <button type="button" class="text-button" disabled={submitting} on:click={() => navigate("overview")}>{$t("auth.bmc_feedback_back")}</button>
            {#if screen === "paid"}
                <h3>{$t("auth.bmc_return_paid")}</h3>
                <div class="paid-status" aria-live="polite">
                    {#if checking}<p>{$t("auth.loading")}</p>
                    {:else if checkedPending}<p>{$t("auth.bmc_feedback_paid_help")}</p>
                    {:else if !statusError}<button type="button" on:click={checkPaid}>{$t("auth.check_status")}</button>{/if}
                </div>
                <a href={supportUrl}>{$t(kind === "membership" ? "auth.bmc_member_help" : "auth.bmc_help")}</a>
            {:else if screen === "issues"}
                <h3>{$t("auth.bmc_return_problem")}</h3>
                <div class="choices" role="group" aria-label={$t("auth.bmc_return_problem")}>
                    {#each issues as issue}
                        <button type="button" class:selected={selectedIssue === issue} aria-pressed={selectedIssue === issue} disabled={submitting} on:click={() => selectReason("payment_issue", issue)}>{$t(`auth.bmc_feedback_issue_${issue}`)}</button>
                    {/each}
                </div>
                {#if selectedIssue}<p>{$t("auth.bmc_feedback_issue_help")}</p><a href={supportUrl}>{$t("auth.bmc_feedback_open")}</a>{/if}
            {:else}
                <h3>{$t("auth.bmc_return_abandon_title")}</h3>
                <p>{$t("auth.bmc_return_optional")}</p>
                <div class="choices" role="group" aria-label={$t("auth.bmc_return_abandon_title")}>
                    {#each abandonReasons as reason}
                        <button type="button" class:selected={selectedReason === reason} aria-pressed={selectedReason === reason} disabled={submitting} on:click={() => selectReason(reason)}>{$t(`auth.bmc_feedback_reason_${reason}`)}</button>
                    {/each}
                </div>
                {#if selectedReason === "trust"}<p>{$t("auth.bmc_payment_destination")}</p><p>{$t("auth.bmc_feedback_trust_help")}</p>{/if}
                <button type="button" class="text-button" disabled={submitting} on:click={onClose}>{$t("auth.bmc_return_skip")}</button>
            {/if}
            {#if done}
                <p role="status">{$t("auth.bmc_feedback_thanks")}</p>
            {:else if selectedReason && !checking}
                <details class="note">
                    <summary>{$t("auth.bmc_feedback_note")}</summary>
                    <label><span class="sr-only">{$t("auth.bmc_feedback_note")}</span><textarea bind:value={note} maxlength="500" rows="3" disabled={submitting}></textarea></label>
                </details>
                <button type="button" class="primary" disabled={submitting || statusError} on:click={submit}>{$t(submitting ? "auth.loading" : "auth.bmc_return_submit")}</button>
                {#if failed}<p role="alert">{$t("auth.bmc_feedback_error")}</p>{/if}
            {/if}
        </div>
    {/if}
    {#if checkoutUrl}
        <a class="continue" href={checkoutUrl} target="_blank" rel="noreferrer noopener nofollow" on:click={onCheckout}>{$t("auth.bmc_return_continue")}</a>
    {/if}
    <details class="purchase-details">
        <summary>{$t("auth.bmc_return_details")}</summary>
        <p>{$t("auth.bmc_payment_destination")}</p>
        <p>{$t("auth.bmc_feedback_trust_help")}</p>
        <p class="email">{accountEmail}</p>
    </details>
</section>

<style>
    .return-help { display: grid; gap: 20px; color: var(--text); font-size: .9rem; }
    header, .step, .actions { display: grid; gap: 12px; }
    h2, h3, p { margin: 0; color: inherit; }
    h2 { font-size: 1.3rem; line-height: 1.35; }
    h3 { font-size: 1rem; }
    p { line-height: 1.55; }
    header > p, .purchase-details { color: var(--subtext); }
    .summary { font-weight: 600; }
    button { cursor: pointer; font: inherit; text-align: start; padding: 12px 14px; color: var(--text); background: var(--button); border: 1px solid var(--surface-2); border-radius: 10px; overflow-wrap: anywhere; }
    button:disabled { opacity: .6; cursor: default; }
    .primary { background: var(--secondary-600, #4f7f1c); color: #fff; border-color: transparent; font-weight: 700; text-align: center; }
    .choices { display: grid; gap: 8px; }
    .choices .selected { border-color: var(--green); box-shadow: inset 0 0 0 1px var(--green); }
    .text-button { justify-self: start; padding: 4px 0; border: 0; background: transparent; text-decoration: underline; }
    a { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }
    .continue { text-align: center; }
    .status-message { padding: 12px; border-radius: 10px; background: var(--surface-1); display: grid; gap: 10px; }
    .paid-status { min-height: 2.8em; }
    details { font-size: .85rem; }
    summary { cursor: pointer; }
    details p, textarea { margin-top: 10px; }
    textarea { width: 100%; box-sizing: border-box; resize: vertical; color: var(--text); background: var(--surface-1); border: 1px solid var(--surface-2); border-radius: 6px; padding: 8px; font: inherit; }
    .email { overflow-wrap: anywhere; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
</style>
