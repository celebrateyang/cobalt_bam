<script lang="ts">
    import { t, INTERNAL_locale, defaultLocale } from "$lib/i18n/translations";
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";

    import Omnibox from "$components/save/Omnibox.svelte";
    import Meowbalt from "$components/misc/Meowbalt.svelte";
    import SupportedServices from "$components/save/SupportedServices.svelte";

    import IconAlertTriangle from "@tabler/icons-svelte/IconAlertTriangle.svelte";
    import IconClipboard from "$components/icons/Clipboard.svelte";
    import IconVideo from "@tabler/icons-svelte/IconVideo.svelte";
    import IconStack2 from "@tabler/icons-svelte/IconStack2.svelte";
    import IconListCheck from "@tabler/icons-svelte/IconListCheck.svelte";
    import env from "$lib/env";
    import languages from "$i18n/languages.json";
    import { createDialog } from "$lib/state/dialogs";
    import { link as omniboxLink } from "$lib/state/omnibox";
    import { currentApiURL } from "$lib/api/api-url";
    import IconCoin from "@tabler/icons-svelte/IconCoin.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";

    type HomeDeferredSectionsComponent =
        typeof import("$components/home/HomeDeferredSections.svelte").default;
    type ClerkRuntimeModule = typeof import("$lib/state/clerk");

    export let data: { lang?: string };

    // Initialize immediately so downstream constants see a defined value
    const languageCodes = Object.keys(languages);
    let currentLocale: string = data?.lang ?? $INTERNAL_locale ?? defaultLocale;
    // Keep in sync with route changes
    $: {
        const pathLocale = $page?.url?.pathname?.split("/")[1];
        currentLocale =
            data?.lang ??
            $page?.params?.lang ??
            (pathLocale && languageCodes.includes(pathLocale)
                ? pathLocale
                : undefined) ??
            $INTERNAL_locale ??
            defaultLocale;
    }

    /*import Header from "$components/misc/Header.svelte"; // 导航栏组件
    import BlogPreview from "$components/blog/BlogPreview.svelte"; // 博客预览组件*/
    const donateLinks: Record<"en" | "th" | "zh" | "ru", string> = {
        en: "https://buy.stripe.com/8wM5o6bHMeoO9oc8wz",
        th: "https://buy.stripe.com/dR6bMu5jobcC57W3ce",
        zh: "https://buy.stripe.com/5kAeYG7rwgwW43S4gh",
        ru: "https://buy.stripe.com/5kAeYG7rwgwW43S4gh",
    };
    $: donateLink =
        donateLinks[currentLocale as keyof typeof donateLinks] ??
        donateLinks.en;

    let showNotification = false; // ?????????????????
    const fallbackHost = env.HOST || "freesavevideo.online";
    const clerkRuntimeEnabled = Boolean(env.CLERK_PUBLISHABLE_KEY);
    let clerkRuntimePromise: Promise<ClerkRuntimeModule> | null = null;
    let clerkRuntime: ClerkRuntimeModule | null = null;
    let clerkStoreBindingsReady = false;
    let cleanupClerkStoreBindings = () => {};
    let clerkUserState: { id: string } | null = null;
    let signedInState = false;

    const ensureClerkRuntime = async (): Promise<ClerkRuntimeModule | null> => {
        if (!browser || !clerkRuntimeEnabled) return null;

        if (!clerkRuntimePromise) {
            clerkRuntimePromise = import("$lib/state/clerk");
        }
        if (!clerkRuntime) {
            clerkRuntime = await clerkRuntimePromise;
        }
        if (!clerkRuntime || clerkStoreBindingsReady) {
            return clerkRuntime;
        }

        const unsubscribeUser = clerkRuntime.clerkUser.subscribe((value) => {
            clerkUserState = (value as { id: string } | null) ?? null;
        });
        const unsubscribeSignedIn = clerkRuntime.isSignedIn.subscribe((value) => {
            signedInState = Boolean(value);
        });

        clerkStoreBindingsReady = true;
        cleanupClerkStoreBindings = () => {
            unsubscribeUser();
            unsubscribeSignedIn();
            clerkStoreBindingsReady = false;
            cleanupClerkStoreBindings = () => {};
        };

        return clerkRuntime;
    };

    const platformsList = [
        "douyin",
        "bilibili",
        "kuaishou",
        "xiaohongshu",
        "instagram",
        "youtube",
        "facebook",
        "twitter",
    ];

    const platformLabels = {
        bilibili: { zh: "B站", default: "Bilibili" },
        douyin: { zh: "抖音", default: "Douyin" },
        tiktok: { zh: "TikTok", default: "TikTok" },
        kuaishou: { zh: "快手", default: "Kuaishou" },
        instagram: { zh: "Instagram", default: "Instagram" },
    } as const;

    type CapabilityPlatform = keyof typeof platformLabels;

    const collectionPlatforms: CapabilityPlatform[] = ["bilibili", "douyin", "tiktok"];
    const batchPlatforms: CapabilityPlatform[] = [
        "douyin",
        "tiktok",
        "kuaishou",
        "instagram",
        "bilibili",
    ];

    const getPlatformLabel = (platform: CapabilityPlatform) =>
        currentLocale === "zh"
            ? platformLabels[platform].zh
            : platformLabels[platform].default;

    const accountPath = () => `/${currentLocale}/account`;

    const buildFeedbackRedirectPath = () => {
        const next = new URL($page.url.toString());
        next.searchParams.set("feedback", "1");
        return `${next.pathname}${next.search}`;
    };

    const openFeedbackDialog = () => {
        createDialog({
            id: "feedback",
            type: "feedback",
            initialVideoUrl: $omniboxLink,
        });
    };

    const openFeedback = async () => {
        if (!clerkRuntimeEnabled) {
            openFeedbackDialog();
            return true;
        }

        const runtime = await ensureClerkRuntime();
        if (!runtime) {
            openFeedbackDialog();
            return true;
        }

        if (!signedInState) {
            const alreadySignedIn = await runtime.checkSignedIn();
            if (!alreadySignedIn) {
                const redirectTo = buildFeedbackRedirectPath();
                await goto(
                    `${accountPath()}?signin=1&redirect=${encodeURIComponent(redirectTo)}`,
                );
                return false;
            }
        }

        openFeedbackDialog();
        return true;
    };

    const LOW_POINTS_THRESHOLD = 10;
    const lowPointsBalloonKeyForUser = (userId: string) =>
        `low-points-balloon-dismissed:${userId}`;

    let userPoints: number | null = null;
    let pointsLoading = false;
    let lastPointsUserId: string | null = null;

    let lowPointsBalloonDismissed = false;
    let lowPointsBalloonDismissKey: string | null = null;
    let lastDismissUserId: string | null = null;
    let showLowPointsBalloon = false;

    const dismissLowPointsBalloon = () => {
        lowPointsBalloonDismissed = true;
        if (browser && lowPointsBalloonDismissKey) {
            localStorage.setItem(lowPointsBalloonDismissKey, "1");
        }
    };

    const fetchUserPoints = async () => {
        const userId = clerkUserState?.id;
        if (!userId) return;
        if (lastPointsUserId === userId) return;

        pointsLoading = true;
        try {
            const runtime = await ensureClerkRuntime();
            if (!runtime) throw new Error("clerk not ready");

            const token = await runtime.getClerkToken();
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

            userPoints = data.data?.user?.points ?? null;
            lastPointsUserId = userId;
        } catch (error) {
            userPoints = null;
            console.debug("load points failed", error);
        } finally {
            pointsLoading = false;
        }
    };

    const goToAccountForPoints = async () => {
        dismissLowPointsBalloon();
        await goto(accountPath());
    };

    $: if (browser && clerkUserState?.id) {
        const userId = clerkUserState.id;
        if (lastDismissUserId !== userId) {
            lastDismissUserId = userId;
            const key = lowPointsBalloonKeyForUser(userId);
            lowPointsBalloonDismissKey = key;
            lowPointsBalloonDismissed = localStorage.getItem(key) === "1";
        }
    }

    $: if (clerkUserState && pointsFetchArmed) {
        void fetchUserPoints();
    } else {
        userPoints = null;
        lastPointsUserId = null;
        lowPointsBalloonDismissed = false;
        lowPointsBalloonDismissKey = null;
        lastDismissUserId = null;
    }

    $: showLowPointsBalloon =
        browser &&
        signedInState &&
        !pointsLoading &&
        userPoints !== null &&
        userPoints < LOW_POINTS_THRESHOLD &&
        !lowPointsBalloonDismissed;

    $: platformCards = platformsList.map((slug) => ({
        slug,
        name: $t(`home.platforms.${slug}.name`),
        desc: $t(`home.platforms.${slug}.desc`),
    }));
    $: faqItems = [
        {
            q:
                currentLocale === "zh"
                    ? "如何下载抖音、B站、快手、小红书等平台的视频？"
                    : "How to download videos from Douyin, Bilibili, Kuaishou or Xiaohongshu?",
            a:
                currentLocale === "zh"
                    ? "复制视频链接，粘贴到输入框，保持“自动”模式，点击“解析链接”即可生成无水印下载地址。"
                    : "Copy the video link, paste it into the box, keep ‘Auto’ mode and click download to get a clean link.",
        },
        {
            q:
                currentLocale === "zh"
                    ? "可以批量解析或切换音频/静音吗？"
                    : "Can I batch process or grab audio-only files?",
            a:
                currentLocale === "zh"
                    ? "支持批量解析入口，下载模式可在自动、音频、静音间切换。长视频会展示进度和速度。"
                    : "Batch mode is available and you can switch between auto, audio-only or muted downloads. Long videos show progress.",
        },
        {
            q:
                currentLocale === "zh"
                    ? "手机也能用吗，会不会有水印？"
                    : "Is it mobile-friendly and watermark-free?",
            a:
                currentLocale === "zh"
                    ? "完全网页版，手机/平板/电脑都可直接使用，解析后输出无水印高清文件。"
                    : "It runs in the browser on mobile/desktop and returns watermark-free HD files.",
        },
    ];
    $: siteUrl = `https://${fallbackHost}`;
    $: canonicalUrl = `${siteUrl}/${currentLocale}`;
    const stripYouTube = (value: string) => {
        if (!value) return value;
        let v = value.replace(/YouTube[, ]?\s*/gi, "");
        v = v.replace(/youtube[, ]?\s*/gi, "");
        v = v.replace(/[, ]\s*[, ]+/g, ",");
        v = v.replace(/^\s*[, ]\s*/, "");
        v = v.replace(/\s{2,}/g, " ").trim();
        return v;
    };

    $: seoName = stripYouTube($t("general.cobalt"));
    $: seoTitle = stripYouTube($t("general.seo.home.title"));
    $: seoDescription = stripYouTube($t("general.seo.home.description"));
    $: seoKeywords = stripYouTube($t("general.seo.home.keywords"));
    $: embedDescription = stripYouTube($t("general.embed.description"));
    $: guideDescription1 = stripYouTube($t("general.guide.description1"));
    $: guideDescription2 = stripYouTube($t("general.guide.description2"));
    $: jsonLd = canonicalUrl
        ? {
              "@context": "https://schema.org",
              "@type": "WebSite",
              url: canonicalUrl,
              inLanguage: currentLocale,
              name: seoName,
              description: seoDescription,
          }
        : null;
    $: faqJsonLd = canonicalUrl
        ? {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqItems.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: {
                      "@type": "Answer",
                      text: item.a,
                  },
              })),
          }
        : null;
    $: appJsonLd = canonicalUrl
        ? {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: seoName,
              description: seoDescription,
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Any",
              offers: {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "USD",
              },
          }
        : null;
    $: structuredData = [jsonLd, faqJsonLd, appJsonLd].filter(Boolean);

    let HomeDeferredSections: HomeDeferredSectionsComponent | null = null;
    let deferredSectionsTarget: HTMLElement | null = null;
    let deferredSectionsObserver: IntersectionObserver | null = null;
    let deferredSectionsLoading = false;
    let deferredWorkArmed = false;
    let pointsFetchArmed = false;

    const loadDeferredSections = async () => {
        if (deferredSectionsLoading || HomeDeferredSections) return;
        deferredSectionsLoading = true;

        try {
            const module = await import("$components/home/HomeDeferredSections.svelte");
            HomeDeferredSections = module.default;
        } finally {
            deferredSectionsLoading = false;
        }
    };

    const startDeferredSectionsWhenVisible = () => {
        if (HomeDeferredSections || deferredSectionsLoading) return;

        if (
            !browser ||
            !deferredSectionsTarget ||
            typeof window.IntersectionObserver === "undefined"
        ) {
            void loadDeferredSections();
            return;
        }

        deferredSectionsObserver = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                deferredSectionsObserver?.disconnect();
                deferredSectionsObserver = null;
                void loadDeferredSections();
            },
            {
                rootMargin: "420px 0px",
                threshold: 0.01,
            },
        );

        deferredSectionsObserver.observe(deferredSectionsTarget);
    };

    const runOnIdle = (callback: () => void, timeout = 2500) => {
        if (!browser) return () => {};

        if ("requestIdleCallback" in window) {
            const handle = window.requestIdleCallback(callback, { timeout });
            return () => window.cancelIdleCallback?.(handle);
        }

        const handle = window.setTimeout(callback, Math.min(timeout, 1200));
        return () => window.clearTimeout(handle);
    };

    // 检查本地存储中是否已关闭通知
    const armDeferredHomeTasks = () => {
        if (deferredWorkArmed) return;
        deferredWorkArmed = true;
        pointsFetchArmed = true;
        startDeferredSectionsWhenVisible();
    };

    onMount(() => {
        const needsImmediateClerk = Boolean($page.url.searchParams.get("feedback"));
        const feedbackRequested = Boolean($page.url.searchParams.get("feedback"));
        let cancelClerkInit = () => {};
        let cancelHomeArm = () => {};
        let cancelDeferredLoad = () => {};
        let cancelNotificationInit = () => {};

        if (clerkRuntimeEnabled) {
            if (needsImmediateClerk) {
                void ensureClerkRuntime().then((runtime) => runtime?.initClerk());
            } else {
                cancelClerkInit = runOnIdle(() => {
                    void ensureClerkRuntime().then((runtime) => runtime?.initClerk());
                }, 3800);
            }
        }

        cancelNotificationInit = runOnIdle(() => {
            const notificationClosed = localStorage.getItem(
                "notification-finditbuddy-launch-closed",
            );
            if (notificationClosed === "true") {
                showNotification = false;
            }
        }, 1200);

        cancelHomeArm = runOnIdle(() => {
            armDeferredHomeTasks();
        }, 2600);

        cancelDeferredLoad = runOnIdle(() => {
            void loadDeferredSections();
        }, 7200);

        const armOnInteraction = () => {
            armDeferredHomeTasks();
        };

        window.addEventListener("pointerdown", armOnInteraction, {
            once: true,
            passive: true,
        });
        window.addEventListener("keydown", armOnInteraction, { once: true });
        window.addEventListener("scroll", armOnInteraction, {
            once: true,
            passive: true,
        });
        if (feedbackRequested) {
            armDeferredHomeTasks();
            void (async () => {
                const opened = await openFeedback();
                if (!opened) return;

                const cleaned = new URL($page.url.toString());
                cleaned.searchParams.delete("feedback");

                await goto(`${cleaned.pathname}${cleaned.search}`, {
                    replaceState: true,
                    keepfocus: true,
                    noScroll: true,
                });
            })();
        }

        return () => {
            cancelClerkInit();
            cancelHomeArm();
            cancelDeferredLoad();
            cancelNotificationInit();
            window.removeEventListener("pointerdown", armOnInteraction);
            window.removeEventListener("keydown", armOnInteraction);
            window.removeEventListener("scroll", armOnInteraction);
            deferredSectionsObserver?.disconnect();
            deferredSectionsObserver = null;
            cleanupClerkStoreBindings();
        };
    });

    // 关闭通知并保存状态到本地存储
    const closeNotification = () => {
        showNotification = false;
        localStorage.setItem("notification-finditbuddy-launch-closed", "true");
    };
</script>

<svelte:head>
    <title>{seoTitle}</title>
    <meta name="description" content={seoDescription} />
    <meta name="keywords" content={seoKeywords} />
    <meta name="applicable-device" content="pc,mobile" />
    <meta http-equiv="Cache-Control" content="no-transform" />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={seoDescription} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={seoDescription} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og.png`} />
    {#if structuredData.length}
        {#each structuredData as ld}
            {@html `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`}
        {/each}
    {/if}
</svelte:head>

<!--<Header />-->

<div id="cobalt-save-container" class="center-column-container">
    <SupportedServices />
    <main
        id="cobalt-save"
        tabindex="-1"
        data-first-focus
        data-focus-ring-hidden
    >
        <!-- 通知信息 -->
        {#if showNotification}
            <div class="notification" role="alert">
                <button
                    class="notification-close"
                    aria-label={$t("general.notification.close")}
                    on:click={closeNotification}
                >
                    ×
                </button>
                <div class="notification-content">
                    <span class="notification-icon">📢</span>
                    <span class="notification-text">
                        {$t("general.notification.title")}
                        <br />
                        {@html $t(
                            "general.notification.youtube_restriction",
                        ).replace(
                            "https://www.bilibili.com/video/BV1Bp4EzeEJo",
                            '<a href="https://www.bilibili.com/video/BV1Bp4EzeEJo" target="_blank" rel="noopener noreferrer" class="notification-link">https://www.bilibili.com/video/BV1Bp4EzeEJo</a>',
                        )}
                    </span>
                </div>
            </div>
        {/if}

        <Meowbalt emotion="smile" />
        <Omnibox />
        <section
            id="capabilities"
            class="capabilities"
            aria-label={$t("home.capabilities.aria")}
        >
            <div class="cap-card cap-card--collection">
                <div class="cap-card-inner">
                    <div class="cap-head">
                        <div class="cap-icon"><IconStack2 size={20} /></div>
                        <div class="cap-title">
                            {$t("home.capabilities.collection.title")}
                        </div>
                    </div>

                    <p class="cap-desc">{$t("home.capabilities.collection.desc")}</p>

                    <div
                        class="cap-chips"
                        aria-label={$t("home.capabilities.platforms")}
                    >
                        {#each collectionPlatforms as platform}
                            <span class="cap-chip">
                                {getPlatformLabel(platform)}
                            </span>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="cap-card cap-card--batch">
                <div class="cap-card-inner">
                    <div class="cap-head">
                        <div class="cap-icon"><IconListCheck size={20} /></div>
                        <div class="cap-title">
                            {$t("home.capabilities.batch.title")}
                        </div>
                    </div>

                    <p class="cap-desc">{$t("home.capabilities.batch.desc")}</p>

                    <div
                        class="cap-chips"
                        aria-label={$t("home.capabilities.platforms")}
                    >
                        {#each batchPlatforms as platform}
                            <span class="cap-chip">
                                {getPlatformLabel(platform)}
                            </span>
                        {/each}
                    </div>
                </div>
            </div>
        </section>
        <!--<UserGuide/>-->
    </main>

    <!-- Feature Cards -->
    <section class="feature-cards">
        <a
            href={`/${currentLocale}/discover`}
            class="feature-card feature-card--discover"
        >
            <div class="icon-wrapper"><IconVideo size={28} /></div>
            <div class="card-content">
                <h3>{$t("tabs.feature.discover_trends")}</h3>
                <p class="card-desc">
                    {$t("general.seo.discover.description")}
                </p>
            </div>
        </a>
        <button type="button" class="feature-card" on:click={openFeedback}>
            <div class="icon-wrapper"><IconAlertTriangle size={28} /></div>
            <div class="card-content">
                <h3>{$t("tabs.feature.feedback")}</h3>
                <p class="card-desc">{$t("home.feedback.desc")}</p>
            </div>
        </button>
        <a href={`/${currentLocale}/clipboard`} class="feature-card">
            <div class="icon-wrapper"><IconClipboard /></div>
            <div class="card-content">
                <h3>{$t("tabs.feature.file_transfer")}</h3>
                <p class="card-desc">
                    {$t("general.seo.transfer.description")}
                </p>
            </div>
        </a>
    </section>

    <div class="deferred-sections-anchor" bind:this={deferredSectionsTarget} aria-hidden="true"></div>
    {#if HomeDeferredSections}
        <svelte:component
            this={HomeDeferredSections}
            {currentLocale}
            {canonicalUrl}
            {platformCards}
            {seoTitle}
            {seoDescription}
            {guideDescription1}
            {guideDescription2}
            {embedDescription}
            {seoKeywords}
        />
    {:else}
        <div class="deferred-sections-placeholder" aria-hidden="true"></div>
    {/if}
    {#if showLowPointsBalloon}
        <div class="low-points-balloon-wrapper" aria-label={$t("home.points_balloon.aria")}>
            <button
                type="button"
                class="low-points-balloon"
                on:click={() => void goToAccountForPoints()}
                aria-label={$t("home.points_balloon.aria")}
            >
                <div class="low-points-balloon-icon" aria-hidden="true">
                    <IconCoin size={18} />
                </div>

                <div class="low-points-balloon-content">
                    <div class="low-points-balloon-title">
                        {$t("home.points_balloon.title")}
                    </div>
                    <div class="low-points-balloon-text">
                        <span class="low-points-balloon-text-main">
                            {$t("home.points_balloon.text")}
                        </span>
                        <span
                            class="low-points-balloon-points"
                            aria-label={`${userPoints} ${$t("home.points_balloon.points_label")}`}
                        >
                            <span class="low-points-balloon-points-number">
                                {userPoints}
                            </span>
                            <span class="low-points-balloon-points-label">
                                {$t("home.points_balloon.points_label")}
                            </span>
                        </span>
                    </div>
                </div>
            </button>
            <button
                type="button"
                class="low-points-balloon-close"
                aria-label={$t("home.points_balloon.close")}
                on:click|stopPropagation={dismissLowPointsBalloon}
            >
                <IconX size={16} />
            </button>
        </div>
    {/if}
</div>

<style>
    #cobalt-save-container {
        padding: var(--padding);
        /* 允许纵向滚动，移除 overflow:hidden 限制 */
        overflow-y: auto;
        overflow-x: hidden;
        justify-content: space-between;
        min-height: 100%;
        box-sizing: border-box;
    }

    #cobalt-save {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        /* Optimized spacing - reduced from 65vh */
        min-height: 50vh;
        gap: 20px;
        margin-bottom: 32px;
    }

    @media (min-width: 900px) {
        #cobalt-save {
            min-height: clamp(360px, 44vh, 440px);
            margin-bottom: 32px;
        }
    }

    .capabilities {
        width: 100%;
        max-width: 860px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        position: relative;
        padding: 2px;
    }

    .capabilities::before {
        content: "";
        position: absolute;
        inset: -18px -14px -22px;
        background:
            radial-gradient(
                480px circle at 24% 8%,
                rgba(var(--accent-rgb), 0.11),
                transparent 66%
            ),
            radial-gradient(
                440px circle at 78% 72%,
                rgba(47, 138, 249, 0.07),
                transparent 66%
            );
        opacity: 0.24;
        pointer-events: none;
    }

    :global(#cobalt[data-reduce-transparency="true"]) .capabilities::before {
        opacity: 0.12;
    }

    .cap-card {
        position: relative;
        z-index: 1;
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
        transition:
            transform 0.18s ease,
            box-shadow 0.18s ease;
        --cap-a-x: 18%;
        --cap-b-x: 82%;
        --cap-line: linear-gradient(
            90deg,
            rgba(var(--accent-rgb), 0.85),
            rgba(47, 138, 249, 0.65),
            rgba(var(--accent-rgb), 0.35)
        );
    }

    .cap-card--batch {
        --cap-a-x: 82%;
        --cap-b-x: 18%;
        --cap-line: linear-gradient(
            90deg,
            rgba(47, 138, 249, 0.7),
            rgba(var(--accent-rgb), 0.78),
            rgba(47, 138, 249, 0.35)
        );
    }

    .cap-card::before {
        content: "";
        position: absolute;
        left: 12px;
        right: 12px;
        top: 10px;
        height: 2px;
        border-radius: 999px;
        background: var(--cap-line);
        opacity: 0.9;
        pointer-events: none;
        transform: translateZ(0);
    }

    @media (hover: hover) {
        .cap-card:hover {
            transform: translateY(-1px);
            box-shadow: 0 14px 30px rgba(0, 0, 0, 0.1);
        }
    }

    :global(#cobalt[data-reduce-motion="true"]) .cap-card {
        transition: none;
    }

    :global(#cobalt[data-reduce-motion="true"]) .cap-card:hover {
        transform: none;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
    }

    .cap-card-inner {
        height: 100%;
        border-radius: 18px;
        padding: 14px 14px 12px;
        background: var(--button);
        border: 1px solid var(--button-stroke);
        color: var(--text);
        position: relative;
        overflow: hidden;
    }

    .cap-card-inner::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(
            140deg,
            rgba(var(--accent-rgb), 0.05),
            transparent 60%
        );
        opacity: 0.7;
        pointer-events: none;
    }

    :global([data-theme="dark"]) .cap-card-inner::before {
        background: linear-gradient(140deg, rgba(255, 255, 255, 0.08), transparent 60%);
        opacity: 0.45;
    }

    .cap-card-inner::after {
        content: "";
        position: absolute;
        inset: -60px;
        background:
            radial-gradient(
                circle at var(--cap-a-x) 18%,
                rgba(var(--accent-rgb), 0.18),
                transparent 60%
            ),
            radial-gradient(
                circle at var(--cap-b-x) 85%,
                rgba(47, 138, 249, 0.12),
                transparent 60%
            );
        opacity: 0.65;
        pointer-events: none;
        transform: translateZ(0);
    }

    .cap-head {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
    }

    .cap-icon {
        width: 36px;
        height: 36px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--accent-background);
        border: 1px solid rgba(var(--accent-rgb), 0.22);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        color: var(--accent);
        flex-shrink: 0;
    }

    .cap-title {
        font-weight: 700;
        color: var(--text);
        letter-spacing: 0.2px;
        font-size: 14.5px;
        line-height: 1.2;
    }

    .cap-desc {
        position: relative;
        z-index: 1;
        margin: 0 0 10px 0;
        color: var(--subtext);
        line-height: 1.55;
        font-size: 13.8px;
    }

    .cap-chips {
        position: relative;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .cap-chip {
        display: inline-flex;
        align-items: center;
        padding: 5px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 500;
        color: var(--text);
        background: rgba(var(--accent-rgb), 0.1);
        border: 1px solid rgba(var(--accent-rgb), 0.2);
        box-shadow: none;
        user-select: none;
    }

    @media (hover: hover) {
        .cap-chip:hover {
            background: rgba(var(--accent-rgb), 0.14);
            border-color: rgba(var(--accent-rgb), 0.28);
        }
    }

    @media (max-width: 720px) {
        .capabilities {
            grid-template-columns: 1fr;
            max-width: 560px;
        }
    }

    @media screen and (max-width: 535px) {
        #cobalt-save-container {
            padding-top: calc(var(--padding) / 2);
        }
    }

    /* 通知组件样式 */
    .notification {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--padding);
        background-color: #e8f5e8;
        color: #2e7d32;
        border-radius: var(--border-radius);
        width: 100%;
        max-width: 640px;
        box-sizing: border-box;
        margin-bottom: var(--padding);
        animation: slideIn 0.5s ease-out;
        border: 1px solid #c8e6c9;
    }
    .notification-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 10px;
    }
    .notification-icon {
        font-size: 1.5rem;
        margin-right: 10px;
    }
    .notification-text {
        flex: 1;
        font-size: 0.9rem;
    }
    .notification-close {
        background: none;
        border: none;
        color: inherit;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0;
        margin-left: 10px;
        transition: opacity 0.2s;
    }
    .notification-close:hover {
        opacity: 0.7;
    }

    .notification-link {
        color: #1976d2;
        text-decoration: underline;
        font-weight: 500;
        margin: 0 4px;
        transition: color 0.2s;
    }

    .notification-link:hover {
        color: #1565c0;
        text-decoration: none;
    }

    /* 深色模式下的通知样式 */
    @media (prefers-color-scheme: dark) {
        .notification {
            background-color: #1b3e1f;
            color: #81c784;
            border-color: #2e7d32;
        }

        .notification-link {
            color: #64b5f6;
        }

        .notification-link:hover {
            color: #90caf9;
        }
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    /* overrides for notification layout */
    .notification {
        position: relative;
    }
    .notification-content {
        align-items: flex-start;
        padding-right: 28px;
    }
    .notification-close {
        position: absolute;
        top: 6px;
        right: 8px;
        margin-left: 0;
        padding: 4px;
        line-height: 1;
    }

    /* Feature Cards */
    .feature-cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
        width: 100%;
        max-width: 1120px;
        margin: 0 auto 2rem;
        padding: 0 var(--padding);
        opacity: 0.95;
    }

    .feature-cards {
        content-visibility: auto;
        contain-intrinsic-size: 1px 680px;
    }

    .feature-card {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        padding: 1.5rem;
        background: var(--surface-1);
        border-radius: var(--border-radius);
        text-decoration: none;
        color: var(--text);
        cursor: pointer;
        text-align: left;
        font: inherit;
        appearance: none;
        transition:
            background 0.2s,
            border-color 0.2s;
        border: 1px solid transparent;
        contain: layout paint style;
    }

    .feature-card:hover {
        background: var(--surface-2);
        border-color: var(--accent);
    }

    .feature-card.active {
        border-color: var(--accent);
        background: var(--surface-2);
    }

    .icon-wrapper {
        color: var(--accent);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: var(--surface-3);
        border-radius: 50%;
    }

    .card-content {
        flex: 1 1 auto;
        min-width: 0;
    }

    .card-content h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.1rem;
        font-weight: 600;
    }

    .card-desc {
        margin: 0;
        font-size: 0.9rem;
        opacity: 0.8;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
    }

    .feature-card--discover {
        align-items: center;
        grid-column: 1 / -1;
    }
    .deferred-sections-anchor {
        width: 100%;
        height: 1px;
    }

    .deferred-sections-placeholder {
        width: 100%;
        max-width: 1100px;
        margin: 0 auto 8px;
        min-height: 160px;
        content-visibility: auto;
        contain-intrinsic-size: 1px 360px;
    }

    @media (max-width: 600px) {
        #cobalt-save {
            min-height: auto;
            padding-bottom: calc(env(safe-area-inset-bottom, 20px) + 70px);
            margin-bottom: 16px;
            gap: 16px;
        }

        .capabilities {
            gap: 10px;
        }

        .cap-card-inner {
            padding: 12px 12px 10px;
        }

        .cap-desc {
            font-size: 13px;
            margin-bottom: 8px;
        }

        .cap-title {
            font-size: 14px;
        }

        .feature-cards {
            grid-template-columns: 1fr;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }

        .feature-card {
            padding: 1rem;
        }

        .deferred-sections-placeholder {
            min-height: 120px;
        }
    }

    .low-points-balloon-wrapper {
        position: fixed;
        left: calc(var(--sidebar-width) + 18px);
        top: calc(var(--padding) + env(safe-area-inset-top, 0px) + 12px);
        z-index: 60;
        max-width: 320px;
        width: min(
            320px,
            calc(100vw - var(--sidebar-width) - (var(--padding) * 2) - 18px)
        );
        pointer-events: none;
    }

    .low-points-balloon {
        width: 100%;
        border: 1px solid var(--surface-2);
        background: radial-gradient(
                120px 80px at top right,
                rgba(0, 0, 0, 0.08),
                transparent
            ),
            var(--surface-1);
        border-radius: 20px;
        padding: 12px 14px;
        box-shadow: var(--button-box-shadow);
        text-align: left;
        cursor: pointer;
        position: relative;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        padding-right: 40px;
        transition:
            transform 0.15s ease,
            border-color 0.15s ease;
        animation: low-points-balloon-enter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)
            both;
    }

    .low-points-balloon:hover {
        transform: translateY(-1px);
        border-color: var(--popup-stroke);
    }

    .low-points-balloon-icon {
        width: 36px;
        height: 36px;
        border-radius: 14px;
        border: 1px solid var(--surface-2);
        background: var(--accent-background);
        color: var(--accent);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        position: relative;
    }

    .low-points-balloon-icon::after {
        content: "";
        position: absolute;
        inset: -6px;
        border-radius: 18px;
        border: 2px solid currentColor;
        opacity: 0;
        transform: scale(0.75);
    }

    .low-points-balloon-title {
        font-weight: 900;
        color: var(--text);
        letter-spacing: -0.01em;
        margin-bottom: 4px;
        line-height: 1.2;
    }

    .low-points-balloon-text {
        color: var(--subtext);
        font-size: 13.5px;
        line-height: 1.35;
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 8px;
    }

    .low-points-balloon-text-main {
        min-width: 0;
    }

    .low-points-balloon-content {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1 1 auto;
    }

    .low-points-balloon-points {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        padding: 2px 10px;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        background: var(--surface-0);
        color: var(--text);
        flex: 0 0 auto;
    }

    .low-points-balloon-points-number {
        font-weight: 900;
        color: var(--text);
        font-size: 16px;
        line-height: 1;
        letter-spacing: -0.02em;
    }

    .low-points-balloon-points-label {
        font-size: 12px;
        font-weight: 700;
        color: var(--subtext);
    }

    .low-points-balloon-close {
        position: absolute;
        top: -10px;
        right: -10px;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        background: var(--surface-0);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        box-shadow: var(--button-box-shadow);
        transition:
            transform 0.15s ease,
            background 0.15s ease,
            border-color 0.15s ease;
    }

    .low-points-balloon-close:hover {
        transform: scale(1.02);
        background: var(--button-hover);
        border-color: var(--popup-stroke);
    }

    @media (max-width: 600px) {
        .low-points-balloon-wrapper {
            left: 14px;
            top: calc(var(--padding) + env(safe-area-inset-top, 0px) + 10px);
            width: calc(100vw - 28px);
        }

        .low-points-balloon-close {
            right: -8px;
            top: -8px;
        }
    }

    @keyframes low-points-balloon-enter {
        0% {
            opacity: 0;
            transform: translateY(-10px) scale(0.98);
        }
        60% {
            opacity: 1;
            transform: translateY(0) scale(1.02);
        }
        100% {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .low-points-balloon-wrapper,
        .low-points-balloon,
        .low-points-balloon-icon,
        .low-points-balloon-icon::after {
            animation: none !important;
        }
    }
</style>
