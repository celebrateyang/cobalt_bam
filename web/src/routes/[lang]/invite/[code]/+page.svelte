<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";

    import { t } from "$lib/i18n/translations";
    import { getServerInfo } from "$lib/api/server-info";
    import cachedInfo from "$lib/state/server-info";
    import {
        clerkEnabled,
        clerkLoaded,
        clerkUser,
        getClerkToken,
        initClerk,
        signIn,
        signUp,
    } from "$lib/state/clerk";
    import { currentApiURL } from "$lib/api/api-url";

    import Skeleton from "$components/misc/Skeleton.svelte";
    import IconGift from "@tabler/icons-svelte/IconGift.svelte";
    import IconHome from "@tabler/icons-svelte/IconHome.svelte";
    import IconLogin from "@tabler/icons-svelte/IconLogin.svelte";
    import IconUserCircle from "@tabler/icons-svelte/IconUserCircle.svelte";
    import IconUserPlus from "@tabler/icons-svelte/IconUserPlus.svelte";
    import IconRefresh from "@tabler/icons-svelte/IconRefresh.svelte";
    import IconStack2 from "@tabler/icons-svelte/IconStack2.svelte";
    import IconListCheck from "@tabler/icons-svelte/IconListCheck.svelte";

    const getInviteCode = () => String($page.params.code || "").trim();

    const getRedirectForSignUp = () => {
        const redirectUrl = $page.url.toString();
        return {
            fallbackRedirectUrl: redirectUrl,
            signInFallbackRedirectUrl: redirectUrl,
        };
    };

    const getRedirectForSignIn = () => {
        const redirectUrl = $page.url.toString();
        return {
            fallbackRedirectUrl: redirectUrl,
            signUpFallbackRedirectUrl: redirectUrl,
        };
    };

    $: homeLink = `/${$page.params.lang}/`;

    type ReferrerProfile = {
        fullName: string | null;
        avatarUrl: string | null;
    };

    type LookupState = "idle" | "loading" | "loaded" | "invalid" | "error";

    let referrer: ReferrerProfile | null = null;
    let lookupState: LookupState = "idle";
    let lastLookupCode: string | null = null;

    const mapLookupError = (apiCode: unknown) => {
        if (apiCode === "INVALID_CODE") return "invalid" as const;
        return "error" as const;
    };

    const fetchReferrerProfile = async (code: string) => {
        if (!code) {
            referrer = null;
            lookupState = "invalid";
            return;
        }

        lookupState = "loading";
        referrer = null;

        try {
            const apiBase = currentApiURL();
            const res = await fetch(
                `${apiBase}/user/referrals/lookup?code=${encodeURIComponent(code)}`,
            );

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                lookupState = mapLookupError(data?.error?.code);
                return;
            }

            referrer = data?.data?.referrer ?? null;
            lookupState = referrer ? "loaded" : "invalid";
        } catch (error) {
            lookupState = "error";
            console.debug("load inviter failed", error);
        }
    };

    type CapabilityPlatform = "bilibili" | "douyin" | "tiktok" | "kuaishou" | "instagram";

    const platformLabels: Record<
        CapabilityPlatform,
        { zh: string; default: string }
    > = {
        bilibili: { zh: "B站", default: "Bilibili" },
        douyin: { zh: "抖音", default: "Douyin" },
        tiktok: { zh: "TikTok", default: "TikTok" },
        kuaishou: { zh: "快手", default: "Kuaishou" },
        instagram: { zh: "Instagram", default: "Instagram" },
    };

    const collectionPlatforms: CapabilityPlatform[] = ["bilibili", "douyin", "tiktok"];
    const batchPlatforms: CapabilityPlatform[] = [
        "douyin",
        "tiktok",
        "kuaishou",
        "instagram",
        "bilibili",
    ];

    const getPlatformLabel = (platform: CapabilityPlatform) =>
        $page.params.lang === "zh" ? platformLabels[platform].zh : platformLabels[platform].default;

    let servicesLoaded = false;
    let services: string[] = [];

    const loadSupportedServices = async () => {
        await getServerInfo().catch(() => false);
        if ($cachedInfo) {
            servicesLoaded = true;
            services = $cachedInfo.info.cobalt.services || [];
        }
    };

    $: if (browser) {
        const code = getInviteCode();
        if (code !== lastLookupCode) {
            lastLookupCode = code;
            void fetchReferrerProfile(code);
        }
    }

    type ClaimState =
        | "idle"
        | "claiming"
        | "claimed"
        | "already"
        | "too_old"
        | "invalid"
        | "self"
        | "error";

    let claimState: ClaimState = "idle";
    let lastClaimKey: string | null = null;

    const mapClaimError = (apiCode: unknown) => {
        if (apiCode === "REFERRAL_TOO_OLD") return "too_old" as const;
        if (apiCode === "INVALID_CODE") return "invalid" as const;
        if (apiCode === "SELF_REFERRAL") return "self" as const;
        return "error" as const;
    };

    const claimInvite = async (code: string) => {
        if (!code || !$clerkUser) return;
        if (claimState === "claiming") return;

        claimState = "claiming";

        try {
            const token = await getClerkToken();
            if (!token) throw new Error("missing token");

            const apiBase = currentApiURL();
            const res = await fetch(`${apiBase}/user/referrals/claim`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ code }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || data?.status !== "success") {
                claimState = mapClaimError(data?.error?.code);
                return;
            }

            claimState = data?.data?.claimed ? "claimed" : "already";
        } catch (error) {
            claimState = "error";
            console.debug("claim invite failed", error);
        }
    };

    const tryAutoClaim = async () => {
        const code = getInviteCode();
        const userId = $clerkUser?.id;
        if (!code || !userId) return;

        const key = `${userId}:${code}`;
        if (lastClaimKey === key) return;
        lastClaimKey = key;

        await claimInvite(code);
    };

    const retryClaim = () => {
        lastClaimKey = null;
        void tryAutoClaim();
    };

    onMount(() => {
        if (clerkEnabled) {
            initClerk();
        }

        void loadSupportedServices();
    });

    $: if ($clerkUser) {
        void tryAutoClaim();
    } else {
        claimState = "idle";
        lastClaimKey = null;
    }
</script>

<svelte:head>
    <title>{$t("invite.title")} ~ {$t("general.cobalt")}</title>
</svelte:head>

<div class="invite-container">
    <header class="header">
        <h1 class="title">
            <IconGift size={30} />
            <span>{$t("invite.title")}</span>
        </h1>
        <div class="subtext subtitle">{$t("invite.subtitle")}</div>
    </header>

    {#if lookupState === "loading"}
        <section class="card inviter-card">
            <div class="inviter-row">
                <div class="inviter-avatar skeleton" aria-hidden="true"></div>
                <div class="inviter-meta">
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line"></div>
                </div>
            </div>
        </section>
    {:else if lookupState === "loaded" && referrer}
        <section class="card inviter-card">
            <div class="inviter-row">
                {#if referrer.avatarUrl}
                    <img
                        class="inviter-avatar"
                        src={referrer.avatarUrl}
                        alt={$t("invite.inviter_avatar_alt")}
                        referrerpolicy="no-referrer"
                    />
                {:else}
                    <div class="inviter-avatar fallback" aria-hidden="true">
                        <IconUserCircle size={28} />
                    </div>
                {/if}

                <div class="inviter-meta">
                    <div class="inviter-label">{$t("invite.invited_by_label")}</div>
                    <div class="inviter-name">
                        {referrer.fullName || $t("invite.invited_by_unknown")}
                    </div>
                </div>
            </div>
        </section>
    {:else if lookupState === "invalid"}
        <section class="card inviter-card">
            <div class="subtext warn">{$t("invite.invalid")}</div>
        </section>
    {:else if lookupState === "error"}
        <section class="card inviter-card">
            <div class="subtext warn">{$t("invite.lookup_error")}</div>
        </section>
    {/if}

    <section class="card">
        <div class="rule">
            {$t("invite.rule")}
        </div>
    </section>

    <section class="card features-card">
        <h2 class="card-title">{$t("invite.features_title")}</h2>
        <div class="subtext card-subtitle">{$t("invite.features_subtitle")}</div>

        <div class="feature-block">
            <div class="feature-head">
                <div class="feature-icon"><IconGift size={20} /></div>
                <div class="feature-title">{$t("invite.supported_download_title")}</div>
            </div>

            <div class="chip-grid">
                {#if servicesLoaded}
                    {#each services as service (service)}
                        {#if !service.toLowerCase().includes("youtube")}
                            <span class="chip">{service}</span>
                        {/if}
                    {/each}
                {:else}
                    {#each { length: 16 } as _}
                        <Skeleton
                            class="elevated chip-skeleton"
                            width={Math.random() * 44 + 56 + "px"}
                            height="26px"
                        />
                    {/each}
                {/if}
            </div>
        </div>

        <div class="feature-block">
            <div class="feature-head">
                <div class="feature-icon"><IconStack2 size={20} /></div>
                <div class="feature-title">{$t("home.capabilities.collection.title")}</div>
            </div>
            <div class="subtext feature-desc">
                {$t("home.capabilities.collection.desc")}
            </div>
            <div class="chip-grid">
                {#each collectionPlatforms as platform (platform)}
                    <span class="chip">{getPlatformLabel(platform)}</span>
                {/each}
            </div>
        </div>

        <div class="feature-block">
            <div class="feature-head">
                <div class="feature-icon"><IconListCheck size={20} /></div>
                <div class="feature-title">{$t("home.capabilities.batch.title")}</div>
            </div>
            <div class="subtext feature-desc">
                {$t("home.capabilities.batch.desc")}
            </div>
            <div class="chip-grid">
                {#each batchPlatforms as platform (platform)}
                    <span class="chip">{getPlatformLabel(platform)}</span>
                {/each}
            </div>
        </div>

        <div class="actions">
            <button class="button elevated active" on:click={() => void goto(homeLink)}>
                <IconHome size={18} />
                {$t("invite.go_home")}
            </button>
        </div>
    </section>

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
    {:else if !$clerkUser}
        <section class="card">
            <h2 class="card-title">{$t("invite.cta_title")}</h2>
            <div class="subtext card-subtitle">{$t("invite.cta_subtitle")}</div>

            <div class="actions">
                <button
                    class="button elevated active"
                    on:click={() => signUp(getRedirectForSignUp())}
                >
                    <IconUserPlus size={18} />
                    {$t("invite.sign_up")}
                </button>
                <button
                    class="button elevated"
                    on:click={() => signIn(getRedirectForSignIn())}
                >
                    <IconLogin size={18} />
                    {$t("invite.sign_in")}
                </button>
            </div>
        </section>
    {:else}
        <section class="card">
            <h2 class="card-title">{$t("invite.processing_title")}</h2>

            {#if claimState === "claiming"}
                <div class="subtext">{$t("invite.claiming")}</div>
            {:else if claimState === "claimed"}
                <div class="subtext success">{$t("invite.claimed")}</div>
            {:else if claimState === "already"}
                <div class="subtext">{$t("invite.already")}</div>
            {:else if claimState === "too_old"}
                <div class="subtext warn">{$t("invite.too_old")}</div>
            {:else if claimState === "invalid"}
                <div class="subtext warn">{$t("invite.invalid")}</div>
            {:else if claimState === "self"}
                <div class="subtext warn">{$t("invite.self")}</div>
            {:else if claimState === "error"}
                <div class="subtext warn">{$t("invite.error")}</div>
                <div class="actions">
                    <button class="button elevated" on:click={retryClaim}>
                        <IconRefresh size={18} />
                        {$t("invite.retry")}
                    </button>
                </div>
            {:else}
                <div class="subtext">{$t("invite.signed_in_hint")}</div>
            {/if}
        </section>
    {/if}
</div>

<style>
    .invite-container {
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

    .rule {
        line-height: 1.55;
        color: var(--text);
    }

    .features-card {
        gap: 18px;
    }

    .feature-block {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .feature-head {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .feature-icon {
        width: 34px;
        height: 34px;
        border-radius: 14px;
        border: 1px solid var(--surface-2);
        background: var(--surface-0);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text);
        flex: 0 0 auto;
    }

    .feature-title {
        font-weight: 900;
        color: var(--text);
        letter-spacing: -0.01em;
    }

    .feature-desc {
        padding: 0;
    }

    .chip-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        background: var(--surface-0);
        color: var(--text);
        font-size: 12.5px;
        font-weight: 700;
        line-height: 1.2;
    }

    :global(.chip-skeleton) {
        border-radius: 999px;
    }

    .inviter-row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
    }

    .inviter-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .inviter-label {
        font-size: 12.5px;
        font-weight: 700;
        color: var(--subtext);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .inviter-name {
        font-weight: 900;
        color: var(--text);
        letter-spacing: -0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .inviter-avatar {
        width: 44px;
        height: 44px;
        border-radius: 999px;
        object-fit: cover;
        background: var(--surface-2);
        border: 1px solid var(--surface-2);
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text);
    }

    .inviter-avatar.fallback {
        background: var(--surface-0);
    }

    .inviter-avatar.skeleton {
        opacity: 0.6;
        background: var(--surface-2);
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

    .subtext.success {
        color: var(--success-text, #2e7d32);
    }

    .subtext.warn {
        color: var(--danger, #cc3b3b);
    }

    .skeleton-line {
        height: 14px;
        width: 100%;
        border-radius: 999px;
        background: var(--surface-2);
        opacity: 0.6;
    }

    .skeleton-line.short {
        width: 65%;
    }
</style>
