<script lang="ts">
    import { t } from "$lib/i18n/translations";
    export let feedback: unknown;
    $: data = feedback && typeof feedback === "object" ? feedback as Record<string, unknown> : null;
    const reasons = ["paid_not_received", "payment_issue", "trust", "still_paying", "not_now"];
    const issues = ["page", "method", "declined", "other"];
</script>

{#if data && reasons.includes(String(data.reason))}
    <details>
        <summary>{$t("auth.bmc_feedback_admin")}: {$t(`auth.bmc_feedback_reason_${data.reason}`)}</summary>
        {#if issues.includes(String(data.issue))}<div>{$t(`auth.bmc_feedback_issue_${data.issue}`)}</div>{/if}
        <div>{new Date(Number(data.received_at)).toLocaleString()}</div>
        {#if typeof data.note === "string" && data.note}<div class="note">{data.note}</div>{/if}
    </details>
{/if}

<style>
    details { margin-top: 6px; max-width: 24rem; font-size: .8rem; }
    summary { cursor: pointer; }
    .note { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
