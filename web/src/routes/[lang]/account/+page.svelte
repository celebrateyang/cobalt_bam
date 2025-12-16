<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";

    import { t } from "$lib/i18n/translations";
    import {
        clerkEnabled,
        clerkLoaded,
        clerkUser,
        initClerk,
        openUserProfile,
        signIn,
        signOut,
        signUp,
    } from "$lib/state/clerk";

    import IconUserCircle from "@tabler/icons-svelte/IconUserCircle.svelte";
    import IconLogin from "@tabler/icons-svelte/IconLogin.svelte";
    import IconUserPlus from "@tabler/icons-svelte/IconUserPlus.svelte";
    import IconLogout from "@tabler/icons-svelte/IconLogout.svelte";
    import IconSettings from "@tabler/icons-svelte/IconSettings.svelte";

    onMount(() => {
        if (clerkEnabled) {
            initClerk();
        }
    });

    const getRedirectForSignIn = () => ({
        fallbackRedirectUrl: $page.url.href,
        signUpFallbackRedirectUrl: $page.url.href,
    });

    const getRedirectForSignUp = () => ({
        fallbackRedirectUrl: $page.url.href,
        signInFallbackRedirectUrl: $page.url.href,
    });
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
        <section class="card">
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

        .actions :global(button) {
            flex: 1;
        }
    }
</style>
