<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { page } from "$app/stores";

    import { t } from "$lib/i18n/translations";
    import {
        clerkEnabled,
        clerkLoaded,
        clerkUser,
        getClerkToken,
        initClerk,
        openUserProfile,
        signIn,
        signOut,
        signUp,
    } from "$lib/state/clerk";
    import { currentApiURL } from "$lib/api/api-url";

    import IconUserCircle from "@tabler/icons-svelte/IconUserCircle.svelte";
    import IconLogin from "@tabler/icons-svelte/IconLogin.svelte";
    import IconUserPlus from "@tabler/icons-svelte/IconUserPlus.svelte";
    import IconLogout from "@tabler/icons-svelte/IconLogout.svelte";
    import IconSettings from "@tabler/icons-svelte/IconSettings.svelte";
    import QRCode from "qrcode";

    type CreditProduct = {
        key: string;
        points: number;
        amountFen: number;
        currency: string;
        unitPriceFen: number;
    };

    type CreditOrder = {
        id: number;
        points: number;
        amount_fen: number;
        currency: string;
        status: string;
        out_trade_no: string;
    };

    let autoAuthLaunched = false;

    onMount(() => {
        if (clerkEnabled) {
            initClerk();
        }

        void fetchCreditProducts();

        const wantsSignIn = $page.url.searchParams.get("signin") === "1";
        const wantsSignUp = $page.url.searchParams.get("signup") === "1";

        if (!autoAuthLaunched && (wantsSignIn || wantsSignUp)) {
            autoAuthLaunched = true;
            if (wantsSignUp) {
                void signUp(getRedirectForSignUp());
            } else {
                void signIn(getRedirectForSignIn());
            }
        }
    });

    const getSafeRedirectUrl = () => {
        const raw = $page.url.searchParams.get("redirect");
        if (!raw) return $page.url.href;
        if (!raw.startsWith("/") || raw.startsWith("//")) return $page.url.href;

        try {
            const url = new URL(raw, $page.url.origin);
            if (url.origin !== $page.url.origin) return $page.url.href;
            return url.toString();
        } catch {
            return $page.url.href;
        }
    };

    const getRedirectForSignIn = () => {
        const redirectUrl = getSafeRedirectUrl();
        return {
            fallbackRedirectUrl: redirectUrl,
            signUpFallbackRedirectUrl: redirectUrl,
        };
    };

    const getRedirectForSignUp = () => {
        const redirectUrl = getSafeRedirectUrl();
        return {
            fallbackRedirectUrl: redirectUrl,
            signInFallbackRedirectUrl: redirectUrl,
        };
    };

    let points: number | null = null;
    let pointsErrorKey = "";
    let pointsLoading = false;
    let lastPointsUserId: string | null = null;

    const fetchPoints = async () => {
        const userId = $clerkUser?.id;
        if (!userId) return;
        if (lastPointsUserId === userId) return;

        pointsLoading = true;
        pointsErrorKey = "";
        try {
            const token = await getClerkToken();
            if (!token) throw new Error("missing token");

            const apiBase = currentApiURL();
            const res = await fetch(`${apiBase}/user/me`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                throw new Error(data?.error?.message || "failed to load points");
            }

            points = data.data?.user?.points ?? null;
            lastPointsUserId = userId;
        } catch (error) {
            pointsErrorKey = "auth.points_load_failed";
            console.debug("load points failed", error);
        } finally {
            pointsLoading = false;
        }
    };

    $: if ($clerkUser) {
        void fetchPoints();
    } else {
        points = null;
        lastPointsUserId = null;
    }

    const formatCny = (fen: number) => (fen / 100).toFixed(2);

    let creditProducts: CreditProduct[] = [];
    let creditProductsLoading = false;
    let creditProductsErrorKey = "";

    const fetchCreditProducts = async () => {
        creditProductsLoading = true;
        creditProductsErrorKey = "";

        try {
            const apiBase = currentApiURL();
            const res = await fetch(`${apiBase}/payments/credits/products`);
            const data = await res.json().catch(() => ({}));

            if (!res.ok || data?.status !== "success") {
                throw new Error(
                    data?.error?.message || "failed to load credit products",
                );
            }

            creditProducts = Array.isArray(data?.data?.products)
                ? data.data.products
                : [];
        } catch (error) {
            creditProductsErrorKey = "auth.credit_products_load_failed";
            console.debug("load credit products failed", error);
        } finally {
            creditProductsLoading = false;
        }
    };

    let purchaseLoading = false;
    let purchaseErrorKey = "";
    let activeOrder: CreditOrder | null = null;
    let codeUrl = "";
    let qrDataUrl = "";
    let orderStatusLoading = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
        if (!pollTimer) return;
        clearInterval(pollTimer);
        pollTimer = null;
    };

    const clearActiveOrder = () => {
        stopPolling();
        activeOrder = null;
        codeUrl = "";
        qrDataUrl = "";
        purchaseErrorKey = "";
        orderStatusLoading = false;
    };

    onDestroy(() => {
        stopPolling();
    });

    const fetchOrderStatus = async (orderId: number, sync = false) => {
        if (!orderId) return;

        orderStatusLoading = true;
        try {
            const token = await getClerkToken();
            if (!token) throw new Error("missing token");

            const apiBase = currentApiURL();
            const url = new URL(
                `${apiBase}/payments/credits/orders/${orderId}`,
                window.location.origin,
            );
            if (sync) {
                url.searchParams.set("sync", "1");
            }
            const res = await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                throw new Error(
                    data?.error?.message || "failed to load order status",
                );
            }

            const order = data?.data?.order as CreditOrder | undefined;
            if (order) {
                activeOrder = order;
                if (order.status === "PAID") {
                    stopPolling();
                    lastPointsUserId = null;
                    void fetchPoints();
                }
            }
        } catch (error) {
            console.debug("load order status failed", error);
        } finally {
            orderStatusLoading = false;
        }
    };

    const startPolling = (orderId: number) => {
        stopPolling();
        pollTimer = setInterval(() => void fetchOrderStatus(orderId), 2000);
    };

    const startWechatPay = async (productKey: string) => {
        if (purchaseLoading) return;
        if (!$clerkUser) return;
        if (activeOrder?.status === "CREATED") return;

        purchaseLoading = true;
        purchaseErrorKey = "";

        try {
            const token = await getClerkToken();
            if (!token) throw new Error("missing token");

            const apiBase = currentApiURL();
            const res = await fetch(`${apiBase}/payments/credits/wechat/native`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ productKey }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                throw new Error(data?.error?.message || "failed to create order");
            }

            const order = data?.data?.order as CreditOrder | undefined;
            const receivedCodeUrl = data?.data?.wechat?.codeUrl as string | undefined;
            if (!order?.id || !receivedCodeUrl) {
                throw new Error("invalid create order response");
            }

            activeOrder = order;
            codeUrl = receivedCodeUrl;
            qrDataUrl = await QRCode.toDataURL(receivedCodeUrl, {
                width: 220,
                margin: 1,
                color: { dark: "#000000", light: "#ffffff" },
            });

            startPolling(order.id);
        } catch (error) {
            purchaseErrorKey = "auth.payment_create_failed";
            console.debug("create wechat pay order failed", error);
        } finally {
            purchaseLoading = false;
        }
    };
</script>

<svelte:head>
    <title>{$t("auth.title")} - 竹子下载</title>
    <meta name="description" content={$t("auth.subtitle")} />
</svelte:head>

<div class="account-container">
    <header class="header">
        <h1 class="title">
            <IconUserCircle size={30} />
            <span>{$t("auth.title")}</span>
        </h1>
        <div class="subtext subtitle">{$t("auth.subtitle")}</div>
    </header>

    {#if !clerkEnabled}
        <section class="card">
            <h2 class="card-title">{$t("auth.not_configured")}</h2>
            <div class="subtext card-subtitle">
                {$t("auth.not_configured_hint")}
            </div>
        </section>
    {:else if !$clerkLoaded}
        <section class="card">
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </section>
    {:else if $clerkUser}
        <section class="card user-card">
            <div class="account-summary">
                <div class="user-row">
                    {#if $clerkUser.imageUrl}
                        <img
                            class="avatar"
                            src={$clerkUser.imageUrl}
                            alt=""
                            referrerpolicy="no-referrer"
                        />
                    {:else}
                        <div class="avatar fallback" aria-hidden="true">
                            <IconUserCircle size={28} />
                        </div>
                    {/if}

                    <div class="user-meta">
                        <div class="user-label">{$t("auth.signed_in_as")}</div>
                        <div class="user-value">
                            {$clerkUser.fullName ||
                                $clerkUser.username ||
                                $clerkUser.primaryEmailAddress?.emailAddress ||
                                $clerkUser.id}
                        </div>
                    </div>
                </div>

                <div class="points-card">
                    <div class="points-label">
                        {$t("auth.points_label")}
                    </div>
                    {#if pointsLoading}
                        <div class="points-value loading">...</div>
                    {:else if pointsErrorKey}
                        <div class="points-value error">{$t(pointsErrorKey)}</div>
                    {:else if points !== null}
                        <div class="points-value">{points}</div>
                    {:else}
                        <div class="points-value muted">--</div>
                    {/if}
                </div>
            </div>

            <div class="actions">
                <button
                    class="button elevated"
                    on:click={() => openUserProfile()}
                >
                    <IconSettings size={18} />
                    {$t("auth.manage")}
                </button>
                <button class="button elevated" on:click={signOut}>
                    <IconLogout size={18} />
                    {$t("auth.sign_out")}
                </button>
            </div>
        </section>

        <section class="card topup-card">
                <div class="topup-header">
                    <div class="topup-title">
                        {$t("auth.topup_title")}
                    </div>
                    <div class="subtext topup-subtitle">
                        {$t("auth.topup_subtitle")}
                    </div>
                </div>

            {#if creditProductsLoading}
                <div class="subtext">{$t("auth.loading")}</div>
            {:else if creditProductsErrorKey}
                <div class="subtext error">{$t(creditProductsErrorKey)}</div>
            {:else}
                <div class="products-grid">
                    {#each creditProducts as product (product.key)}
                        {@const isTest = product.key.startsWith("points_test_")}
                        {@const isBest = !isTest && product.points >= 1000}
                        {@const isRecommended =
                            !isTest && !isBest && product.points >= 500}

                        <div class="product-card">
                            <div class="product-main">
                                <div class="product-left">
                                    <div class="product-points">
                                        {product.points} {$t("auth.points_label")}
                                    </div>
                                    <div class="subtext product-subtitle">
                                        {#if product.unitPriceFen === 2}
                                            {$t("auth.unit_price_2_fen")}
                                        {:else if product.unitPriceFen === 1}
                                            {$t("auth.unit_price_1_fen")}
                                        {:else if product.unitPriceFen === 0.8}
                                            {$t("auth.unit_price_0_8_fen")}
                                        {:else}
                                            --
                                        {/if}
                                    </div>
                                </div>
                                <div class="product-right">
                                    {#if isTest}
                                        <span class="badge test">{$t("auth.badge_test")}</span>
                                    {:else if isBest}
                                        <span class="badge best">{$t("auth.badge_best")}</span>
                                    {:else if isRecommended}
                                        <span class="badge rec">{$t("auth.badge_recommended")}</span>
                                    {/if}
                                    <div class="product-price">
                                        ¥{formatCny(product.amountFen)}
                                    </div>
                                </div>
                            </div>

                            <div class="product-actions">
                                <button
                                    class="button elevated active"
                                    disabled={purchaseLoading ||
                                        activeOrder?.status === "CREATED"}
                                    on:click={() => startWechatPay(product.key)}
                                >
                                    {$t("auth.wechat_pay")}
                                </button>
                                {#if $page.params.lang !== "zh"}
                                    <button
                                        class="button elevated ghost"
                                        disabled
                                        title={$t("auth.polar_coming_soon")}
                                    >
                                        Polar
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}

            {#if purchaseErrorKey}
                <div class="subtext error">{$t(purchaseErrorKey)}</div>
            {/if}
        </section>

        {#if activeOrder}
            <div
                class="payment-overlay"
                role="presentation"
                on:click={clearActiveOrder}
            >
                <div class="payment-modal" on:click|stopPropagation>
                    <div class="payment-header">
                        <div class="payment-title">{$t("auth.wechat_qr_pay_title")}</div>
                        <button class="button elevated" on:click={clearActiveOrder}>
                            {$t("auth.close")}
                        </button>
                    </div>

                    <div class="subtext payment-subtitle">
                        {$t("auth.order_no")} {activeOrder.id} · ¥{formatCny(activeOrder.amount_fen)} ·
                        {activeOrder.points} {$t("auth.points_label")}
                    </div>

                    <div class="payment-body">
                        <div class="payment-qr">
                            {#if activeOrder.status === "PAID"}
                                <div class="payment-success">
                                    {$t("auth.payment_success")}
                                </div>
                            {:else if qrDataUrl}
                                <img
                                    class="payment-qr-image"
                                    src={qrDataUrl}
                                    alt={$t("auth.wechat_qr_alt")}
                                />
                            {:else}
                                <div class="payment-qr-placeholder">
                                    {$t("auth.qr_generating")}
                                </div>
                            {/if}

                            {#if activeOrder.status !== "PAID" && codeUrl}
                                <a
                                    class="subtext payment-codeurl"
                                    href={codeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {$t("auth.open_payment_link")}
                                </a>
                            {/if}
                        </div>

                        <div class="payment-status">
                            {#if activeOrder.status === "PAID"}
                                <div class="subtext payment-hint">
                                    {$t("auth.payment_paid_hint")}
                                </div>
                            {:else}
                                <div class="payment-wait">{$t("auth.payment_waiting")}</div>
                                <div class="subtext payment-hint">
                                    {$t("auth.payment_waiting_hint")}
                                </div>
                            {/if}

                            <div class="payment-actions">
                                <button
                                    class="button elevated"
                                    on:click={() =>
                                        void fetchOrderStatus(activeOrder.id, true)}
                                    disabled={orderStatusLoading}
                                >
                                    {$t("auth.check_status")}
                                </button>
                                <button class="button elevated" on:click={clearActiveOrder}>
                                    {$t(activeOrder.status === "PAID" ? "auth.done" : "auth.cancel")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    {:else}
        <section class="card">
            <div class="actions">
                <button
                    class="button elevated"
                    on:click={() => signIn(getRedirectForSignIn())}
                >
                    <IconLogin size={18} />
                    {$t("auth.sign_in")}
                </button>
                <button
                    class="button elevated active"
                    on:click={() => signUp(getRedirectForSignUp())}
                >
                    <IconUserPlus size={18} />
                    {$t("auth.sign_up")}
                </button>
            </div>
        </section>
    {/if}
</div>

<style>
    .account-container {
        max-width: 720px;
        margin: 0 auto;
        padding: 2rem 1rem;
        width: 100%;
    }

    .header {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 18px;
    }

    .title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0;
        font-size: 1.6rem;
        letter-spacing: -0.5px;
        color: var(--text);
    }

    .subtitle {
        padding: 0;
        color: var(--subtext);
    }

    .card {
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        border-radius: calc(var(--border-radius) + 6px);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .card-title {
        margin: 0;
        font-size: 1rem;
        color: var(--text);
    }

    .card-subtitle {
        padding: 0;
    }

    .user-row {
        display: flex;
        align-items: center;
        gap: 14px;
    }

    .avatar {
        width: 44px;
        height: 44px;
        border-radius: 999px;
        object-fit: cover;
        background: var(--button);
        box-shadow: var(--button-box-shadow);
    }

    .avatar.fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text);
    }

    .user-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .user-label {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--subtext);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .user-value {
        font-weight: 600;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .actions :global(button) {
        height: 42px;
        padding: 0 14px;
        gap: 8px;
    }

    .user-card,
    .topup-card {
        gap: 18px;
        overflow: hidden;
    }

    .account-summary {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 14px;
    }

    .points-card {
        min-width: 120px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--surface-2);
        background: radial-gradient(
                120px 80px at top right,
                rgba(0, 0, 0, 0.08),
                transparent
            ),
            var(--surface-1);
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: flex-end;
        text-align: right;
    }

    .points-label {
        color: var(--subtext);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
    }

    .points-value {
        color: var(--secondary);
        font-size: 20px;
        font-weight: 900;
        letter-spacing: -0.02em;
        line-height: 1.1;
    }

    .points-value.muted {
        color: var(--gray);
    }

    .points-value.error {
        color: var(--red);
        font-size: 14px;
        font-weight: 700;
    }

    .topup-title {
        font-weight: 900;
        font-size: 16px;
        color: var(--text);
        letter-spacing: -0.01em;
    }

    .topup-subtitle {
        padding: 0;
    }

    .products-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
    }

    .product-card {
        padding: 14px;
        border-radius: 18px;
        border: 1px solid var(--surface-2);
        background: radial-gradient(
                120px 80px at top right,
                rgba(0, 0, 0, 0.06),
                transparent
            ),
            var(--surface-1);
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition:
            transform 0.2s ease,
            border-color 0.2s ease;
    }

    .product-card:hover {
        border-color: var(--popup-stroke);
        transform: translateY(-1px);
    }

    .product-main {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 12px;
        align-items: start;
    }

    .product-points {
        font-weight: 900;
        color: var(--text);
        letter-spacing: -0.01em;
    }

    .product-price {
        font-weight: 900;
        color: var(--secondary);
        letter-spacing: -0.02em;
    }

    .product-subtitle {
        padding: 0;
        opacity: 0.85;
    }

    .product-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }

    .product-right {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
    }

    .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 20px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.02em;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
        color: var(--subtext);
    }

    .badge.test {
        border-color: var(--yellow);
        color: var(--yellow);
    }

    .badge.best {
        border-color: var(--green);
        color: var(--green);
    }

    .badge.rec {
        border-color: var(--blue);
        color: var(--blue);
    }

    .product-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .product-actions :global(button) {
        height: 40px;
        padding: 0 14px;
        flex: 1;
        min-width: 120px;
        justify-content: center;
    }

    .product-actions :global(button.ghost) {
        background: transparent !important;
        box-shadow: none !important;
        border: 1px solid var(--surface-2) !important;
        color: var(--subtext) !important;
    }

    .payment-overlay {
        position: fixed;
        inset: 0;
        z-index: 120;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--padding);
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
    }

    .payment-modal {
        width: min(720px, calc(100% - var(--padding) * 2));
        border-radius: 24px;
        background: var(--popup-bg);
        box-shadow:
            0 0 0 2px var(--popup-stroke) inset,
            0 28px 80px rgba(0, 0, 0, 0.55);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .payment-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .payment-title {
        font-weight: 900;
        color: var(--text);
        letter-spacing: -0.02em;
        font-size: 16px;
    }

    .payment-subtitle {
        padding: 0;
    }

    .payment-body {
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 16px;
        align-items: stretch;
    }

    .payment-qr {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
    }

    .payment-qr-image {
        width: 240px;
        height: 240px;
        padding: 12px;
        background: #ffffff;
        border-radius: 18px;
        box-shadow: 0 0 0 1px var(--surface-2) inset;
    }

    .payment-qr-placeholder {
        width: 240px;
        height: 240px;
        border-radius: 18px;
        border: 1px dashed var(--surface-2);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--subtext);
        font-weight: 700;
    }

    .payment-codeurl {
        padding: 0;
    }

    .payment-status {
        display: flex;
        flex-direction: column;
        gap: 10px;
        justify-content: space-between;
    }

    .payment-success {
        color: var(--green);
        font-weight: 900;
        font-size: 15px;
    }

    .payment-wait {
        color: var(--secondary);
        font-weight: 900;
        font-size: 15px;
    }

    .payment-hint {
        padding: 0;
    }

    .payment-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }

    .payment-actions :global(button) {
        height: 40px;
        padding: 0 14px;
        flex: 1;
        justify-content: center;
        min-width: 120px;
    }

    .skeleton-line {
        height: 14px;
        border-radius: 999px;
        background: var(--skeleton-gradient);
        animation: shimmer 1.2s linear infinite;
        background-size: 200% 100%;
    }

    .skeleton-line.short {
        width: 60%;
    }

    @keyframes shimmer {
        0% {
            background-position: 200% 0;
        }
        100% {
            background-position: -200% 0;
        }
    }

    @media screen and (max-width: 535px) {
        .account-container {
            padding: 1.2rem 0;
        }

        .title {
            font-size: 1.35rem;
        }

        .account-summary {
            grid-template-columns: 1fr;
        }

        .points-card {
            width: 100%;
            align-items: flex-start;
            text-align: left;
        }

        .products-grid {
            grid-template-columns: 1fr;
        }

        .payment-modal {
            padding: 14px;
            width: calc(100% - var(--padding) * 2);
        }

        .payment-body {
            grid-template-columns: 1fr;
        }

        .payment-qr-image,
        .payment-qr-placeholder {
            width: 220px;
            height: 220px;
        }

        .actions :global(button) {
            flex: 1;
        }
    }
</style>
