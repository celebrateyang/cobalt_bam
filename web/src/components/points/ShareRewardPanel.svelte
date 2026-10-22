<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { page } from "$app/stores";
    import { t } from "$lib/i18n/translations";
    import { clerkUser } from "$lib/state/clerk";
    import { WHATSAPP_CONTACT_URL } from "$lib/points/contact";
    import { SHARE_REWARD_POINTS, shareWebsiteUrl, whatsappRewardUrl } from "$lib/points/download-offer.mjs";
    import { trackShareRewardStep } from "$lib/analytics/commerce";
    import OfferIcon from "./OfferIcon.svelte";
    import "$lib/points/offer-controls.css";

    export let source: "single_download" | "account" = "account";
    export let showTitle = true;
    const dispatch = createEventDispatcher<{ claim: void }>();
    let feedback = "";
    let showCopyText = false;
    let sharing = false;
    let copying = false;
    let copied = false;
    $: websiteUrl = shareWebsiteUrl($page.params.lang);
    $: shareText = $t("dialog.offer.share_text");
    $: email = $clerkUser?.primaryEmailAddress?.emailAddress?.trim() || "";
    $: message = $t("dialog.offer.whatsapp_message", {
        count: SHARE_REWARD_POINTS,
        value: email || $t("dialog.offer.email_missing"),
    });
    $: claimUrl = whatsappRewardUrl(WHATSAPP_CONTACT_URL, message);

    async function copyLink() {
        if (copying || sharing) return;
        copying = true;
        copied = false;
        feedback = "";
        try {
            await navigator.clipboard.writeText(`${shareText}\n${websiteUrl}`);
            feedback = $t("dialog.offer.copied");
            copied = true;
            trackShareRewardStep("copied", source);
        } catch {
            showCopyText = true;
            feedback = $t("dialog.offer.copy_manual");
        } finally { copying = false; }
    }

    async function share() {
        if (sharing || copying) return;
        if (!navigator.share) { await copyLink(); return; }
        sharing = true;
        copied = false;
        feedback = "";
        try {
            trackShareRewardStep("share_opened", source);
            await navigator.share({ title: "FreeSaveVideo", text: shareText, url: websiteUrl });
            // Resolving the share sheet does not prove publication.
            trackShareRewardStep("share_returned", source);
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                trackShareRewardStep("share_cancelled", source);
            } else {
                showCopyText = true;
                feedback = $t("dialog.offer.copy_manual");
            }
        } finally { sharing = false; }
    }
</script>

<section class="share-reward offer-controls">
    {#if showTitle}<h3>{$t("dialog.offer.share_title", { count: SHARE_REWARD_POINTS })}</h3>{/if}
    <p>{$t("dialog.offer.share_step")}</p>
    <div class="share-actions">
        <button class="offer-action offer-action--reward" disabled={sharing || copying} aria-busy={sharing} on:click={share}>
            {#if sharing}<span class="offer-spinner" aria-hidden="true"></span>{:else}<OfferIcon name="share" />{/if}
            <span>{$t("dialog.offer.share_button")}</span>
        </button>
        <button class="offer-action" disabled={sharing || copying} aria-busy={copying} on:click={copyLink}>
            {#if copying}<span class="offer-spinner" aria-hidden="true"></span>{:else}<OfferIcon name={copied ? "check" : "copy"} />{/if}
            <span>{$t("dialog.offer.copy_button")}</span>
        </button>
    </div>
    {#if showCopyText}
        <textarea readonly rows="4" aria-label={$t("dialog.offer.copy_button")} value={`${shareText}\n${websiteUrl}`}></textarea>
    {/if}
    <p aria-live="polite">{feedback}</p>
    <p>{$t("dialog.offer.claim_step")}</p>
    <p class="email" data-clarity-mask="true">{$t("dialog.offer.email_label")}: <strong>{email || $t("dialog.offer.email_missing")}</strong></p>
    <a class="offer-action offer-action--primary claim" data-clarity-mask="true" href={claimUrl} target="_blank" rel="noopener noreferrer"
        on:click={() => { trackShareRewardStep("whatsapp_opened", source); dispatch("claim"); }}>
        <OfferIcon name="gift" /><span>{$t("dialog.offer.claim_button", { count: SHARE_REWARD_POINTS })}</span>
    </a>
    <p class="note">{$t("dialog.offer.review_note")}</p>
</section>

<style>
    .share-reward { display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--text); }
    h3, p { margin: 0; }
    h3 { font-size: 18px; line-height: 1.4; }
    p { font-size: 13px; line-height: 1.6; }
    .note { color: var(--subtext); }
    .email { overflow-wrap: anywhere; user-select: text; }
    .share-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .share-actions > .offer-action { flex: 1 1 150px; }
    textarea { width: 100%; box-sizing: border-box; padding: 10px; resize: vertical; user-select: text; }
    p:empty { display: none; }
</style>
