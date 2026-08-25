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
    import {
        confirmRandomChatAdult,
        fetchRandomChatEligibility,
    } from "$lib/api/random-chat-safety";

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
    let adultConfirmed = false;
    let adultConfirmationChecked = false;
    let ageConfirmationBusy = false;
    let showReportDialog = false;
    let reportReason = "inappropriate_content";
    let reportDetails = "";
    let reportBusy = false;

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
            question: String($t("random-chat.faq.who.question")),
            answer: String($t("random-chat.faq.who.answer")),
        },
        {
            question: String($t("random-chat.faq.camera.question")),
            answer: String($t("random-chat.faq.camera.answer")),
        },
        {
            question: String($t("random-chat.faq.country.question")),
            answer: String($t("random-chat.faq.country.answer")),
        },
        {
            question: String($t("random-chat.faq.duration.question")),
            answer: String($t("random-chat.faq.duration.answer")),
        },
        {
            question: String($t("random-chat.faq.price.question")),
            answer: String($t("random-chat.faq.price.answer")),
        },
        {
            question: String($t("random-chat.faq.report.question")),
            answer: String($t("random-chat.faq.report.answer")),
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

    const uiLanguageLabel = (value: RandomChatUiLanguage) =>
        value === "auto"
            ? $t("random-chat.language.auto")
            : (languages as Record<string, string>)[String(value)] || String(value);

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

    const ensureAdultConfirmation = async () => {
        const token = await getClerkToken();
        if (!token) throw new Error($t("random-chat.error.missing_clerk_token"));
        const eligibility = await fetchRandomChatEligibility(token);
        adultConfirmed = eligibility.adultConfirmed;
        if (adultConfirmed) return true;
        if (!adultConfirmationChecked) {
            errorMessage = $t("random-chat.age.required_error");
            return false;
        }
        ageConfirmationBusy = true;
        try {
            const result = await confirmRandomChatAdult(token);
            adultConfirmed = result.confirmed;
            return adultConfirmed;
        } finally {
            ageConfirmationBusy = false;
        }
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
        reportBusy = false;
        showReportDialog = false;
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

        try {
            if (!(await ensureAdultConfirmation())) return;
        } catch (error) {
            errorMessage = error instanceof Error
                ? error.message
                : $t("random-chat.age.confirm_failed");
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

    const openReportDialog = () => {
        reportReason = "inappropriate_content";
        reportDetails = "";
        showReportDialog = true;
    };

    const submitReport = () => {
        if (!manager || !inCall || reportBusy) return;
        reportBusy = true;
        manager.reportMatch(reportReason, reportDetails.trim());
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
                if (reason === "age_confirmation_required") {
                    adultConfirmed = false;
                    errorMessage = $t("random-chat.age.required_error");
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
            manager.on("report_received", () => {
                reportBusy = false;
                showReportDialog = false;
                errorMessage = "";
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
                if (code === "AGE_CONFIRMATION_REQUIRED") {
                    searching = false;
                    adultConfirmed = false;
                    errorMessage = $t("random-chat.age.required_error");
                    return;
                }
                errorMessage = message;
                if (code === "REPORT_FAILED") {
                    reportBusy = false;
                }
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
        <section
            class:stage-video={chatStage === "video" || chatStage === "video_connecting"}
            class="chat-workspace"
            id="random-chat-workspace"
            bind:this={stageEl}
        >
            <header class="workspace-head">
                <div class="workspace-status">
                    <span class:active={searching || inCall} class="status-dot"></span>
                    <div>
                        <strong>{statusText}</strong>
                        <span>{$t("random-chat.header.membership_disclosure")}</span>
                    </div>
                </div>
                <div class="workspace-tools">
                    {#if chatStage === "video" || chatStage === "video_connecting"}
                        <button class="tool-btn" on:click={toggleFullscreen}>
                            {isFullscreen
                                ? $t("random-chat.action.exit_fullscreen")
                                : $t("random-chat.action.fullscreen")}
                        </button>
                    {/if}
                    <button class="tool-btn" on:click={() => (showSettings = true)}>
                        {$t("random-chat.action.settings")}
                    </button>
                </div>
            </header>

            {#if chatStage === "idle" || chatStage === "ended"}
                <div class="ready-layout">
                    <div class="ready-intro">
                        <span class="step-label">01</span>
                        <div class="ready-copy">
                            <span class="member-badge">{$t("tabs.member_only")}</span>
                            <h2>{$t("random-chat.brand.title")}</h2>
                            <p>{$t("random-chat.header.subtitle")}</p>
                        </div>
                        <div class="privacy-note">
                            <span class="privacy-icon" aria-hidden="true"></span>
                            <div>
                                <strong>{$t("random-chat.icebreaker.camera_off")}</strong>
                                <span>{$t("random-chat.icebreaker.camera_off_detail")}</span>
                            </div>
                        </div>
                    </div>

                    <div class="preference-card">
                        <div class="preference-head">
                            <span class="step-label">02</span>
                            <strong>{$t("random-chat.settings.title")}</strong>
                        </div>

                        <div class="preference-grid">
                            <label class="quick-field primary-filter">
                                <span>{$t("random-chat.field.target_gender")}</span>
                                <select value={chatPrefs.targetGender} on:change={handleTargetGenderChange}>
                                    {#each RANDOM_CHAT_TARGET_GENDER_OPTIONS as value}
                                        <option value={value}>{targetGenderLabel(value)}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="quick-field primary-filter">
                                <span>{$t("random-chat.field.country")}</span>
                                <select value={chatPrefs.targetCountry} on:change={handleCountryChange}>
                                    {#each RANDOM_CHAT_COUNTRY_OPTIONS as value}
                                        <option value={value}>{countryLabel(value)}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="quick-field">
                                <span>{$t("random-chat.field.language")}</span>
                                <select value={chatPrefs.uiLanguage} on:change={handleUiLanguageChange}>
                                    <option value="auto">{$t("random-chat.language.auto")}</option>
                                    {#each Object.entries(languages) as [langCode, langName]}
                                        <option value={langCode}>{langName}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="quick-field">
                                <span>{$t("random-chat.field.i_am")}</span>
                                <select value={chatPrefs.selfGender} on:change={handleSelfGenderChange}>
                                    {#each RANDOM_CHAT_SELF_GENDER_OPTIONS as value}
                                        <option value={value}>{selfGenderLabel(value)}</option>
                                    {/each}
                                </select>
                            </label>
                        </div>

                        <label class="icebreaker-choice">
                            <input
                                type="checkbox"
                                checked={chatPrefs.useTextIcebreaker}
                                on:change={handleUseTextIcebreakerChange}
                            />
                            <span>
                                <strong>{$t("random-chat.settings.text_icebreaker")}</strong>
                                <small>{$t("random-chat.settings.text_icebreaker_detail")}</small>
                            </span>
                        </label>

                        <label class:confirmed={adultConfirmed} class="age-confirmation">
                            <input
                                type="checkbox"
                                bind:checked={adultConfirmationChecked}
                                disabled={adultConfirmed || ageConfirmationBusy}
                            />
                            <span>
                                <strong>{$t("random-chat.age.confirm_label")}</strong>
                                <small>{$t("random-chat.age.confirm_detail")}</small>
                            </span>
                        </label>

                        <button
                            class="primary-action"
                            on:click={startMatching}
                            disabled={checkingMembership || ageConfirmationBusy}
                        >
                            <span class="step-label">03</span>
                            <span>
                                <strong>{$t("random-chat.action.start")}</strong>
                                <small>{$t("random-chat.safety.time_limit")}</small>
                            </span>
                            <span class="action-arrow" aria-hidden="true">→</span>
                        </button>
                    </div>
                </div>
            {:else if chatStage === "searching"}
                <div class="searching-view">
                    <div class="search-radar" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </div>
                    <div class="searching-copy">
                        <span class="member-badge">{$t("tabs.member_only")}</span>
                        <h2>{$t("random-chat.brand.searching_users")}</h2>
                        <p>
                            {countryLabel(chatPrefs.targetCountry)} ·
                            {targetGenderLabel(chatPrefs.targetGender)} ·
                            {uiLanguageLabel(chatPrefs.uiLanguage)}
                        </p>
                    </div>
                    <button class="secondary-action danger" on:click={cancelMatching}>
                        {$t("random-chat.action.cancel_matching")}
                    </button>
                </div>
            {:else if chatStage === "icebreaker"}
                <div class="conversation-layout">
                    <div class="icebreaker-panel">
                        <header class="icebreaker-head">
                            <div>
                                <span class="conversation-kicker">{$t("random-chat.status.icebreaker")}</span>
                                <strong>{$t("random-chat.icebreaker.title")}</strong>
                                <span>{$t("random-chat.icebreaker.subtitle")}</span>
                            </div>
                            <span class="icebreaker-timer">{countdown}</span>
                        </header>

                        <div class="message-list" aria-live="polite">
                            {#if textMessages.length === 0}
                                <div class="starter-card">{$t("random-chat.icebreaker.starter")}</div>
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

                    <aside class="match-context">
                        <span class="context-icon" aria-hidden="true"></span>
                        <strong>{$t("random-chat.icebreaker.camera_off")}</strong>
                        <p>{$t("random-chat.icebreaker.camera_off_detail")}</p>
                        {#if peerProfile}
                            <div class="peer-summary">
                                <span>{$t("random-chat.peer_profile")}</span>
                                <strong>
                                    {selfGenderLabel(peerProfile.selfGender || "unspecified")}
                                    {peerProfile.country ? ` · ${peerProfile.country}` : ""}
                                </strong>
                            </div>
                        {/if}
                        <button class="secondary-action danger" on:click={leaveMatch}>
                            {$t("random-chat.action.end_chat")}
                        </button>
                        <button class="report-action" on:click={openReportDialog}>
                            {$t("random-chat.action.report")}
                        </button>
                    </aside>
                </div>
            {:else}
                <div class="video-stage">
                    {#if remoteStream}
                        <video class="video remote-video" bind:this={remoteVideoEl} autoplay playsinline></video>
                    {:else}
                        <div class="video-connecting">
                            <div class="search-radar compact" aria-hidden="true">
                                <span></span><span></span><span></span>
                            </div>
                            <strong>{statusText}</strong>
                        </div>
                    {/if}

                    {#if localStream}
                        <div class="local-video-pip">
                            <video
                                class:mirrored={chatPrefs.mirrorLocalVideo}
                                class="video"
                                bind:this={localVideoEl}
                                autoplay
                                playsinline
                                muted
                            ></video>
                            <span>{$t("random-chat.field.i_am")}</span>
                        </div>
                    {/if}

                    <div class="video-status-bar">
                        <span class="chip">{statusText}</span>
                        <span class="chip timer-chip">{countdown}</span>
                    </div>
                    <div class="video-actions">
                        <button class="secondary-action report" on:click={openReportDialog}>
                            {$t("random-chat.action.report")}
                        </button>
                        <button class="secondary-action danger" on:click={leaveMatch}>
                            {$t("random-chat.action.end_chat")}
                        </button>
                        <button class="secondary-action next" on:click={nextMatch} disabled={checkingMembership}>
                            {$t("random-chat.action.next")}
                        </button>
                    </div>
                </div>
            {/if}
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

    <section class="trust-content" aria-labelledby="random-chat-why-title">
        <article class="why-card">
            <span class="seo-eyebrow">{$t("random-chat.why.eyebrow")}</span>
            <h2 id="random-chat-why-title">{$t("random-chat.why.title")}</h2>
            <p>{$t("random-chat.why.body")}</p>
        </article>

        <div class="safe-section">
            <div class="safe-heading">
                <span class="seo-eyebrow">{$t("random-chat.safe.eyebrow")}</span>
                <h2>{$t("random-chat.safe.title")}</h2>
                <p>{$t("random-chat.safe.intro")}</p>
            </div>
            <div class="safe-grid">
                {#each ["members", "camera", "consent", "limit", "leave", "report"] as item}
                    <article class="safe-card">
                        <span class="safe-check" aria-hidden="true">✓</span>
                        <div>
                            <h3>{$t(`random-chat.safe.${item}.title`)}</h3>
                            <p>{$t(`random-chat.safe.${item}.body`)}</p>
                        </div>
                    </article>
                {/each}
            </div>
        </div>
    </section>

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

{#if showReportDialog}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div class="settings-mask" role="presentation" on:click={() => !reportBusy && (showReportDialog = false)}>
            <div class="report-panel" role="dialog" aria-modal="true" on:click|stopPropagation>
                <header class="settings-head">
                    <div>
                        <h2>{$t("random-chat.report.title")}</h2>
                        <p>{$t("random-chat.report.subtitle")}</p>
                    </div>
                    <button class="close-btn" on:click={() => (showReportDialog = false)} disabled={reportBusy}>
                        {$t("random-chat.action.close")}
                    </button>
                </header>
                <label class="field">
                    <span>{$t("random-chat.report.reason")}</span>
                    <select bind:value={reportReason}>
                        <option value="inappropriate_content">{$t("random-chat.report.inappropriate_content")}</option>
                        <option value="harassment">{$t("random-chat.report.harassment")}</option>
                        <option value="suspected_minor">{$t("random-chat.report.suspected_minor")}</option>
                        <option value="spam_or_scam">{$t("random-chat.report.spam_or_scam")}</option>
                        <option value="other">{$t("random-chat.report.other")}</option>
                    </select>
                </label>
                <label class="field">
                    <span>{$t("random-chat.report.details")}</span>
                    <textarea bind:value={reportDetails} maxlength="500" rows="4"></textarea>
                </label>
                <p class="report-warning">{$t("random-chat.report.ends_match")}</p>
                <button class="secondary-action danger" on:click={submitReport} disabled={reportBusy}>
                    {$t("random-chat.report.submit")}
                </button>
            </div>
        </div>
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
        grid-template-columns: minmax(0, 1.25fr) minmax(460px, 0.75fr);
        align-items: stretch;
        min-height: 260px;
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
        padding: clamp(22px, 2.5vw, 34px);
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
        font-size: clamp(2rem, 2.8vw, 3.15rem);
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
        min-height: 260px;
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

    .trust-content {
        display: grid;
        gap: 16px;
        margin-top: 8px;
    }

    .why-card,
    .safe-section {
        padding: clamp(24px, 4vw, 44px);
        border: 1px solid var(--popup-stroke);
        border-radius: 20px;
        background: var(--popup-bg);
    }

    .why-card {
        background:
            radial-gradient(circle at 92% 10%, rgba(var(--accent-rgb), 0.16), transparent 34%),
            var(--popup-bg);
    }

    .why-card h2,
    .safe-heading h2 {
        margin: 0;
        color: var(--text);
        font-size: clamp(1.7rem, 3vw, 2.65rem);
        line-height: 1.1;
        letter-spacing: -0.03em;
    }

    .why-card p,
    .safe-heading p {
        max-width: 850px;
        margin: 14px 0 0;
        color: var(--subtext);
        font-size: 1rem;
        line-height: 1.75;
    }

    .safe-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 26px;
    }

    .safe-card {
        display: flex;
        gap: 12px;
        padding: 18px;
        border: 1px solid var(--popup-stroke);
        border-radius: 14px;
        background: rgba(var(--accent-rgb), 0.035);
    }

    .safe-check {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        color: var(--accent-strong);
        background: rgba(var(--accent-rgb), 0.13);
        font-weight: 800;
    }

    .safe-card h3 {
        margin: 1px 0 0;
        color: var(--text);
        font-size: 0.98rem;
    }

    .safe-card p {
        margin: 7px 0 0;
        color: var(--subtext);
        font-size: 0.88rem;
        line-height: 1.6;
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

    .chat-workspace {
        overflow: hidden;
        min-height: 440px;
        border: 1px solid var(--popup-stroke);
        border-radius: 20px;
        background: var(--popup-bg);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
    }

    .workspace-head {
        min-height: 68px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 18px;
        border-bottom: 1px solid var(--popup-stroke);
        background: var(--popup-bg);
    }

    .workspace-status,
    .workspace-tools,
    .workspace-status > div {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .workspace-status > div {
        align-items: flex-start;
        flex-direction: column;
        gap: 2px;
    }

    .workspace-status span:last-child {
        color: var(--subtext);
        font-size: 0.8rem;
    }

    .status-dot {
        width: 11px;
        height: 11px;
        flex: 0 0 auto;
        border-radius: 999px;
        background: #a8a8a8;
        box-shadow: 0 0 0 5px rgba(168, 168, 168, 0.15);
    }

    .status-dot.active {
        background: #52db6e;
        box-shadow: 0 0 0 5px rgba(82, 219, 110, 0.18);
    }

    .tool-btn {
        min-height: 38px;
        padding: 7px 12px;
        border: 1px solid var(--popup-stroke);
        border-radius: 10px;
        color: var(--text);
        background: transparent;
        cursor: pointer;
    }

    .ready-layout {
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(520px, 1.1fr);
        min-height: 400px;
    }

    .ready-intro {
        display: flex;
        flex-direction: column;
        gap: 22px;
        padding: clamp(26px, 3vw, 42px);
        background:
            radial-gradient(circle at 12% 14%, rgba(var(--accent-rgb), 0.22), transparent 34%),
            linear-gradient(145deg, rgba(var(--accent-rgb), 0.08), transparent 62%);
    }

    .step-label {
        display: inline-grid;
        place-items: center;
        width: 28px;
        height: 28px;
        flex: 0 0 auto;
        border-radius: 999px;
        color: var(--accent-strong);
        background: rgba(var(--accent-rgb), 0.13);
        font-size: 0.72rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
    }

    .ready-copy {
        display: grid;
        gap: 12px;
    }

    .ready-copy h2 {
        margin: 0;
        font-size: clamp(1.8rem, 3vw, 3rem);
        line-height: 1.06;
        letter-spacing: -0.035em;
    }

    .ready-copy p {
        max-width: 580px;
        margin: 0;
        color: var(--subtext);
        line-height: 1.6;
    }

    .member-badge {
        width: fit-content;
        padding: 5px 10px;
        border: 1px solid rgba(var(--accent-rgb), 0.5);
        border-radius: 999px;
        color: var(--accent);
        background: rgba(var(--accent-rgb), 0.08);
        font-size: 0.72rem;
        font-weight: 750;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .privacy-note {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: auto;
        padding: 14px;
        border: 1px solid var(--popup-stroke);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.05);
    }

    .privacy-note > div {
        display: grid;
        gap: 3px;
    }

    .privacy-note span:last-child,
    .match-context p {
        margin: 0;
        color: var(--subtext);
        font-size: 0.82rem;
        line-height: 1.45;
    }

    .privacy-icon,
    .context-icon {
        width: 30px;
        height: 24px;
        flex: 0 0 auto;
        border: 2px solid var(--accent-strong);
        border-radius: 7px;
        position: relative;
    }

    .privacy-icon::after,
    .context-icon::after {
        content: "";
        position: absolute;
        top: 5px;
        right: -8px;
        width: 8px;
        height: 10px;
        border-radius: 0 4px 4px 0;
        background: var(--accent-strong);
    }

    .preference-card {
        display: grid;
        align-content: center;
        gap: 18px;
        padding: clamp(24px, 3vw, 40px);
    }

    .preference-head {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 1.05rem;
    }

    .preference-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
    }

    .quick-field {
        display: grid;
        gap: 7px;
        padding: 11px;
        border: 1px solid transparent;
        border-radius: 13px;
        color: var(--subtext);
        font-size: 0.82rem;
    }

    .quick-field.primary-filter {
        border-color: rgba(var(--accent-rgb), 0.42);
        background:
            linear-gradient(135deg, rgba(var(--accent-rgb), 0.14), rgba(var(--accent-rgb), 0.045)),
            var(--popup-bg);
        box-shadow: 0 8px 20px rgba(var(--accent-rgb), 0.08);
    }

    .quick-field.primary-filter > span {
        color: var(--accent-strong);
        font-size: 0.9rem;
        font-weight: 780;
    }

    .quick-field select {
        width: 100%;
        min-height: 44px;
        padding: 8px 10px;
        border: 1px solid var(--popup-stroke);
        border-radius: 11px;
        color: var(--text);
        background: transparent;
    }

    .quick-field.primary-filter select {
        min-height: 48px;
        border-color: rgba(var(--accent-rgb), 0.48);
        background: rgba(var(--accent-rgb), 0.055);
        font-size: 0.98rem;
        font-weight: 680;
    }

    .icebreaker-choice {
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 12px;
        border: 1px solid var(--popup-stroke);
        border-radius: 12px;
        cursor: pointer;
    }

    .icebreaker-choice input {
        width: 18px;
        height: 18px;
        margin-top: 2px;
    }

    .icebreaker-choice span {
        display: grid;
        gap: 3px;
    }

    .icebreaker-choice small {
        color: var(--subtext);
        line-height: 1.4;
    }

    .age-confirmation {
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 12px;
        border: 1px solid rgba(214, 69, 69, 0.38);
        border-radius: 12px;
        background: rgba(214, 69, 69, 0.055);
        cursor: pointer;
    }

    .age-confirmation.confirmed {
        border-color: rgba(var(--accent-rgb), 0.4);
        background: rgba(var(--accent-rgb), 0.06);
    }

    .age-confirmation input {
        width: 18px;
        height: 18px;
        margin-top: 2px;
    }

    .age-confirmation span {
        display: grid;
        gap: 3px;
    }

    .age-confirmation small {
        color: var(--subtext);
        line-height: 1.4;
    }

    .primary-action {
        width: 100%;
        min-height: 68px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border: 1px solid rgba(var(--accent-rgb), 0.95);
        border-radius: 14px;
        color: #fff;
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.96), rgba(var(--accent-rgb), 0.7));
        box-shadow: 0 12px 28px rgba(var(--accent-rgb), 0.2);
        text-align: left;
        cursor: pointer;
    }

    .primary-action .step-label {
        color: #fff;
        background: rgba(255, 255, 255, 0.18);
    }

    .primary-action > span:nth-child(2) {
        display: grid;
        gap: 2px;
    }

    .primary-action small {
        color: rgba(255, 255, 255, 0.78);
    }

    .primary-action:disabled,
    .secondary-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .action-arrow {
        font-size: 1.5rem;
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

    .searching-view {
        min-height: 410px;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 22px;
        padding: 36px 20px;
        text-align: center;
        background:
            radial-gradient(circle at 50% 46%, rgba(var(--accent-rgb), 0.16), transparent 30%),
            linear-gradient(145deg, rgba(var(--accent-rgb), 0.08), transparent 64%);
    }

    .searching-copy {
        display: grid;
        justify-items: center;
        gap: 8px;
    }

    .searching-copy h2 {
        margin: 0;
        font-size: clamp(1.5rem, 3vw, 2.25rem);
    }

    .searching-copy p {
        margin: 0;
        color: var(--subtext);
    }

    .search-radar {
        position: relative;
        width: 116px;
        height: 116px;
        display: grid;
        place-items: center;
    }

    .search-radar::after {
        content: "";
        width: 22px;
        height: 22px;
        border-radius: 999px;
        background: var(--accent-strong);
        box-shadow: 0 0 0 9px rgba(var(--accent-rgb), 0.14);
    }

    .search-radar span {
        position: absolute;
        inset: 14px;
        border: 1px solid rgba(var(--accent-rgb), 0.5);
        border-radius: 999px;
        animation: radar-pulse 1.8s ease-out infinite;
    }

    .search-radar span:nth-child(2) {
        animation-delay: 0.6s;
    }

    .search-radar span:nth-child(3) {
        animation-delay: 1.2s;
    }

    .search-radar.compact {
        width: 88px;
        height: 88px;
    }

    @keyframes radar-pulse {
        from {
            opacity: 0.8;
            transform: scale(0.3);
        }
        to {
            opacity: 0;
            transform: scale(1.25);
        }
    }

    .secondary-action {
        min-height: 44px;
        padding: 9px 18px;
        border: 1px solid var(--popup-stroke);
        border-radius: 11px;
        color: var(--text);
        background: var(--popup-bg);
        cursor: pointer;
    }

    .secondary-action.danger {
        border-color: rgba(214, 69, 69, 0.62);
        color: #fff;
        background: rgba(190, 48, 48, 0.92);
    }

    .secondary-action.next {
        border-color: rgba(var(--accent-rgb), 0.7);
        color: #fff;
        background: rgba(var(--accent-rgb), 0.85);
    }

    .secondary-action.report,
    .report-action {
        border-color: rgba(255, 255, 255, 0.28);
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
    }

    .report-action {
        width: 100%;
        min-height: 42px;
        margin-top: 2px;
        border-style: solid;
        border-radius: 10px;
        cursor: pointer;
    }

    .conversation-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
        min-height: 480px;
        background: #0b0b0b;
    }

    .match-context {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        padding: 26px 22px;
        border-left: 1px solid rgba(255, 255, 255, 0.1);
        color: #f7f7f7;
        background:
            radial-gradient(circle at 100% 0%, rgba(var(--accent-rgb), 0.2), transparent 38%),
            #111;
    }

    .match-context .context-icon {
        border-color: var(--accent);
    }

    .peer-summary {
        width: 100%;
        display: grid;
        gap: 4px;
        margin-top: 8px;
        padding: 12px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }

    .peer-summary span {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.78rem;
    }

    .match-context .secondary-action {
        width: 100%;
        margin-top: auto;
    }

    .video-stage {
        position: relative;
        min-height: clamp(430px, 62vh, 720px);
        overflow: hidden;
        background: #050505;
    }

    .remote-video {
        position: absolute;
        inset: 0;
    }

    .video-connecting {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 14px;
        color: #fff;
        background:
            radial-gradient(circle at 50% 45%, rgba(var(--accent-rgb), 0.2), transparent 32%),
            #080808;
    }

    .local-video-pip {
        position: absolute;
        z-index: 3;
        top: 18px;
        right: 18px;
        width: min(24vw, 250px);
        aspect-ratio: 4 / 3;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.72);
        border-radius: 14px;
        background: #111;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
    }

    .local-video-pip span {
        position: absolute;
        left: 8px;
        bottom: 8px;
        padding: 4px 7px;
        border-radius: 7px;
        color: #fff;
        background: rgba(0, 0, 0, 0.52);
        font-size: 0.74rem;
    }

    .video-status-bar,
    .video-actions {
        position: absolute;
        z-index: 4;
        left: 16px;
        bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .video-actions {
        left: auto;
        right: 16px;
    }

    .timer-chip {
        font-variant-numeric: tabular-nums;
    }

    .icebreaker-panel {
        height: 100%;
        min-height: 480px;
        display: grid;
        grid-template-rows: auto 1fr auto auto;
        gap: 12px;
        padding: clamp(18px, 2.5vw, 30px);
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

    .conversation-kicker {
        color: var(--accent) !important;
        font-size: 0.72rem !important;
        font-weight: 780;
        letter-spacing: 0.08em;
        text-transform: uppercase;
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

    .chip {
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #f6f6f6;
        background: rgba(0, 0, 0, 0.45);
        padding: 6px 10px;
        font-size: 0.82rem;
        line-height: 1;
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
            min-height: 230px;
        }

        .community-copy {
            gap: 8px;
            padding: 22px 30px;
        }

        .community-copy h1 {
            font-size: clamp(1.9rem, 2.6vw, 2.85rem);
        }

        .community-preview {
            min-height: 230px;
        }

        .ready-layout {
            min-height: 370px;
        }
    }

    .report-panel {
        width: min(520px, 96vw);
        display: grid;
        gap: 14px;
        padding: 18px;
        border: 1px solid var(--popup-stroke);
        border-radius: 16px;
        color: var(--text);
        background: var(--popup-bg);
    }

    .report-panel .settings-head > div {
        display: grid;
        gap: 4px;
    }

    .report-panel .settings-head p,
    .report-warning {
        margin: 0;
        color: var(--subtext);
        font-size: 0.86rem;
        line-height: 1.45;
    }

    .report-panel textarea {
        resize: vertical;
        min-height: 90px;
        padding: 9px 10px;
        border: 1px solid var(--popup-stroke);
        border-radius: 10px;
        color: var(--text);
        background: transparent;
    }

    @media (max-width: 980px) {
        .community-hero {
            grid-template-columns: minmax(0, 1fr) minmax(320px, 0.7fr);
        }

        .community-copy {
            padding: 28px 24px 22px;
        }

        .community-copy h1 {
            font-size: clamp(1.9rem, 5vw, 2.8rem);
        }

        .ready-layout {
            grid-template-columns: 1fr;
        }

        .ready-intro {
            min-height: 280px;
        }

        .conversation-layout {
            grid-template-columns: 1fr;
        }

        .match-context {
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            border-left: none;
        }

        .match-context .secondary-action {
            width: auto;
        }

        .local-video-pip {
            width: min(34vw, 220px);
        }

        .seo-grid {
            grid-template-columns: 1fr;
        }

        .safe-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
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
            position: relative;
            inset: auto;
            height: auto;
            aspect-ratio: 16 / 8;
        }

        .safe-grid {
            grid-template-columns: 1fr;
        }

        .community-hero {
            grid-template-columns: 1fr;
        }

        .community-preview {
            min-height: 0;
        }

        .workspace-head {
            align-items: flex-start;
            padding: 12px;
        }

        .workspace-status span:last-child {
            display: none;
        }

        .ready-intro,
        .preference-card {
            padding: 22px 16px;
        }

        .ready-intro {
            min-height: 250px;
        }

        .preference-grid {
            grid-template-columns: 1fr;
        }

        .conversation-layout,
        .icebreaker-panel {
            min-height: 520px;
        }

        .message-compose {
            grid-template-columns: 1fr;
        }

        .video-stage {
            min-height: 68vh;
        }

        .local-video-pip {
            top: 12px;
            right: 12px;
            width: 34vw;
        }

        .video-status-bar {
            left: 10px;
            bottom: 72px;
        }

        .video-actions {
            right: 10px;
            left: 10px;
            bottom: 12px;
        }

        .video-actions .secondary-action {
            flex: 1;
        }
    }
</style>
