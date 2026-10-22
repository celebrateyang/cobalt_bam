<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { t } from "$lib/i18n/translations";
    import { currentApiURL } from "$lib/api/api-url";
    import { accountPath, fetchCurrentUserPointsProfile } from "$lib/points/ui";
    import { selectCreditOffer, selectPassOffer, OFFER_PROVIDER, SHARE_REWARD_POINTS } from "$lib/points/download-offer.mjs";
    import { trackTopupPrompt, trackShareRewardStep } from "$lib/analytics/commerce";
    import DialogContainer from "./DialogContainer.svelte";
    import ShareRewardPanel from "$components/points/ShareRewardPanel.svelte";

    export let id: string;
    export let currentPoints: number;
    export let requiredPoints: number;
    export let redirectPath: string | null = null;
    type Offer = { key: string; points?: number; durationDays?: number; amountFen: number; currency: string;
        limits?: { dailySuccessfulDownloads?: number } };
    let credit: Offer | undefined;
    let pass: Offer | undefined;
    let loading = true;
    let failed = false;
    let busy = false;
    let sharing = false;
    let claimOpened = false;
    let checking = false;
    let balanceMessage = "";
    let purchaseError = "";
    let close: () => void;
    let disposed = false;
    const controller = new AbortController();
    $: gap = Math.max(0, requiredPoints - currentPoints);
    const price = (product: Offer) => new Intl.NumberFormat($page.params.lang || "en", {
        style: "currency", currency: product.currency, currencyDisplay: "code",
    }).format(product.amountFen / 100);

    async function products(kind: string) {
        const response = await fetch(`${currentApiURL()}/payments/${kind}/products?provider=${OFFER_PROVIDER}`, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        const data = await response.json();
        if (!response.ok || data?.status !== "success" || !Array.isArray(data?.data?.products)) throw new Error("products unavailable");
        return data.data.products;
    }

    async function load() {
        loading = true; failed = false;
        const [credits, passes, profile] = await Promise.allSettled([
            products("credits"), products("memberships"), fetchCurrentUserPointsProfile(),
        ]);
        if (disposed) return;
        credit = credits.status === "fulfilled" ? selectCreditOffer(credits.value, gap) : undefined;
        // Do not offer an additional pass when membership state is unknown or active.
        pass = passes.status === "fulfilled" && profile.status === "fulfilled" && profile.value && !profile.value.membershipActive
            ? selectPassOffer(passes.value) : undefined;
        failed = credits.status === "rejected" || passes.status === "rejected" || profile.status === "rejected" ||
            (profile.status === "fulfilled" && !profile.value);
        loading = false;
    }
    onMount(() => { void load(); return () => { disposed = true; controller.abort(); }; });

    async function buy(kind: "credit" | "membership") {
        if (busy) return;
        busy = true;
        purchaseError = "";
        trackTopupPrompt(kind === "credit" ? "topup" : "membership", "single_download", currentPoints, requiredPoints);
        const target = new URL(accountPath(kind === "credit" ? "topup" : "membership", redirectPath,
            kind === "credit" ? "credit_199" : "membership_3day"), window.location.origin);
        target.searchParams.set("provider", OFFER_PROVIDER);
        try { await goto(`${target.pathname}${target.search}`); close(); }
        catch { busy = false; purchaseError = $t("dialog.offer.load_failed"); }
    }

    async function checkBalance() {
        if (checking) return;
        checking = true; balanceMessage = "";
        try {
            const profile = await fetchCurrentUserPointsProfile();
            if (!profile || profile.points === null) throw new Error("balance unavailable");
            currentPoints = profile.points;
            if (profile.membershipActive || currentPoints >= requiredPoints) {
                // The original single-download intent survives this reload in session storage.
                const safePath = redirectPath?.startsWith("/") && !redirectPath.startsWith("//") ? redirectPath : `/${$page.params.lang}/`;
                window.location.assign(safePath);
                return;
            }
            balanceMessage = $t("dialog.offer.balance_pending", { current: currentPoints, gap: Math.max(0, requiredPoints - currentPoints) });
        } catch { balanceMessage = $t("dialog.offer.load_failed"); }
        finally { checking = false; }
    }
</script>

<DialogContainer {id} managedCancel={true} ariaLabel={sharing ? $t("dialog.offer.share_title", { count: SHARE_REWARD_POINTS }) : $t("dialog.offer.title")} bind:close>
    <div class="dialog-body offer-dialog">
        <header>
            <h2>{sharing ? $t("dialog.offer.share_title", { count: SHARE_REWARD_POINTS }) : $t("dialog.offer.title")}</h2>
            <button class="close" aria-label={$t("dialog.offer.close")} on:click={() => { trackTopupPrompt("dismiss", "single_download", currentPoints, requiredPoints); close(); }}>&times;</button>
        </header>
        <div class="offer-content" class:sharing aria-busy={loading && !sharing}>
            {#if sharing}
                <ShareRewardPanel source="single_download" showTitle={false} on:claim={() => claimOpened = true} />
                {#if claimOpened}
                    <button class="button elevated" disabled={checking} on:click={checkBalance}>{$t("dialog.offer.check_balance")}</button>
                    <p role="status">{balanceMessage}</p>
                {/if}
                <button class="text-button" on:click={() => sharing = false}>{$t("dialog.offer.back")}</button>
            {:else}
                <div class="purchase-options">
                <p class="balance">{$t("dialog.offer.balance", { current: currentPoints, required: requiredPoints, gap })}</p>
                {#if loading}
                    <p role="status">{$t("dialog.offer.loading")}</p>
                {:else}
                    {#if pass}
                        <section class="plan recommended">
                            <span class="badge">{$t("dialog.offer.recommended")}</span>
                            <div class="plan-heading"><h3>{$t("dialog.offer.pass_title", { days: pass.durationDays })}</h3>
                            <strong class="price">{price(pass)}</strong></div>
                            <p>{$t("dialog.offer.pass_body", { days: pass.durationDays })}</p>
                            <p>{$t("dialog.offer.pass_limit", { count: pass.limits?.dailySuccessfulDownloads })}</p>
                            <p class="note">{$t("dialog.offer.one_time")}</p>
                            <button class="button elevated active" disabled={busy} on:click={() => buy("membership")}>{$t("dialog.offer.buy_pass", { days: pass.durationDays })}</button>
                        </section>
                    {/if}
                    {#if credit}
                        <section class="plan">
                            <div class="plan-heading"><h3>{$t("dialog.offer.credit_title", { count: credit.points })}</h3>
                            <strong class="price">{price(credit)}</strong></div>
                            <p>{$t("dialog.offer.credit_body")}</p>
                            <button class="button elevated" class:active={!pass} disabled={busy} on:click={() => buy("credit")}>{$t("dialog.offer.buy_credit", { count: credit.points })}</button>
                        </section>
                    {/if}
                    {#if failed || (!credit && !pass)}
                        <p role="status">{$t("dialog.offer.load_failed")}</p>
                        <button class="text-button" on:click={load}>{$t("dialog.offer.retry")}</button>
                    {/if}
                {/if}
                {#if purchaseError}<p role="alert">{purchaseError}</p>{/if}
                </div>
                <section class="free-option">
                    <h3>{$t("dialog.offer.share_title", { count: SHARE_REWARD_POINTS })}</h3>
                    <p>{$t("dialog.offer.share_summary")}</p>
                    <button class="button elevated" on:click={() => { sharing = true; trackShareRewardStep("view", "single_download"); }}>
                        {$t("dialog.offer.share_claim", { count: SHARE_REWARD_POINTS })}
                    </button>
                </section>
            {/if}
        </div>
    </div>
</DialogContainer>

<style>
    .offer-dialog { width: min(440px, calc(100% - 24px)); box-sizing: border-box; max-height: 90dvh; display: flex; flex-direction: column; align-items: stretch; text-align: left; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-shrink: 0; padding-bottom: 12px; }
    h2 { margin: 0; font-size: 21px; line-height: 1.4; }
    .close { background: none; border: 0; color: inherit; font-size: 26px; min-width: 36px; min-height: 36px; cursor: pointer; }
    .offer-content { overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 14px; padding: 2px; }
    .offer-content:not(.sharing) { overflow-y: hidden; }
    .purchase-options { overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 2px; }
    .plan-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
    h3, p { margin: 0; }
    h3 { font-size: 17px; line-height: 1.4; }
    p { font-size: 13px; line-height: 1.6; }
    .balance, .note { color: var(--subtext); }
    .plan { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--button-stroke); border-radius: 14px; background: var(--button-elevated); flex-shrink: 0; }
    .recommended { border-color: var(--accent); }
    .badge { position: absolute; top: -8px; right: 12px; padding: 0 6px; background: var(--popup-bg); color: var(--accent); font-size: 11px; line-height: 16px; font-weight: 700; }
    .price { font-size: 22px; white-space: nowrap; }
    .button { height: auto; min-height: 44px; padding: 10px 14px; white-space: normal; line-height: 1.4; }
    .free-option { display: flex; flex-direction: column; flex-shrink: 0; gap: 8px; padding-top: 12px; border-top: 1px solid var(--button-stroke); }
    .text-button { background: none; border: 0; color: var(--text); padding: 6px; min-height: 32px; cursor: pointer; text-decoration: underline; font-size: 13px; flex-shrink: 0; }
</style>
