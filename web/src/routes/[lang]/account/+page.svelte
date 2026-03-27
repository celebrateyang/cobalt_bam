<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { browser } from "$app/environment";
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
        enabled?: boolean;
    };

    type CreditOrder = {
        id: number;
        points: number;
        amount_fen: number;
        currency: string;
        status: string;
        out_trade_no: string;
        provider: "wechat" | "polar";
    };

    type PaymentProvider = "wechat" | "polar";

    let autoAuthLaunched = false;

    onMount(() => {
        if (clerkEnabled) {
            initClerk();
        }

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
    let referralCode: string | null = null;
    let referralLink = "";
    let referralCopyState: "idle" | "copied" | "failed" = "idle";
    let referralCopyTimer: ReturnType<typeof setTimeout> | null = null;

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
            referralCode = data.data?.user?.referral_code ?? null;
            lastPointsUserId = userId;
        } catch (error) {
            pointsErrorKey = "auth.points_load_failed";
            console.debug("load points failed", error);
        } finally {
            pointsLoading = false;
        }
    };

    $: if (browser && $clerkUser) {
        void fetchPoints();
    } else {
        points = null;
        referralCode = null;
        lastPointsUserId = null;
    }

    $: referralLink =
        referralCode && $page.params.lang
            ? `${$page.url.origin}/${$page.params.lang}/invite/${encodeURIComponent(referralCode)}`
            : "";

    const selectReferralLinkOnFocus = (event: FocusEvent) => {
        const input = event.currentTarget as HTMLInputElement | null;
        input?.select();
    };

    const copyReferralLink = async () => {
        if (!referralLink) return;

        if (referralCopyTimer) {
            clearTimeout(referralCopyTimer);
            referralCopyTimer = null;
        }

        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error("clipboard API unavailable");
            }
            await navigator.clipboard.writeText(referralLink);
            referralCopyState = "copied";
        } catch (error) {
            referralCopyState = "failed";
            console.debug("copy referral link failed", error);
        } finally {
            referralCopyTimer = setTimeout(() => {
                referralCopyState = "idle";
                referralCopyTimer = null;
            }, 1800);
        }
    };

    const formatAmount = (fen: number, currency: string) => {
        const value = Number(fen) / 100;
        if (currency === "CNY") return `\u00A5${value.toFixed(2)}`;
        try {
            return new Intl.NumberFormat(undefined, {
                style: "currency",
                currency,
            }).format(value);
        } catch {
            return `${value.toFixed(2)} ${currency}`;
        }
    };

    const formatUnitPrice = (product: CreditProduct) => {
        if (product.currency === "CNY" && product.unitPriceFen === 2) {
            return t.get("auth.unit_price_2_fen");
        }
        if (product.currency === "CNY" && product.unitPriceFen === 1) {
            return t.get("auth.unit_price_1_fen");
        }
        if (product.currency === "CNY" && product.unitPriceFen === 0.8) {
            return t.get("auth.unit_price_0_8_fen");
        }

        const points = Number(product.points) || 1;
        const unit = Number(product.amountFen) / 100 / points;
        return `${unit.toFixed(4)} ${product.currency} / pt`;
    };

    let creditProducts: CreditProduct[] = [];
    let creditProductsLoading = false;
    let creditProductsErrorKey = "";
    let selectedPaymentProvider: PaymentProvider = "wechat";
    let requestedProductsProvider: PaymentProvider | null = null;
    let bestValueProductKey: string | null = null;
    let recommendedValueProductKey: string | null = null;
    let purchaseLoading = false;
    let purchaseErrorKey = "";
    let purchaseNoticeKey = "";
    let activeOrder: CreditOrder | null = null;
    let codeUrl = "";
    let qrDataUrl = "";
    let orderStatusLoading = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let polarHandledOrderId: number | null = null;

    $: isChinese = $page.params.lang === "zh";
    $: if (!isChinese && selectedPaymentProvider !== "polar") {
        selectedPaymentProvider = "polar";
        clearActiveOrder();
    }
    $: topupSubtitleKey =
        selectedPaymentProvider === "polar"
            ? "auth.topup_subtitle_polar"
            : "auth.topup_subtitle_wechat";

    const unitPriceFenPerPoint = (product: CreditProduct) => {
        const points = Number(product.points);
        const amountFen = Number(product.amountFen);
        if (!Number.isFinite(points) || points <= 0) {
            return Number.POSITIVE_INFINITY;
        }
        if (!Number.isFinite(amountFen) || amountFen < 0) {
            return Number.POSITIVE_INFINITY;
        }
        return amountFen / points;
    };

    $: {
        const ranked = [...creditProducts]
            .filter(
                (product) =>
                    !product.key.startsWith("points_test_") &&
                    product.enabled !== false,
            )
            .sort((a, b) => {
                const unitDiff =
                    unitPriceFenPerPoint(a) - unitPriceFenPerPoint(b);
                if (Math.abs(unitDiff) > 1e-9) return unitDiff;
                return Number(b.points) - Number(a.points);
            });

        bestValueProductKey = ranked[0]?.key ?? null;
        recommendedValueProductKey = ranked[1]?.key ?? null;
    }

    const fetchCreditProducts = async () => {
        const provider = selectedPaymentProvider;
        if (!provider) return;
        if (creditProductsLoading) return;
        if (requestedProductsProvider === provider) return;

        requestedProductsProvider = provider;
        creditProductsLoading = true;
        creditProductsErrorKey = "";

        try {
            const apiBase = currentApiURL();
            const res = await fetch(
                `${apiBase}/payments/credits/products?provider=${provider}`,
            );
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

    $: if (browser && selectedPaymentProvider) {
        void fetchCreditProducts();
    }

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
        orderStatusLoading = false;
    };

    onDestroy(() => {
        stopPolling();
        if (referralCopyTimer) {
            clearTimeout(referralCopyTimer);
        }
    });

    const fetchOrderStatus = async (
        orderId: number,
        sync = false,
        showWechatModal = true,
    ): Promise<CreditOrder | null> => {
        if (!orderId) return null;

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
                if (showWechatModal && order.provider === "wechat") {
                    activeOrder = order;
                }
                if (order.status === "PAID") {
                    stopPolling();
                    lastPointsUserId = null;
                    void fetchPoints();
                }
                return order;
            }
        } catch (error) {
            console.debug("load order status failed", error);
        } finally {
            orderStatusLoading = false;
        }

        return null;
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
        purchaseNoticeKey = "";

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

    const startPolarPay = async (productKey: string) => {
        if (purchaseLoading) return;
        if (!$clerkUser) return;

        purchaseLoading = true;
        purchaseErrorKey = "";
        purchaseNoticeKey = "";

        try {
            const token = await getClerkToken();
            if (!token) throw new Error("missing token");

            const returnUrl = `${window.location.origin}/${$page.params.lang}/account`;
            const apiBase = currentApiURL();
            const res = await fetch(`${apiBase}/payments/credits/polar/checkout`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    productKey,
                    successUrl: returnUrl,
                    returnUrl,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                const error = new Error(
                    data?.error?.message || "failed to create polar checkout",
                ) as Error & { apiCode?: string };
                error.apiCode = data?.error?.code;
                throw error;
            }

            const checkoutUrl = data?.data?.polar?.checkoutUrl as string | undefined;
            if (!checkoutUrl) {
                throw new Error("missing checkout url");
            }

            purchaseNoticeKey = "auth.polar_redirecting";
            window.location.assign(checkoutUrl);
        } catch (error) {
            const apiCode = (error as { apiCode?: string })?.apiCode;
            purchaseErrorKey =
                apiCode === "POLAR_PRODUCT_NOT_CONFIGURED"
                    ? "auth.polar_not_ready"
                    : "auth.payment_create_failed";
            console.debug("create polar checkout failed", error);
            purchaseLoading = false;
        }
    };

    const selectPaymentProvider = (provider: PaymentProvider) => {
        if (!isChinese) return;
        if (provider === selectedPaymentProvider) return;

        selectedPaymentProvider = provider;
        requestedProductsProvider = null;
        creditProducts = [];
        creditProductsErrorKey = "";
        purchaseErrorKey = "";
        purchaseNoticeKey = "";
        clearActiveOrder();
    };

    const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

    const syncPolarOrderAfterReturn = async (orderId: number) => {
        purchaseErrorKey = "";
        purchaseNoticeKey = "";

        let paid = false;
        for (let i = 0; i < 8; i += 1) {
            const order = await fetchOrderStatus(orderId, true, false);
            if (order?.status === "PAID") {
                paid = true;
                break;
            }
            await sleep(1000);
        }

        purchaseNoticeKey = paid
            ? "auth.payment_success"
            : "auth.polar_pending_notice";

        try {
            const url = new URL(window.location.href);
            url.searchParams.delete("polarOrderId");
            url.searchParams.delete("polarResult");
            window.history.replaceState({}, "", url.toString());
        } catch {}
    };

    $: if (browser && $clerkLoaded && $clerkUser) {
        const orderId = Number.parseInt(
            $page.url.searchParams.get("polarOrderId") || "",
            10,
        );
        if (
            Number.isFinite(orderId) &&
            orderId > 0 &&
            polarHandledOrderId !== orderId
        ) {
            polarHandledOrderId = orderId;
            void syncPolarOrderAfterReturn(orderId);
        }
    }
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

        <section class="card contact-card">
            <details class="accordion">
                <summary class="accordion-summary">
                    <div>
                        <div class="card-title">{$t("auth.contact_points_title")}</div>
                        <div class="subtext card-subtitle">
                            {$t("auth.contact_points_subtitle")}
                        </div>
                    </div>
                </summary>

                <div class="accordion-body">
                    <div class="contact-grid">
                        {#if isChinese}
                            <div class="contact-item">
                                <div class="contact-label">
                                    {$t("auth.contact_points_wechat")}
                                </div>
                                <img
                                    class="contact-qr"
                                    src="/account/wechat.png"
                                    alt={$t("auth.contact_points_wechat_alt")}
                                />
                            </div>
                        {:else}
                            <div class="contact-item">
                                <div class="contact-label">
                                    {$t("auth.contact_points_line")}
                                </div>
                                <img
                                    class="contact-qr"
                                    src="/account/line.png"
                                    alt={$t("auth.contact_points_line_alt")}
                                />
                            </div>
                            <div class="contact-item">
                                <div class="contact-label">
                                    {$t("auth.contact_points_whatsapp")}
                                </div>
                                <img
                                    class="contact-qr"
                                    src="/account/whatsapp.png"
                                    alt={$t("auth.contact_points_whatsapp_alt")}
                                />
                            </div>
                        {/if}
                    </div>

                    <div class="subtext contact-note">
                        {$t("auth.contact_points_note")}
                    </div>
                </div>
            </details>
        </section>

        <section class="card referral-card">
            <details class="accordion">
                <summary class="accordion-summary">
                    <div>
                        <div class="card-title">{$t("auth.referral_title")}</div>
                        <div class="subtext card-subtitle">
                            {$t("auth.referral_subtitle")}
                        </div>
                    </div>
                </summary>

                <div class="accordion-body">
                    <div class="referral-link-row">
                        <div class="referral-link-label">
                            {$t("auth.referral_link_label")}
                        </div>
                        {#if referralLink}
                            <div class="referral-link-controls">
                                <input
                                    class="referral-link-input"
                                    readonly
                                    value={referralLink}
                                    on:focus={selectReferralLinkOnFocus}
                                />
                                <button
                                    class="button elevated"
                                    on:click={() => void copyReferralLink()}
                                    disabled={!referralLink}
                                >
                                    {#if referralCopyState === "copied"}
                                        {$t("auth.referral_copied")}
                                    {:else if referralCopyState === "failed"}
                                        {$t("auth.referral_copy_failed")}
                                    {:else}
                                        {$t("auth.referral_copy")}
                                    {/if}
                                </button>
                            </div>
                        {:else}
                            <div class="subtext">{$t("auth.loading")}</div>
                        {/if}
                    </div>

                    <div class="subtext referral-rules">
                        <div class="rules-title">{$t("auth.referral_rules_title")}</div>
                        <div class="rules-list">
                            <div>{$t("auth.referral_rule_1")}</div>
                            <div>{$t("auth.referral_rule_2")}</div>
                            <div>{$t("auth.referral_rule_3")}</div>
                        </div>
                    </div>
                </div>
            </details>
        </section>

        <section class="card topup-card">
                <div class="topup-header">
                    <div class="topup-title">
                        {$t("auth.topup_title")}
                    </div>
                    <div class="subtext topup-subtitle">
                        {$t(topupSubtitleKey)}
                    </div>
                </div>

            {#if isChinese}
                <div class="provider-switch" role="tablist">
                    <button
                        type="button"
                        class="provider-option"
                        class:active={selectedPaymentProvider === "wechat"}
                        on:click={() => selectPaymentProvider("wechat")}
                    >
                        {$t("auth.wechat_pay")}
                    </button>
                    <button
                        type="button"
                        class="provider-option"
                        class:active={selectedPaymentProvider === "polar"}
                        on:click={() => selectPaymentProvider("polar")}
                    >
                        {$t("auth.international_pay")}
                    </button>
                </div>
            {/if}

            {#if creditProductsLoading}
                <div class="subtext">{$t("auth.loading")}</div>
            {:else if creditProductsErrorKey}
                <div class="subtext error">{$t(creditProductsErrorKey)}</div>
            {:else}
                <div class="products-grid">
                    {#each creditProducts as product (product.key)}
                        {@const isTest = product.key.startsWith("points_test_")}
                        {@const isBest = !isTest && product.key === bestValueProductKey}
                        {@const isRecommended =
                            !isTest &&
                            !isBest &&
                            product.key === recommendedValueProductKey}

                        <div class="product-card">
                            <div class="product-main">
                                <div class="product-left">
                                    <div class="product-points">
                                        {product.points} {$t("auth.points_label")}
                                    </div>
                                    <div class="subtext product-subtitle">
                                        {formatUnitPrice(product)}
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
                                        {formatAmount(product.amountFen, product.currency)}
                                    </div>
                                </div>
                            </div>

                            <div class="product-actions">
                                {#if selectedPaymentProvider === "wechat"}
                                    <button
                                        class="button elevated active"
                                        disabled={purchaseLoading ||
                                            activeOrder?.status === "CREATED"}
                                        on:click={() => startWechatPay(product.key)}
                                    >
                                        {$t("auth.wechat_pay")}
                                    </button>
                                {:else}
                                    <button
                                        class="button elevated active"
                                        disabled={purchaseLoading || !product.enabled}
                                        title={!product.enabled ? $t("auth.polar_not_ready") : ""}
                                        on:click={() => startPolarPay(product.key)}
                                    >
                                        {$t("auth.polar_pay")}
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
            {#if purchaseNoticeKey}
                <div class="subtext notice">{$t(purchaseNoticeKey)}</div>
            {/if}
        </section>

        {#if activeOrder && activeOrder.provider === "wechat"}
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
                        {$t("auth.order_total")}: {formatAmount(activeOrder.amount_fen, activeOrder.currency)} · {activeOrder.points}
                        {$t("auth.points_label")}
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

    .referral-card {
        gap: 14px;
    }

    .accordion {
        border: 0;
        padding: 0;
        margin: 0;
    }

    .accordion-summary {
        list-style: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .accordion-summary::-webkit-details-marker {
        display: none;
    }

    .accordion-summary::after {
        content: "+";
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        color: var(--text);
        font-weight: 800;
        flex: 0 0 auto;
    }

    .accordion[open] > .accordion-summary::after {
        content: "–";
    }

    .accordion-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 12px;
    }

    .contact-card {
        gap: 12px;
    }

    .contact-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
    }

    .contact-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border-radius: 16px;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
    }

    .contact-label {
        font-size: 12px;
        font-weight: 800;
        color: var(--text);
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .contact-qr {
        width: 160px;
        height: 160px;
        object-fit: contain;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 0 0 1px var(--surface-2) inset;
    }

    .contact-note {
        padding: 0;
    }

    .referral-link-row {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .referral-link-label {
        font-size: 12.5px;
        font-weight: 700;
        color: var(--subtext);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .referral-link-controls {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
    }

    .referral-link-input {
        height: 42px;
        border-radius: 14px;
        border: 1px solid var(--surface-2);
        background: var(--surface-0);
        color: var(--text);
        padding: 0 12px;
        font-weight: 600;
        width: 100%;
        min-width: 0;
    }

    .referral-rules {
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .rules-title {
        font-weight: 800;
        color: var(--text);
        letter-spacing: -0.01em;
    }

    .rules-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: var(--subtext);
        line-height: 1.5;
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

    .provider-switch {
        display: inline-flex;
        gap: 8px;
        padding: 6px;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
        width: fit-content;
    }

    .provider-option {
        height: 34px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--subtext);
        font-weight: 800;
        cursor: pointer;
    }

    .provider-option.active {
        color: var(--text);
        border-color: var(--surface-2);
        background: var(--surface-1);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
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

    .notice {
        color: var(--green);
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
