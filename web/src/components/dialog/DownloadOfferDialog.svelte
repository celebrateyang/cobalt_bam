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
    import OfferIcon from "$components/points/OfferIcon.svelte";
    import "$lib/points/offer-controls.css";

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
    let busyAction: "credit" | "membership" | "all_plans" | null = null;
    $: busy = busyAction !== null;
    let sharing = false;
    let claimOpened = false;
    let checking = false;
    let balanceMessage = "";
    let purchaseError = "";
    let close: () => void;
    let disposed = false;
    let scrollArea: HTMLDivElement;
    let canScrollFurther = false;

    function observeOverflow(node: HTMLDivElement) {
        const update = () => {
            canScrollFurther = node.scrollHeight - node.clientHeight - node.scrollTop > 4;
        };
        const observer = new ResizeObserver(update);
        observer.observe(node);
        if (node.firstElementChild) observer.observe(node.firstElementChild);
        node.addEventListener("scroll", update, { passive: true });
        update();
        return { destroy() { observer.disconnect(); node.removeEventListener("scroll", update); } };
    }

    function scrollForMore() {
        scrollArea.scrollBy({ top: scrollArea.clientHeight * 0.7,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }

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
        if (busyAction) return;
        busyAction = kind;
        purchaseError = "";
        try {
            try { trackTopupPrompt(kind === "credit" ? "topup" : "membership", "single_download", currentPoints, requiredPoints); } catch { /* Best-effort analytics. */ }
            const target = new URL(accountPath(kind === "credit" ? "topup" : "membership", redirectPath,
                kind === "credit" ? "credit_199" : "membership_3day"), window.location.origin);
            target.searchParams.set("provider", OFFER_PROVIDER);
            await goto(`${target.pathname}${target.search}`);
            close();
        } catch { busyAction = null; purchaseError = $t("dialog.offer.load_failed"); }
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

    async function viewAllPlans() {
        if (busyAction) return;
        busyAction = "all_plans";
        purchaseError = "";
        try {
            try { trackTopupPrompt("all_plans", "single_download", currentPoints, requiredPoints); } catch { /* Best-effort analytics. */ }
            await goto(accountPath("topup", redirectPath));
            close();
        } catch {
            busyAction = null;
            purchaseError = $t("dialog.offer.load_failed");
        }
    }
</script>

<DialogContainer {id} managedCancel={true} ariaLabel={sharing ? $t("dialog.offer.share_title", { count: SHARE_REWARD_POINTS }) : $t("dialog.offer.title")} bind:close>
    <div class="dialog-body offer-dialog offer-controls">
        <header>
            <h2>{sharing ? $t("dialog.offer.share_title", { count: SHARE_REWARD_POINTS }) : $t("dialog.offer.title")}</h2>
            <button class="close" aria-label={$t("dialog.offer.close")} on:click={() => { trackTopupPrompt("dismiss", "single_download", currentPoints, requiredPoints); close(); }}>&times;</button>
        </header>
        {#if !sharing}
            <button class="offer-action all-plans" disabled={busy} aria-busy={busyAction === "all_plans"} on:click={viewAllPlans}>
                {#if busyAction === "all_plans"}<span class="offer-spinner" aria-hidden="true"></span>{/if}
                <span>{busyAction === "all_plans" ? $t("dialog.offer.opening") : $t("dialog.offer.all_plans")}</span>
                {#if busyAction !== "all_plans"}<OfferIcon name="arrow" />{/if}
            </button>
        {/if}
        <div class="offer-content" id={`offer-options-${id}`} bind:this={scrollArea} use:observeOverflow aria-busy={loading && !sharing}>
            <div class="offer-scroll-body">
            {#if sharing}
                <ShareRewardPanel source="single_download" showTitle={false} on:claim={() => claimOpened = true} />
                {#if claimOpened}
                    <button class="offer-action" disabled={checking} aria-busy={checking} on:click={checkBalance}>
                        {#if checking}<span class="offer-spinner" aria-hidden="true"></span>{/if}
                        <span>{$t("dialog.offer.check_balance")}</span>
                    </button>
                    <p role="status">{balanceMessage}</p>
                {/if}
                <button class="offer-action offer-action--link" on:click={() => sharing = false}>{$t("dialog.offer.back")}</button>
            {:else}
                <div class="purchase-options">
                <p class="balance">{$t("dialog.offer.balance", { current: currentPoints, required: requiredPoints, gap })}</p>
                {#if loading}
                    <p role="status">{$t("dialog.offer.loading")}</p>
                {:else}
                    {#if pass}
                        <section class="plan offer-card recommended">
                            <div class="plan-heading"><h3>{$t("dialog.offer.pass_title", { days: pass.durationDays })}</h3>
                            <div class="plan-price"><span class="badge">{$t("dialog.offer.recommended")}</span>
                            <strong class="price">{price(pass)}</strong></div></div>
                            <p>{$t("dialog.offer.pass_body", { days: pass.durationDays })} {$t("dialog.offer.pass_limit", { count: pass.limits?.dailySuccessfulDownloads })}</p>
                            <button class="offer-action offer-action--primary" disabled={busy} aria-busy={busyAction === "membership"} on:click={() => buy("membership")}>
                                {#if busyAction === "membership"}<span class="offer-spinner" aria-hidden="true"></span>{/if}
                                <span>{busyAction === "membership" ? $t("dialog.offer.opening") : $t("dialog.offer.buy_pass", { days: pass.durationDays })}</span>
                            </button>
                        </section>
                    {/if}
                    {#if credit}
                        <section class="plan offer-card">
                            <div class="plan-heading"><h3>{$t("dialog.offer.credit_title", { count: credit.points })}</h3>
                            <strong class="price">{price(credit)}</strong></div>
                            <p>{$t("dialog.offer.credit_body")}</p>
                            <button class="offer-action" class:offer-action--primary={!pass} disabled={busy} aria-busy={busyAction === "credit"} on:click={() => buy("credit")}>
                                {#if busyAction === "credit"}<span class="offer-spinner" aria-hidden="true"></span>{/if}
                                <span>{busyAction === "credit" ? $t("dialog.offer.opening") : $t("dialog.offer.buy_credit", { count: credit.points })}</span>
                            </button>
                        </section>
                    {/if}
                    {#if pass || credit}<p class="note">{$t("dialog.offer.one_time")}</p>{/if}
                    {#if failed || (!credit && !pass)}
                        <p role="status">{$t("dialog.offer.load_failed")}</p>
                        <button class="offer-action offer-action--link" on:click={load}>{$t("dialog.offer.retry")}</button>
                    {/if}
                {/if}
                {#if purchaseError}<p role="alert">{purchaseError}</p>{/if}
                </div>
                <section class="free-option">
                    <h3><span class="reward-icon"><OfferIcon name="gift" /></span><span>{$t("dialog.offer.share_title", { count: SHARE_REWARD_POINTS })}</span></h3>
                    <p>{$t("dialog.offer.share_summary")}</p>
                    <button class="offer-action offer-action--reward" disabled={busy} on:click={() => { sharing = true; trackShareRewardStep("view", "single_download"); }}>
                        <OfferIcon name="share" /><span>{$t("dialog.offer.share_claim", { count: SHARE_REWARD_POINTS })}</span>
                    </button>
                </section>
            {/if}
            </div>
        </div>
        {#if canScrollFurther}
            <button class="more-options" aria-controls={`offer-options-${id}`} on:click={scrollForMore}>
                <span>{$t("dialog.offer.scroll_more")}</span><span aria-hidden="true">&#8595;</span>
            </button>
        {/if}
    </div>
</DialogContainer>

<style>
    .offer-dialog { width: min(460px, calc(100% - 24px)); box-sizing: border-box; max-height: calc(100dvh - 32px - env(safe-area-inset-bottom)); display: flex; flex-direction: column; align-items: stretch; text-align: left; color: var(--text); }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-shrink: 0; padding-bottom: 8px; }
    h2 { margin: 0; font-size: 21px; line-height: 1.4; }
    .close { background: transparent; border: 1px solid var(--popup-stroke); box-shadow: none; color: var(--text); font-size: 26px; min-width: 44px; min-height: 44px; padding: 0; border-radius: 12px; cursor: pointer; transition: background-color 160ms ease, border-color 160ms ease; }
    .close:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
    .all-plans { flex-shrink: 0; justify-content: space-between; margin-bottom: 8px; border-color: color-mix(in srgb, var(--accent-strong) 50%, transparent); color: var(--offer-ink); }
    .offer-content { overflow-y: auto; min-height: 0; padding: 4px; scrollbar-width: thin; scrollbar-color: var(--accent-strong) transparent; overscroll-behavior-y: contain; }
    .offer-scroll-body, .purchase-options { display: flex; flex-direction: column; gap: 10px; }
    .more-options { display: flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0; min-height: 44px; padding: 6px 10px; border: 0; border-top: 1px solid var(--popup-stroke); background: var(--popup-bg); color: var(--offer-ink); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
    .more-options:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
    .plan-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
    .plan-heading h3 { flex: 1 1 120px; min-width: 0; }
    .plan-price { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    h3, p { margin: 0; }
    h3 { font-size: 17px; line-height: 1.4; }
    p { font-size: 13px; line-height: 1.6; }
    .balance, .note { color: var(--subtext); }
    .plan { position: relative; display: flex; flex-direction: column; gap: 7px; padding: 13px; border: 1px solid color-mix(in srgb, var(--text) 14%, transparent); border-radius: 15px; background: var(--background); box-shadow: 0 1px 3px rgb(0 0 0 / 4%); flex-shrink: 0; transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease; }
    .recommended { border-color: color-mix(in srgb, var(--accent-strong) 55%, transparent); background: color-mix(in srgb, var(--accent) 7%, var(--background)); }
    .badge { max-width: 100%; box-sizing: border-box; padding: 3px 8px; border: 1px solid color-mix(in srgb, var(--accent-strong) 25%, transparent); border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, var(--background)); color: var(--offer-ink); font-size: 10.5px; line-height: 1.25; font-weight: 700; }
    .price { font-size: 23px; white-space: nowrap; font-variant-numeric: tabular-nums; letter-spacing: -.03em; }
    .free-option { display: flex; flex-direction: column; flex-shrink: 0; gap: 8px; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent-strong) 18%, transparent); border-radius: 15px; background: color-mix(in srgb, var(--accent) 4%, var(--popup-bg)); }
    .free-option h3 { display: flex; align-items: center; gap: 9px; color: var(--offer-ink); font-size: 16px; }
    .reward-icon { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: 0 0 30px; border-radius: 9px; background: color-mix(in srgb, var(--accent) 15%, var(--popup-bg)); }
    .reward-icon :global(svg) { width: 19px; height: 19px; }
    @media (max-width: 535px) {
        .offer-dialog { --dialog-padding: 14px; }
        h2 { font-size: 19px; }
        h3 { font-size: 15px; }
        .plan { padding: 11px; gap: 6px; }
        .price { font-size: 21px; }
        .free-option { padding: 10px; }
        .free-option h3 { font-size: 14px; }
    }
    @media (hover: hover) and (pointer: fine) {
        .plan:hover { border-color: color-mix(in srgb, var(--accent-strong) 65%, transparent); box-shadow: 0 4px 12px rgb(0 0 0 / 8%); transform: translateY(-1px); }
        .close:hover { background: var(--button-hover); border-color: color-mix(in srgb, var(--text) 25%, transparent); }
    }
    @media (prefers-reduced-motion: reduce) { .close { transition: none; } }
</style>
