<script lang="ts">
    import languages from "$i18n/languages.json";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";

    import { currentApiURL } from "$lib/api/api-url";
    import env from "$lib/env";
    import { t } from "$lib/i18n/translations";
    import type {
        ChatMatchProfile,
        ChatTargetGender,
        ChatSelfGender,
    } from "$lib/chat/random-av-chat-manager";
    import { RandomAvChatManager } from "$lib/chat/random-av-chat-manager";
    import {
        RANDOM_CHAT_COUNTRY_OPTIONS,
        RANDOM_CHAT_SELF_GENDER_OPTIONS,
        RANDOM_CHAT_TARGET_GENDER_OPTIONS,
        type RandomChatCountry,
        type RandomChatPreferences,
        type RandomChatUiLanguage,
        defaultRandomChatPreferences,
        loadRandomChatPreferences,
        saveRandomChatPreferences,
    } from "$lib/chat/random-chat-preferences";
    import {
        checkSignedIn,
        clerkEnabled,
        getClerkToken,
        signIn,
    } from "$lib/state/clerk";

    let manager: RandomAvChatManager | null = null;

    let stageEl: HTMLElement | null = null;
    let localVideoEl: HTMLVideoElement | null = null;
    let remoteVideoEl: HTMLVideoElement | null = null;

    let localStream: MediaStream | null = null;
    let remoteStream: MediaStream | null = null;
    let peerProfile: ChatMatchProfile | null = null;

    let signedIn = false;
    let checkingEligibility = false;
    let eligible = false;
    let requirePaidOrder = false;
    let hasPaidOrder = true;
    let connected = false;
    let searching = false;
    let inCall = false;
    let hasStartedOnce = false;
    let isFullscreen = false;
    let showSettings = false;
    let matchEndReason = "";
    let errorMessage = "";

    let chatPrefs: RandomChatPreferences = defaultRandomChatPreferences;

    let expiresAt = 0;
    let countdown = "10:00";
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    const fallbackHost = env.HOST || "freesavevideo.online";
    $: currentLang = $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || "en";
    $: canonicalUrl = `https://${fallbackHost}/${currentLang}/random-chat`;
    $: randomChatJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "@id": `${canonicalUrl}#app`,
        name: "FreeSaveVideo Random 1v1 Video Chat",
        url: canonicalUrl,
        applicationCategory: "SocialNetworkingApplication",
        applicationSubCategory: "Random Video Chat",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        description: String($t("random-chat.meta.description")),
        featureList: ["1v1 video matching", "10-minute sessions", "WebRTC media", "country and language preferences"],
    };

    const updateChatPref = <K extends keyof RandomChatPreferences>(
        key: K,
        value: RandomChatPreferences[K],
    ) => {
        chatPrefs = saveRandomChatPreferences({
            ...chatPrefs,
            [key]: value,
        });
    };

    const countryLabel = (value: RandomChatCountry) =>
        $t(`random-chat.country.${value.toLowerCase()}`);

    const selfGenderLabel = (value: ChatSelfGender) =>
        $t(`random-chat.gender.self.${value}`);

    const targetGenderLabel = (value: ChatTargetGender) =>
        $t(`random-chat.gender.target.${value}`);

    const cycleSelfGender = () => {
        const idx = RANDOM_CHAT_SELF_GENDER_OPTIONS.indexOf(chatPrefs.selfGender);
        const next =
            RANDOM_CHAT_SELF_GENDER_OPTIONS[
                (idx + 1) % RANDOM_CHAT_SELF_GENDER_OPTIONS.length
            ];
        updateChatPref("selfGender", next);
    };

    const getSelectValue = (event: Event) =>
        (event.currentTarget as HTMLSelectElement).value;

    const getCheckboxValue = (event: Event) =>
        (event.currentTarget as HTMLInputElement).checked;

    const handleSelfGenderChange = (event: Event) => {
        updateChatPref("selfGender", getSelectValue(event) as ChatSelfGender);
    };

    const handleTargetGenderChange = (event: Event) => {
        updateChatPref("targetGender", getSelectValue(event) as ChatTargetGender);
    };

    const handleCountryChange = (event: Event) => {
        updateChatPref("targetCountry", getSelectValue(event) as RandomChatCountry);
    };

    const handleUiLanguageChange = (event: Event) => {
        updateChatPref("uiLanguage", getSelectValue(event) as RandomChatUiLanguage);
    };

    const handleAutoNextChange = (event: Event) => {
        updateChatPref("autoNext", getCheckboxValue(event));
    };

    const handleMirrorLocalVideoChange = (event: Event) => {
        updateChatPref("mirrorLocalVideo", getCheckboxValue(event));
    };

    const handleMuteRemoteOnJoinChange = (event: Event) => {
        updateChatPref("muteRemoteOnJoin", getCheckboxValue(event));
    };

    const handleShowSafetyNoticeChange = (event: Event) => {
        updateChatPref("showSafetyNotice", getCheckboxValue(event));
    };

    const clearCountdown = () => {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        countdown = "10:00";
        expiresAt = 0;
    };

    const updateCountdown = () => {
        if (!expiresAt) {
            countdown = "10:00";
            return;
        }

        const leftMs = Math.max(0, expiresAt - Date.now());
        const totalSec = Math.floor(leftMs / 1000);
        const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
        const ss = String(totalSec % 60).padStart(2, "0");
        countdown = `${mm}:${ss}`;
    };

    const startCountdown = (nextExpiresAt: number) => {
        clearCountdown();
        expiresAt = nextExpiresAt;
        updateCountdown();

        countdownTimer = setInterval(() => {
            updateCountdown();
        }, 1000);
    };

    const resetUiAfterCall = () => {
        inCall = false;
        searching = false;
        localStream = null;
        remoteStream = null;
        peerProfile = null;
        clearCountdown();
    };

    const refreshEligibility = async () => {
        checkingEligibility = true;
        errorMessage = "";

        try {
            signedIn = await checkSignedIn(800);
            if (!signedIn) {
                eligible = false;
                return;
            }

            const token = await getClerkToken();
            if (!token) {
                eligible = false;
                signedIn = false;
                return;
            }

            const res = await fetch(`${currentApiURL()}/user/chat/eligibility`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json().catch(() => null);

            if (!res.ok || data?.status !== "success") {
                throw new Error(
                    data?.error?.message ||
                        $t("random-chat.error.check_eligibility_failed"),
                );
            }

            eligible = Boolean(data?.data?.eligible);
            requirePaidOrder = Boolean(data?.data?.requirePaidOrder);
            hasPaidOrder = Boolean(data?.data?.hasPaidOrder);
        } catch (error) {
            eligible = false;
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.check_eligibility_failed");
        } finally {
            checkingEligibility = false;
        }
    };

    const ensureManagerConnected = async () => {
        if (!manager) {
            throw new Error($t("random-chat.error.manager_not_initialized"));
        }

        if (connected) {
            return;
        }

        const token = await getClerkToken();
        if (!token) {
            throw new Error($t("random-chat.error.missing_clerk_token"));
        }

        await manager.connect(token);
        connected = true;
    };

    const buildMatchPayload = () => {
        const languageFilter =
            chatPrefs.uiLanguage === "auto"
                ? ""
                : String(chatPrefs.uiLanguage).toLowerCase();
        const profileLanguage =
            chatPrefs.uiLanguage === "auto"
                ? currentLang.toLowerCase()
                : String(chatPrefs.uiLanguage).toLowerCase();

        return {
            profile: {
                selfGender: chatPrefs.selfGender,
                // There is no server-side geo profile yet, so we map selected country
                // into profile to make country preference mutually matchable.
                country: chatPrefs.targetCountry,
                language: profileLanguage,
            },
            filters: {
                targetGender: chatPrefs.targetGender,
                targetCountry: chatPrefs.targetCountry,
                language: languageFilter,
            },
        };
    };

    const startMatching = async () => {
        if (!eligible) return;

        matchEndReason = "";
        errorMessage = "";

        try {
            await ensureManagerConnected();
            await manager?.startMatching(buildMatchPayload());
            searching = true;
            hasStartedOnce = true;
        } catch (error) {
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.start_matching_failed");
        }
    };

    const cancelMatching = () => {
        manager?.cancelMatching();
        searching = false;
        localStream = null;
        remoteStream = null;
        peerProfile = null;
        clearCountdown();
    };

    const leaveMatch = () => {
        manager?.leaveMatch();
        resetUiAfterCall();
    };

    const nextMatch = async () => {
        if (!eligible || !hasStartedOnce) return;

        errorMessage = "";
        matchEndReason = "";

        try {
            await ensureManagerConnected();
            await manager?.nextMatch(buildMatchPayload());
            searching = true;
        } catch (error) {
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.next_match_failed");
        }
    };

    const handleSignIn = async () => {
        await signIn();
        await refreshEligibility();
    };

    const toggleFullscreen = async () => {
        if (typeof document === "undefined") return;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                return;
            }

            if (stageEl?.requestFullscreen) {
                await stageEl.requestFullscreen();
            }
        } catch (error) {
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.toggle_fullscreen_failed");
        }
    };

    const scheduleNextMatch = () => {
        if (!eligible) {
            return;
        }

        const autoNextDone = chatPrefs.autoNext && matchEndReason !== "left";
        if (!autoNextDone) {
            return;
        }

        setTimeout(() => {
            if (!inCall && !searching) {
                void startMatching();
            }
        }, 300);
    };

    $: if (localVideoEl) {
        localVideoEl.srcObject = localStream;
    }

    $: if (remoteVideoEl) {
        remoteVideoEl.srcObject = remoteStream;
        remoteVideoEl.muted = chatPrefs.muteRemoteOnJoin;
    }

    $: statusText = inCall
        ? $t("random-chat.status.in_call")
        : searching
          ? $t("random-chat.status.searching")
          : $t("random-chat.status.ready");

    onMount(() => {
        chatPrefs = loadRandomChatPreferences();
        manager = new RandomAvChatManager();

        const onFullscreenChange = () => {
            isFullscreen = !!document.fullscreenElement;
        };

        document.addEventListener("fullscreenchange", onFullscreenChange);

        const unsubscribers = [
            manager.on("socket_closed", () => {
                connected = false;
                searching = false;
                if (!inCall) {
                    clearCountdown();
                }
            }),
            manager.on("auth_ok", () => {
                errorMessage = "";
            }),
            manager.on("auth_failed", ({ reason, message }) => {
                connected = false;
                searching = false;
                inCall = false;
                if (reason === "payment_required") {
                    eligible = false;
                    requirePaidOrder = true;
                    hasPaidOrder = false;
                }
                errorMessage = message;
            }),
            manager.on("enqueued", () => {
                searching = true;
            }),
            manager.on("queue_cancelled", () => {
                searching = false;
            }),
            manager.on("matched", ({ expiresAt: matchExpiresAt, peer }) => {
                searching = false;
                inCall = true;
                matchEndReason = "";
                peerProfile = peer || null;
                startCountdown(matchExpiresAt);
            }),
            manager.on("match_ended", ({ reason }) => {
                matchEndReason = reason;
                resetUiAfterCall();
                scheduleNextMatch();
            }),
            manager.on("local_stream", ({ stream }) => {
                localStream = stream;
            }),
            manager.on("remote_stream", ({ stream }) => {
                remoteStream = stream;
            }),
            manager.on("error", ({ message }) => {
                errorMessage = message;
            }),
        ];

        void refreshEligibility();

        return () => {
            document.removeEventListener("fullscreenchange", onFullscreenChange);
            for (const unsubscribe of unsubscribers) {
                unsubscribe();
            }
        };
    });

    onDestroy(() => {
        clearCountdown();
        void manager?.disconnect();
        manager = null;
    });
</script>

<svelte:head>
    <title>{$t("random-chat.meta.title")}</title>
    <meta
        name="description"
        content={$t("random-chat.meta.description")}
    />
    {@html `<script type="application/ld+json">${JSON.stringify(randomChatJsonLd).replace(/</g, "\\u003c")}</script>`}
</svelte:head>

<div class="random-chat-page">
    {#if !clerkEnabled}
        <div class="notice error">{$t("random-chat.notice.clerk_disabled")}</div>
    {:else if checkingEligibility}
        <div class="notice">{$t("random-chat.notice.checking_eligibility")}</div>
    {:else if !signedIn}
        <div class="notice warn">
            <p>{$t("random-chat.notice.signin_required")}</p>
            <button class="action primary" on:click={handleSignIn}>
                {$t("random-chat.action.sign_in")}
            </button>
        </div>
    {:else if !eligible}
        <div class="notice warn">
            {#if requirePaidOrder && !hasPaidOrder}
                <p>{$t("random-chat.notice.paid_required")}</p>
                <a class="action primary" href={`/${currentLang}/account`}>
                    {$t("random-chat.action.go_to_account")}
                </a>
            {:else}
                <p>{$t("random-chat.notice.not_eligible")}</p>
            {/if}
        </div>
    {:else}
        <section class="stage" bind:this={stageEl}>
            <div class="panel panel-remote">
                {#if inCall && remoteStream}
                    <video class="video" bind:this={remoteVideoEl} autoplay playsinline></video>
                {:else}
                    <div class="brand-area">
                        <div class="brand-title">{$t("random-chat.brand.title")}</div>
                        <div class="brand-subtitle">{$t("random-chat.brand.subtitle")}</div>
                        <div class="online-indicator">
                            <span class="dot"></span>
                            {searching
                                ? $t("random-chat.brand.searching_users")
                                : $t("random-chat.brand.users_online")}
                        </div>
                    </div>
                {/if}
            </div>

            <div class="panel panel-local">
                <video
                    class="video"
                    class:mirrored={chatPrefs.mirrorLocalVideo}
                    bind:this={localVideoEl}
                    autoplay
                    playsinline
                    muted
                ></video>

                <div class="overlay-top">
                    <button class="overlay-btn" on:click={toggleFullscreen}>
                        {isFullscreen
                            ? $t("random-chat.action.exit_fullscreen")
                            : $t("random-chat.action.fullscreen")}
                    </button>
                    <button class="overlay-btn" on:click={() => (showSettings = true)}>
                        {$t("random-chat.action.settings")}
                    </button>
                </div>

                <div class="overlay-bottom">
                    <span class="chip">
                        {connected
                            ? $t("random-chat.connection.connected")
                            : $t("random-chat.connection.disconnected")}
                    </span>
                    <span class="chip">{statusText}</span>
                    <span class="chip">{countdown}</span>
                </div>
            </div>
        </section>

        <section class="dock">
            <button class="dock-btn start" on:click={startMatching} disabled={searching || inCall}>
                {$t("random-chat.action.start")}
            </button>
            <button class="dock-btn stop" on:click={inCall ? leaveMatch : cancelMatching} disabled={!searching && !inCall}>
                {$t("random-chat.action.stop")}
            </button>
            <button
                class="dock-btn next"
                on:click={nextMatch}
                disabled={!hasStartedOnce}
            >
                {$t("random-chat.action.next")}
            </button>
            <label class="dock-btn neutral dock-select-wrap">
                <span>{$t("random-chat.field.country")}</span>
                <select
                    class="dock-select"
                    value={chatPrefs.targetCountry}
                    on:change={handleCountryChange}
                >
                    {#each RANDOM_CHAT_COUNTRY_OPTIONS as value}
                        <option value={value}>{countryLabel(value)}</option>
                    {/each}
                </select>
            </label>
            <button class="dock-btn neutral" on:click={cycleSelfGender}>
                {$t("random-chat.field.i_am")}: {selfGenderLabel(chatPrefs.selfGender)}
            </button>
        </section>

        {#if chatPrefs.showSafetyNotice}
            <section class="safety">
                {$t("random-chat.safety.main")}
                {$t("random-chat.safety.time_limit")}
                {#if peerProfile}
                    <span class="peer-meta">
                        {$t("random-chat.peer_profile")}: {selfGenderLabel(peerProfile.selfGender || "unspecified")}
                        {peerProfile.country ? ` / ${peerProfile.country}` : ""}
                    </span>
                {/if}
            </section>
        {/if}

        {#if errorMessage}
            <div class="notice error">{errorMessage}</div>
        {/if}

        {#if matchEndReason}
            <div class="notice">
                {$t("random-chat.last_session_ended")}: {matchEndReason}
            </div>
        {/if}
    {/if}

    {#if showSettings}
        <div class="settings-mask" role="button" tabindex="0" on:click={() => (showSettings = false)} on:keydown={(event) => event.key === "Escape" && (showSettings = false)}>
            <div class="settings-panel" role="dialog" aria-modal="true" on:click|stopPropagation>
                <header class="settings-head">
                    <h2>{$t("random-chat.settings.title")}</h2>
                    <button class="close-btn" on:click={() => (showSettings = false)}>
                        {$t("random-chat.action.close")}
                    </button>
                </header>

                <label class="field">
                    <span>{$t("random-chat.field.i_am")}</span>
                    <select
                        value={chatPrefs.selfGender}
                        on:change={handleSelfGenderChange}
                    >
                        {#each RANDOM_CHAT_SELF_GENDER_OPTIONS as value}
                            <option value={value}>{selfGenderLabel(value)}</option>
                        {/each}
                    </select>
                </label>

                <label class="field">
                    <span>{$t("random-chat.field.target_gender")}</span>
                    <select
                        value={chatPrefs.targetGender}
                        on:change={handleTargetGenderChange}
                    >
                        {#each RANDOM_CHAT_TARGET_GENDER_OPTIONS as value}
                            <option value={value}>{targetGenderLabel(value)}</option>
                        {/each}
                    </select>
                </label>

                <label class="field">
                    <span>{$t("random-chat.field.country")}</span>
                    <select
                        value={chatPrefs.targetCountry}
                        on:change={handleCountryChange}
                    >
                        {#each RANDOM_CHAT_COUNTRY_OPTIONS as value}
                            <option value={value}>{countryLabel(value)}</option>
                        {/each}
                    </select>
                </label>

                <label class="field">
                    <span>{$t("random-chat.field.language")}</span>
                    <select
                        value={chatPrefs.uiLanguage}
                        on:change={handleUiLanguageChange}
                    >
                        <option value="auto">{$t("random-chat.language.auto")}</option>
                        {#each Object.entries(languages) as [langCode, langName]}
                            <option value={langCode}>{langName}</option>
                        {/each}
                    </select>
                </label>

                <label class="toggle">
                    <input
                        type="checkbox"
                        checked={chatPrefs.autoNext}
                        on:change={handleAutoNextChange}
                    />
                    {$t("random-chat.settings.auto_next")}
                </label>

                <label class="toggle">
                    <input
                        type="checkbox"
                        checked={chatPrefs.mirrorLocalVideo}
                        on:change={handleMirrorLocalVideoChange}
                    />
                    {$t("random-chat.settings.mirror_local")}
                </label>

                <label class="toggle">
                    <input
                        type="checkbox"
                        checked={chatPrefs.muteRemoteOnJoin}
                        on:change={handleMuteRemoteOnJoinChange}
                    />
                    {$t("random-chat.settings.mute_remote")}
                </label>

                <label class="toggle">
                    <input
                        type="checkbox"
                        checked={chatPrefs.showSafetyNotice}
                        on:change={handleShowSafetyNoticeChange}
                    />
                    {$t("random-chat.settings.show_safety")}
                </label>
            </div>
        </div>
    {/if}
</div>

<style>
    .random-chat-page {
        width: min(1380px, calc(100% - 24px));
        margin: 10px auto 24px;
        display: grid;
        gap: 12px;
    }

    .stage {
        display: grid;
        grid-template-columns: 1fr 1fr;
        min-height: 62vh;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
    }

    .panel {
        position: relative;
        min-height: 360px;
        border-right: 1px solid var(--popup-stroke);
        background: #090909;
    }

    .panel:last-child {
        border-right: none;
    }

    .panel-remote {
        background:
            linear-gradient(140deg, rgba(var(--accent-rgb), 0.2), transparent 45%),
            radial-gradient(circle at 80% 90%, rgba(var(--accent-rgb), 0.14), transparent 38%),
            #0d0d0d;
    }

    .panel-local {
        background: #060606;
    }

    .brand-area {
        height: 100%;
        display: grid;
        place-content: center;
        text-align: center;
        gap: 10px;
        color: #f7f7f7;
    }

    .brand-title {
        font-size: clamp(1.6rem, 3.1vw, 2.8rem);
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .brand-subtitle {
        font-size: 0.98rem;
        color: rgba(255, 255, 255, 0.7);
    }

    .online-indicator {
        margin-top: 8px;
        color: rgba(255, 255, 255, 0.85);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
    }

    .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #52db6e;
        box-shadow: 0 0 0 6px rgba(82, 219, 110, 0.2);
    }

    .video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #040404;
    }

    .video.mirrored {
        transform: scaleX(-1);
    }

    .overlay-top,
    .overlay-bottom {
        position: absolute;
        left: 12px;
        right: 12px;
        display: flex;
        gap: 8px;
    }

    .overlay-top {
        top: 12px;
        justify-content: flex-end;
    }

    .overlay-bottom {
        bottom: 12px;
        justify-content: flex-start;
        flex-wrap: wrap;
    }

    .overlay-btn {
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #f5f5f5;
        background: rgba(6, 6, 6, 0.45);
        backdrop-filter: blur(4px);
        cursor: pointer;
    }

    .chip {
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #f6f6f6;
        background: rgba(0, 0, 0, 0.45);
        padding: 6px 10px;
        font-size: 0.82rem;
        line-height: 1;
    }

    .dock {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
    }

    .dock-btn {
        min-height: 76px;
        border-radius: 14px;
        border: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
        color: var(--text);
        cursor: pointer;
        font-size: 1rem;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
    }

    .dock-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
    }

    .dock-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }

    .dock-btn.start {
        background: linear-gradient(
            135deg,
            rgba(var(--accent-rgb), 0.86),
            rgba(var(--accent-rgb), 0.66)
        );
        color: #fff;
        border-color: rgba(var(--accent-rgb), 0.98);
    }

    .dock-btn.stop {
        background: rgba(214, 69, 69, 0.88);
        color: #fff;
        border-color: rgba(214, 69, 69, 0.92);
    }

    .dock-btn.next {
        background: rgba(255, 188, 72, 0.92);
        color: #2a2a2a;
        border-color: rgba(255, 188, 72, 0.96);
    }

    .dock-btn.neutral {
        background: var(--popup-bg);
    }

    .dock-select-wrap {
        display: grid;
        align-content: center;
        justify-items: stretch;
        gap: 6px;
        padding: 8px 10px;
        cursor: default;
    }

    .dock-select-wrap span {
        font-size: 0.82rem;
        color: var(--subtext);
        text-align: left;
        line-height: 1;
    }

    .dock-select {
        width: 100%;
        min-height: 34px;
        border-radius: 8px;
        border: 1px solid var(--popup-stroke);
        background: transparent;
        color: var(--text);
        padding: 4px 8px;
        font-size: 0.92rem;
    }

    .safety {
        border-radius: 12px;
        border: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
        padding: 10px 12px;
        color: var(--subtext);
        font-size: 0.92rem;
        line-height: 1.45;
    }

    .peer-meta {
        display: block;
        margin-top: 5px;
        color: var(--accent-strong);
    }

    .notice {
        border-radius: 10px;
        padding: 10px 12px;
        border: 1px solid rgba(110, 158, 210, 0.3);
        background: rgba(110, 158, 210, 0.12);
    }

    .notice.warn {
        border-color: rgba(255, 177, 66, 0.4);
        background: rgba(255, 177, 66, 0.12);
    }

    .notice.error {
        border-color: rgba(228, 90, 90, 0.45);
        background: rgba(228, 90, 90, 0.14);
    }

    .action {
        border-radius: 10px;
        border: 1px solid var(--popup-stroke);
        background: transparent;
        color: var(--text);
        padding: 8px 12px;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .action.primary {
        border-color: rgba(var(--accent-rgb), 0.95);
        background: rgba(var(--accent-rgb), 0.82);
        color: #ffffff;
    }

    .settings-mask {
        position: fixed;
        inset: 0;
        z-index: 120;
        background: rgba(0, 0, 0, 0.56);
        display: grid;
        place-items: center;
        padding: 16px;
    }

    .settings-panel {
        width: min(560px, 96vw);
        border-radius: 16px;
        border: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
        color: var(--text);
        padding: 16px;
        display: grid;
        gap: 12px;
    }

    .settings-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .settings-head h2 {
        margin: 0;
        font-size: 1.08rem;
    }

    .close-btn {
        border-radius: 9px;
        border: 1px solid var(--popup-stroke);
        background: transparent;
        color: var(--text);
        padding: 6px 10px;
        cursor: pointer;
    }

    .field {
        display: grid;
        gap: 6px;
    }

    .field span {
        color: var(--subtext);
        font-size: 0.88rem;
    }

    .field select {
        border-radius: 10px;
        border: 1px solid var(--popup-stroke);
        background: transparent;
        color: var(--text);
        padding: 8px 10px;
        min-height: 40px;
    }

    .toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        border-radius: 10px;
        border: 1px solid var(--popup-stroke);
        padding: 10px 12px;
        font-size: 0.94rem;
    }

    .toggle input {
        width: 16px;
        height: 16px;
    }

    @media (max-width: 980px) {
        .stage {
            grid-template-columns: 1fr;
        }

        .panel {
            border-right: none;
            border-bottom: 1px solid var(--popup-stroke);
            min-height: 300px;
        }

        .panel:last-child {
            border-bottom: none;
        }

        .dock {
            grid-template-columns: 1fr 1fr;
        }
    }
</style>
