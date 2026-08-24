<script lang="ts">
    import languages from "$i18n/languages.json";
    import { page } from "$app/stores";
    import { onDestroy, onMount } from "svelte";

    import env from "$lib/env";
    import {
        getRandomChatCampaignIntent,
        trackRandomChatEvent,
    } from "$lib/analytics/random-chat";
    import { t } from "$lib/i18n/translations";
    import {
        requireMembershipFeature,
        showMembershipUpgradeDialog,
    } from "$lib/membership/gate";
    import type {
        ChatMatchPhase,
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
    import { clerkEnabled, getClerkToken } from "$lib/state/clerk";

    let manager: RandomAvChatManager | null = null;

    let stageEl: HTMLElement | null = null;
    let localVideoEl: HTMLVideoElement | null = null;
    let remoteVideoEl: HTMLVideoElement | null = null;

    let localStream: MediaStream | null = null;
    let remoteStream: MediaStream | null = null;
    let peerProfile: ChatMatchProfile | null = null;

    let connected = false;
    let checkingMembership = false;
    let searching = false;
    let inCall = false;
    let hasStartedOnce = false;
    let isFullscreen = false;
    let showSettings = false;
    let matchEndReason = "";
    let errorMessage = "";
    let chatStage:
        | "idle"
        | "searching"
        | ChatMatchPhase
        | "ended" = "idle";
    let textDraft = "";
    let textMessages: Array<{
        id: string;
        text: string;
        sentAt: number;
        own: boolean;
    }> = [];
    let incomingVideoInvite = false;
    let videoInviteSent = false;
    let mediaBusy = false;

    let chatPrefs: RandomChatPreferences = defaultRandomChatPreferences;

    let expiresAt = 0;
    let countdown = "00:00";
    let countdownTimer: ReturnType<typeof setInterval> | null = null;

    const fallbackHost = env.HOST || "freesavevideo.online";
    const asiaMarketLanguages = new Set(["zh", "ja", "ko", "th", "vi"]);
    $: currentLang = $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || "en";
    $: campaignIntent = getRandomChatCampaignIntent(currentLang);
    $: isAsiaPracticeMarket = ["zh", "ja", "ko", "vi", "th"].includes(
        currentLang,
    );
    $: communityImage = isAsiaPracticeMarket
        ? "/images/random-chat/western-community-selfies.webp"
        : "/images/random-chat/asian-women-community-selfies.webp";
    $: canonicalUrl = `https://${fallbackHost}/${currentLang}/random-chat`;
    $: seoMarket = asiaMarketLanguages.has(currentLang) ? "asia" : "western";
    $: seoTitle = String($t(`random-chat.seo.${seoMarket}.title`));
    $: seoIntro = String($t(`random-chat.seo.${seoMarket}.intro`));
    $: seoRegionTitle = String($t(`random-chat.seo.${seoMarket}.region_title`));
    $: seoRegionBody = String($t(`random-chat.seo.${seoMarket}.region_body`));
    $: seoFaqItems = [
        {
            question: String($t("random-chat.seo.membership_question")),
            answer: String($t("random-chat.header.subtitle")),
        },
        {
            question: String($t("random-chat.seo.safety_question")),
            answer: `${String($t("random-chat.safety.main"))} ${String($t("random-chat.safety.time_limit"))}`,
        },
    ];
    $: randomChatJsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebApplication",
                "@id": `${canonicalUrl}#app`,
                name: seoTitle,
                url: canonicalUrl,
                inLanguage: currentLang,
                applicationCategory: "SocialNetworkingApplication",
                applicationSubCategory: "Random Video Chat",
                operatingSystem: "Any",
                isAccessibleForFree: false,
                description: seoIntro,
                featureList: [
                    seoRegionTitle,
                    String($t("random-chat.seo.filters_body")),
                    String($t("random-chat.header.subtitle")),
                    "ephemeral text icebreakers",
                    "mutual video consent",
                    "10-minute video sessions",
                    "country, language, and gender preferences",
                ],
            },
            {
                "@type": "FAQPage",
                "@id": `${canonicalUrl}#faq`,
                inLanguage: currentLang,
                mainEntity: seoFaqItems.map((item) => ({
                    "@type": "Question",
                    name: item.question,
                    acceptedAnswer: {
                        "@type": "Answer",
                        text: item.answer,
                    },
                })),
            },
        ],
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

    const handleUseTextIcebreakerChange = (event: Event) => {
        updateChatPref("useTextIcebreaker", getCheckboxValue(event));
    };

    const clearCountdown = () => {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        countdown = "00:00";
        expiresAt = 0;
    };

    const updateCountdown = () => {
        if (!expiresAt) {
            countdown = "00:00";
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
        chatStage = "ended";
        textDraft = "";
        textMessages = [];
        incomingVideoInvite = false;
        videoInviteSent = false;
        mediaBusy = false;
        clearCountdown();
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
        const profileLanguage = currentLang.toLowerCase();
        const localeCountry: Record<string, RandomChatCountry> = {
            en: "US",
            de: "DE",
            fr: "FR",
            es: "ES",
            zh: "CN",
            ja: "JP",
            ko: "KR",
            vi: "VN",
            th: "TH",
            ru: "RU",
        };
        const targetRegion: "asia" | "western" | "any" = [
            "en",
            "de",
            "fr",
            "es",
        ].includes(currentLang)
            ? "asia"
            : ["zh", "ja", "ko", "vi", "th"].includes(currentLang)
              ? "western"
              : "any";

        return {
            profile: {
                selfGender: chatPrefs.selfGender,
                country: localeCountry[currentLang] || "ANY",
                language: profileLanguage,
                useTextIcebreaker: chatPrefs.useTextIcebreaker,
            },
            filters: {
                targetGender: chatPrefs.targetGender,
                targetCountry: chatPrefs.targetCountry,
                language: languageFilter,
                targetRegion,
            },
        };
    };

    const startMatching = async () => {
        if (checkingMembership) return;
        checkingMembership = true;
        trackRandomChatEvent("matching_requested", {
            campaign_intent: campaignIntent,
            use_text_icebreaker: chatPrefs.useTextIcebreaker,
        });
        const allowed = await requireMembershipFeature("random_chat").finally(
            () => {
                checkingMembership = false;
            },
        );
        if (!allowed) {
            trackRandomChatEvent("membership_gate_shown", {
                campaign_intent: campaignIntent,
            });
            return;
        }

        matchEndReason = "";
        errorMessage = "";

        try {
            await ensureManagerConnected();
            await manager?.startMatching(buildMatchPayload());
            searching = true;
            chatStage = "searching";
            hasStartedOnce = true;
        } catch (error) {
            if (
                error instanceof Error &&
                (error as Error & { code?: string }).code ===
                    "membership_required"
            ) {
                return;
            }
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.start_matching_failed");
        }
    };

    const cancelMatching = () => {
        manager?.cancelMatching();
        searching = false;
        chatStage = "idle";
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
        if (!hasStartedOnce || checkingMembership) return;

        checkingMembership = true;
        const allowed = await requireMembershipFeature("random_chat").finally(
            () => {
                checkingMembership = false;
            },
        );
        if (!allowed) return;

        errorMessage = "";
        matchEndReason = "";

        try {
            await ensureManagerConnected();
            await manager?.nextMatch(buildMatchPayload());
            searching = true;
            chatStage = "searching";
        } catch (error) {
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.next_match_failed");
        }
    };

    const sendTextMessage = () => {
        const text = Array.from(textDraft.trim()).slice(0, 500).join("");
        if (!text || chatStage !== "icebreaker") return;

        const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        manager?.sendText(text, id);
        trackRandomChatEvent("text_message_sent", {
            campaign_intent: campaignIntent,
        });
        textMessages = [
            ...textMessages,
            { id, text, sentAt: Date.now(), own: true },
        ];
        textDraft = "";
    };

    const handleTextKeydown = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendTextMessage();
        }
    };

    const inviteVideo = async () => {
        if (mediaBusy || chatStage !== "icebreaker") return;
        mediaBusy = true;
        try {
            await manager?.inviteVideo();
            videoInviteSent = true;
            trackRandomChatEvent("video_invite_sent", {
                campaign_intent: campaignIntent,
            });
        } catch (error) {
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.media_failed");
            manager?.declineVideo();
        } finally {
            mediaBusy = false;
        }
    };

    const acceptVideo = async () => {
        if (mediaBusy || chatStage !== "icebreaker") return;
        mediaBusy = true;
        try {
            await manager?.acceptVideo();
            incomingVideoInvite = false;
            trackRandomChatEvent("video_invite_accepted", {
                campaign_intent: campaignIntent,
            });
        } catch (error) {
            errorMessage =
                error instanceof Error
                    ? error.message
                    : $t("random-chat.error.media_failed");
            manager?.declineVideo();
        } finally {
            mediaBusy = false;
        }
    };

    const declineVideo = () => {
        manager?.declineVideo();
        incomingVideoInvite = false;
        trackRandomChatEvent("video_invite_declined", {
            campaign_intent: campaignIntent,
        });
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

    $: statusText = chatStage === "icebreaker"
        ? $t("random-chat.status.icebreaker")
        : chatStage === "video_connecting"
          ? $t("random-chat.status.video_connecting")
          : chatStage === "video"
            ? $t("random-chat.status.in_call")
        : searching
          ? $t("random-chat.status.searching")
          : $t("random-chat.status.ready");

    onMount(() => {
        chatPrefs = loadRandomChatPreferences();
        manager = new RandomAvChatManager();
        trackRandomChatEvent("page_viewed", {
            campaign_intent: getRandomChatCampaignIntent(currentLang),
        });

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
                if (reason === "membership_required") {
                    void showMembershipUpgradeDialog("random_chat");
                    return;
                }
                errorMessage = message;
            }),
            manager.on("enqueued", () => {
                searching = true;
                chatStage = "searching";
                trackRandomChatEvent("queue_entered", {
                    campaign_intent: campaignIntent,
                });
            }),
            manager.on("queue_cancelled", () => {
                searching = false;
                trackRandomChatEvent("queue_cancelled", {
                    campaign_intent: campaignIntent,
                });
            }),
            manager.on("matched", ({ phase, icebreakerExpiresAt, videoExpiresAt, peer }) => {
                searching = false;
                inCall = true;
                chatStage = phase;
                matchEndReason = "";
                peerProfile = peer || null;
                textMessages = [];
                incomingVideoInvite = false;
                videoInviteSent = false;
                const deadline = phase === "icebreaker"
                    ? icebreakerExpiresAt
                    : videoExpiresAt;
                if (deadline) startCountdown(deadline);
                trackRandomChatEvent("match_created", {
                    campaign_intent: campaignIntent,
                    phase,
                });
                if (phase === "icebreaker") {
                    trackRandomChatEvent("icebreaker_started", {
                        campaign_intent: campaignIntent,
                    });
                }
            }),
            manager.on("text", ({ clientMessageId, text, sentAt }) => {
                textMessages = [
                    ...textMessages,
                    { id: clientMessageId || `${sentAt}`, text, sentAt, own: false },
                ];
            }),
            manager.on("video_invited", () => {
                incomingVideoInvite = true;
            }),
            manager.on("video_accepted", () => {
                videoInviteSent = true;
            }),
            manager.on("phase_changed", ({ phase, videoExpiresAt }) => {
                chatStage = phase;
                incomingVideoInvite = false;
                if (phase === "video_connecting" || phase === "video") {
                    textDraft = "";
                    textMessages = [];
                    if (videoExpiresAt) startCountdown(videoExpiresAt);
                }
                trackRandomChatEvent(
                    phase === "video" ? "video_connected" : "video_connection_started",
                    { campaign_intent: campaignIntent },
                );
            }),
            manager.on("match_ended", ({ reason }) => {
                matchEndReason = reason;
                trackRandomChatEvent("match_ended", {
                    campaign_intent: campaignIntent,
                    reason,
                });
                resetUiAfterCall();
                scheduleNextMatch();
            }),
            manager.on("local_stream", ({ stream }) => {
                localStream = stream;
            }),
            manager.on("remote_stream", ({ stream }) => {
                remoteStream = stream;
            }),
            manager.on("error", ({ message, code }) => {
                if (code === "MEMBERSHIP_REQUIRED") {
                    searching = false;
                    void showMembershipUpgradeDialog("random_chat");
                    return;
                }
                errorMessage = message;
            }),
        ];

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
    <title>{seoTitle} | FreeSaveVideo</title>
    <meta name="description" content={seoIntro} />
    {@html `<script type="application/ld+json">${JSON.stringify(randomChatJsonLd).replace(/</g, "\\u003c")}</script>`}
</svelte:head>

<div class="random-chat-page">
    <section class="community-hero">
        <div class="community-copy">
            <span class="community-eyebrow">{$t("random-chat.community.eyebrow")}</span>
            <h1>{$t("random-chat.header.title")}</h1>
            <p class="community-lead">{$t("random-chat.header.subtitle")}</p>
            <div class="community-points" aria-label={$t("random-chat.community.features_label")}>
                <span>{$t("random-chat.community.feature_members")}</span>
                <span>{$t("random-chat.community.feature_text_first")}</span>
                <span>{$t("random-chat.community.feature_filters")}</span>
            </div>
            <p class="membership-disclosure">
                {$t("random-chat.header.membership_disclosure")}
            </p>
        </div>

        <figure class="community-preview">
            <img
                src={communityImage}
                alt={$t("random-chat.community.image_alt")}
                width="1536"
                height="1024"
                loading="eager"
                fetchpriority="high"
            />
            <figcaption>
                <strong>{$t("random-chat.community.preview_title")}</strong>
                <span>{$t("random-chat.community.preview_disclaimer")}</span>
            </figcaption>
        </figure>
    </section>

    {#if !clerkEnabled}
        <div class="notice error">{$t("random-chat.notice.clerk_disabled")}</div>
    {:else}
        <section class="stage" bind:this={stageEl}>
            <div class="panel panel-remote">
                {#if chatStage === "icebreaker"}
                    <div class="icebreaker-panel">
                        <header class="icebreaker-head">
                            <div>
                                <strong>{$t("random-chat.icebreaker.title")}</strong>
                                <span>{$t("random-chat.icebreaker.subtitle")}</span>
                            </div>
                            <span class="icebreaker-timer">{countdown}</span>
                        </header>

                        <div class="message-list" aria-live="polite">
                            {#if textMessages.length === 0}
                                <div class="starter-card">
                                    {$t("random-chat.icebreaker.starter")}
                                </div>
                            {/if}
                            {#each textMessages as message (message.id)}
                                <div class:own={message.own} class="message-row">
                                    <span>{message.text}</span>
                                </div>
                            {/each}
                        </div>

                        {#if incomingVideoInvite}
                            <div class="video-invite-card">
                                <strong>{$t("random-chat.icebreaker.invite_received")}</strong>
                                <span>{$t("random-chat.icebreaker.decline_warning")}</span>
                                <div class="invite-actions">
                                    <button on:click={acceptVideo} disabled={mediaBusy}>
                                        {$t("random-chat.action.accept_video")}
                                    </button>
                                    <button class="danger" on:click={declineVideo} disabled={mediaBusy}>
                                        {$t("random-chat.action.decline_video")}
                                    </button>
                                </div>
                            </div>
                        {:else}
                            <div class="message-compose">
                                <textarea
                                    bind:value={textDraft}
                                    maxlength="500"
                                    rows="2"
                                    placeholder={$t("random-chat.icebreaker.placeholder")}
                                    on:keydown={handleTextKeydown}
                                ></textarea>
                                <button on:click={sendTextMessage} disabled={!textDraft.trim()}>
                                    {$t("random-chat.action.send")}
                                </button>
                            </div>
                            <button
                                class="video-invite-button"
                                on:click={inviteVideo}
                                disabled={mediaBusy || videoInviteSent}
                            >
                                {videoInviteSent
                                    ? $t("random-chat.icebreaker.invite_sent")
                                    : $t("random-chat.action.invite_video")}
                            </button>
                        {/if}
                    </div>
                {:else if inCall && remoteStream}
                    <video class="video" bind:this={remoteVideoEl} autoplay playsinline></video>
                {:else}
                    <div class="brand-area">
                        <div class="member-badge">{$t("tabs.member_only")}</div>
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
                {#if localStream}
                    <video
                        class="video"
                        class:mirrored={chatPrefs.mirrorLocalVideo}
                        bind:this={localVideoEl}
                        autoplay
                        playsinline
                        muted
                    ></video>
                {:else}
                    <div class="local-placeholder">
                        <strong>{$t("random-chat.icebreaker.camera_off")}</strong>
                        <span>{$t("random-chat.icebreaker.camera_off_detail")}</span>
                    </div>
                {/if}

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
            <button
                class="dock-btn start"
                on:click={startMatching}
                disabled={checkingMembership || searching || inCall}
            >
                {$t("random-chat.action.start")}
            </button>
            <button class="dock-btn stop" on:click={inCall ? leaveMatch : cancelMatching} disabled={!searching && !inCall}>
                {$t("random-chat.action.stop")}
            </button>
            <button
                class="dock-btn next"
                on:click={nextMatch}
                disabled={checkingMembership || !hasStartedOnce}
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

    <section class="seo-content" aria-labelledby="random-chat-seo-title">
        <div class="seo-heading">
            <span class="seo-eyebrow">{$t("tabs.member_only")} · {seoRegionTitle}</span>
            <h1 id="random-chat-seo-title">{seoTitle}</h1>
            <p>{seoIntro}</p>
        </div>

        <div class="seo-grid">
            <article class="seo-card">
                <h2>{seoRegionTitle}</h2>
                <p>{seoRegionBody}</p>
            </article>
            <article class="seo-card">
                <h2>{$t("random-chat.field.country")} · {$t("random-chat.field.language")}</h2>
                <p>{$t("random-chat.seo.filters_body")}</p>
            </article>
            <article class="seo-card">
                <h2>{$t("random-chat.brand.subtitle")}</h2>
                <p>{$t("random-chat.header.subtitle")}</p>
            </article>
        </div>

        <div class="seo-faq" id="faq">
            <h2>{$t("random-chat.seo.faq_title")}</h2>
            {#each seoFaqItems as item}
                <details>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                </details>
            {/each}
        </div>
    </section>

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
                        checked={chatPrefs.useTextIcebreaker}
                        on:change={handleUseTextIcebreakerChange}
                    />
                    <span>
                        {$t("random-chat.settings.text_icebreaker")}
                        <small>{$t("random-chat.settings.text_icebreaker_detail")}</small>
                    </span>
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
        width: min(1540px, calc(100% - 24px));
        margin: 10px auto 24px;
        display: grid;
        gap: 16px;
    }

    .community-hero {
        position: relative;
        isolation: isolate;
        display: grid;
        grid-template-columns: minmax(0, 1.18fr) minmax(520px, 0.82fr);
        align-items: stretch;
        min-height: 360px;
        overflow: hidden;
        border: 1px solid var(--popup-stroke);
        border-radius: 22px;
        background:
            radial-gradient(circle at 12% 12%, rgba(var(--accent-rgb), 0.2), transparent 35%),
            linear-gradient(145deg, var(--popup-bg), rgba(var(--accent-rgb), 0.06));
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.12);
    }

    .community-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 10px;
        padding: clamp(24px, 3vw, 44px);
        z-index: 2;
    }

    .community-eyebrow {
        width: fit-content;
        padding: 6px 11px;
        border: 1px solid rgba(var(--accent-rgb), 0.38);
        border-radius: 999px;
        color: var(--accent-strong);
        background: rgba(var(--accent-rgb), 0.1);
        font-size: 0.75rem;
        font-weight: 750;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .community-copy h1 {
        max-width: 700px;
        margin: 0;
        font-size: clamp(2.2rem, 3.2vw, 3.65rem);
        line-height: 1.02;
        letter-spacing: -0.045em;
        text-wrap: balance;
    }

    .community-lead {
        max-width: 630px;
        margin: 0;
        color: var(--subtext);
        font-size: clamp(0.96rem, 1.15vw, 1.08rem);
        line-height: 1.5;
    }

    .community-points {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .community-points span {
        padding: 6px 9px;
        border: 1px solid var(--popup-stroke);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        color: var(--text);
        font-size: 0.78rem;
    }

    .membership-disclosure {
        margin: 2px 0 0;
        color: var(--subtext);
        font-size: 0.82rem;
    }

    .community-preview {
        position: relative;
        min-width: 0;
        min-height: 360px;
        margin: 0;
        overflow: hidden;
        background: #111;
    }

    .community-preview::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        background:
            linear-gradient(90deg, rgba(8, 8, 8, 0.35), transparent 18%),
            linear-gradient(0deg, rgba(8, 8, 8, 0.7), transparent 32%);
    }

    .community-preview img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
    }

    .community-preview figcaption {
        position: absolute;
        z-index: 2;
        left: 18px;
        right: 18px;
        bottom: 16px;
        display: grid;
        gap: 3px;
        color: #fff;
        text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55);
    }

    .community-preview figcaption span {
        color: rgba(255, 255, 255, 0.76);
        font-size: 0.76rem;
        line-height: 1.35;
    }

    .seo-content {
        margin-top: 8px;
        padding: clamp(24px, 4vw, 52px);
        border: 1px solid var(--popup-stroke);
        border-radius: 20px;
        background:
            radial-gradient(circle at 8% 0%, rgba(var(--accent-rgb), 0.12), transparent 30%),
            var(--popup-bg);
    }

    .seo-heading {
        max-width: 880px;
    }

    .seo-eyebrow {
        display: inline-block;
        margin-bottom: 12px;
        color: var(--accent);
        font-size: 0.76rem;
        font-weight: 760;
        letter-spacing: 0.07em;
        text-transform: uppercase;
    }

    .seo-heading h1 {
        margin: 0;
        max-width: 780px;
        color: var(--text);
        font-size: clamp(2rem, 4.5vw, 4rem);
        line-height: 1.04;
        letter-spacing: -0.045em;
    }

    .seo-heading p {
        margin: 18px 0 0;
        max-width: 760px;
        color: var(--subtext);
        font-size: clamp(1rem, 1.6vw, 1.16rem);
        line-height: 1.75;
    }

    .seo-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 30px;
    }

    .seo-card {
        padding: 20px;
        border: 1px solid var(--popup-stroke);
        border-radius: 14px;
        background: rgba(var(--accent-rgb), 0.035);
    }

    .seo-card h2,
    .seo-faq h2 {
        margin: 0;
        color: var(--text);
        font-size: 1.02rem;
        line-height: 1.4;
    }

    .seo-card p,
    .seo-faq p {
        margin: 10px 0 0;
        color: var(--subtext);
        font-size: 0.92rem;
        line-height: 1.7;
    }

    .seo-faq {
        margin-top: 34px;
        max-width: 900px;
    }

    .seo-faq > h2 {
        margin-bottom: 12px;
        font-size: 1.3rem;
    }

    .seo-faq details {
        border-top: 1px solid var(--popup-stroke);
        padding: 14px 2px;
    }

    .seo-faq details:last-child {
        border-bottom: 1px solid var(--popup-stroke);
    }

    .seo-faq summary {
        color: var(--text);
        font-weight: 680;
        cursor: pointer;
    }

    .stage {
        display: grid;
        grid-template-columns: 1fr 1fr;
        min-height: clamp(400px, 52vh, 600px);
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

    .member-badge {
        width: fit-content;
        margin: 0 auto;
        padding: 5px 10px;
        border: 1px solid rgba(var(--accent-rgb), 0.5);
        border-radius: 999px;
        color: var(--accent);
        background: rgba(0, 0, 0, 0.34);
        font-size: 0.72rem;
        font-weight: 750;
        letter-spacing: 0.08em;
        text-transform: uppercase;
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

    .local-placeholder {
        height: 100%;
        display: grid;
        place-content: center;
        gap: 8px;
        padding: 24px;
        text-align: center;
        color: #f4f4f4;
    }

    .local-placeholder span {
        color: rgba(255, 255, 255, 0.66);
        font-size: 0.9rem;
    }

    .icebreaker-panel {
        height: 100%;
        min-height: 360px;
        display: grid;
        grid-template-rows: auto 1fr auto auto;
        gap: 12px;
        padding: 18px;
        color: #f7f7f7;
    }

    .icebreaker-head,
    .icebreaker-head > div,
    .video-invite-card {
        display: grid;
        gap: 5px;
    }

    .icebreaker-head {
        grid-template-columns: 1fr auto;
        align-items: start;
    }

    .icebreaker-head span,
    .video-invite-card span {
        color: rgba(255, 255, 255, 0.68);
        font-size: 0.86rem;
    }

    .icebreaker-timer {
        border-radius: 999px;
        padding: 6px 10px;
        background: rgba(var(--accent-rgb), 0.2);
        color: #fff !important;
        font-variant-numeric: tabular-nums;
    }

    .message-list {
        min-height: 150px;
        max-height: 38vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 4px;
    }

    .starter-card {
        margin: auto;
        max-width: 420px;
        padding: 14px;
        border-radius: 12px;
        color: rgba(255, 255, 255, 0.72);
        background: rgba(255, 255, 255, 0.07);
        text-align: center;
    }

    .message-row {
        display: flex;
        justify-content: flex-start;
    }

    .message-row.own {
        justify-content: flex-end;
    }

    .message-row span {
        max-width: 82%;
        border-radius: 13px 13px 13px 4px;
        padding: 9px 11px;
        background: rgba(255, 255, 255, 0.12);
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }

    .message-row.own span {
        border-radius: 13px 13px 4px 13px;
        background: rgba(var(--accent-rgb), 0.76);
    }

    .message-compose {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
    }

    .message-compose textarea {
        resize: none;
        border-radius: 11px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(0, 0, 0, 0.26);
        color: #fff;
        padding: 9px 10px;
    }

    .message-compose button,
    .video-invite-button,
    .invite-actions button {
        border: 1px solid rgba(var(--accent-rgb), 0.8);
        border-radius: 10px;
        background: rgba(var(--accent-rgb), 0.78);
        color: #fff;
        padding: 9px 13px;
        cursor: pointer;
    }

    .message-compose button:disabled,
    .video-invite-button:disabled,
    .invite-actions button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .video-invite-card {
        border-radius: 12px;
        border: 1px solid rgba(var(--accent-rgb), 0.5);
        background: rgba(var(--accent-rgb), 0.12);
        padding: 12px;
    }

    .invite-actions {
        display: flex;
        gap: 8px;
        margin-top: 5px;
    }

    .invite-actions .danger {
        border-color: rgba(214, 69, 69, 0.9);
        background: rgba(214, 69, 69, 0.84);
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
        min-height: 68px;
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

    .notice.error {
        border-color: rgba(228, 90, 90, 0.45);
        background: rgba(228, 90, 90, 0.14);
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

    .toggle span {
        display: grid;
        gap: 3px;
    }

    .toggle small {
        color: var(--subtext);
        line-height: 1.35;
    }

    @media (min-width: 981px) and (max-height: 900px) {
        .community-hero {
            min-height: 340px;
        }

        .community-copy {
            gap: 8px;
            padding: 26px 34px;
        }

        .community-copy h1 {
            font-size: clamp(2.1rem, 3vw, 3.35rem);
        }

        .community-preview {
            min-height: 340px;
        }

        .stage {
            min-height: clamp(360px, 45vh, 480px);
        }

        .dock-btn {
            min-height: 64px;
        }
    }

    @media (max-width: 980px) {
        .community-hero {
            grid-template-columns: 1fr;
        }

        .community-copy {
            padding: 28px 24px 22px;
        }

        .community-copy h1 {
            font-size: clamp(2rem, 9vw, 3.5rem);
        }

        .community-preview {
            min-height: 0;
        }

        .community-preview img {
            position: relative;
            inset: auto;
            height: auto;
            min-height: 0;
            aspect-ratio: 3 / 2;
        }

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

        .seo-grid {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 640px) {
        .random-chat-page {
            width: calc(100% - 16px);
            margin-top: 8px;
            gap: 12px;
        }

        .community-hero {
            min-height: 0;
            border-radius: 16px;
        }

        .community-copy {
            gap: 8px;
            padding: 22px 18px 18px;
        }

        .community-copy h1 {
            font-size: clamp(2rem, 10vw, 2.6rem);
            line-height: 1.04;
        }

        .community-lead {
            font-size: 0.94rem;
            line-height: 1.45;
        }

        .community-preview img {
            aspect-ratio: 16 / 9;
        }

        .stage {
            min-height: 0;
        }

        .panel {
            min-height: 240px;
        }

        .dock-btn {
            min-height: 60px;
        }

        .dock > :last-child {
            grid-column: 1 / -1;
        }
    }
</style>
