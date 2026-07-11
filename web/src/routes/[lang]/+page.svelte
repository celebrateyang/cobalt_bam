<script lang="ts">
    import { t, INTERNAL_locale, defaultLocale } from "$lib/i18n/translations";
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";

    import Omnibox from "$components/save/Omnibox.svelte";
    import SupportedServices from "$components/save/SupportedServices.svelte";
    import HomeDeferredSections from "$components/home/HomeDeferredSections.svelte";
    import NoPainStudyCard from "$components/home/NoPainStudyCard.svelte";

    import env from "$lib/env";
    import languages from "$i18n/languages.json";
    import { createDialog } from "$lib/state/dialogs";
    import { link as omniboxLink } from "$lib/state/omnibox";
    import { currentApiURL } from "$lib/api/api-url";
    import IconCoin from "@tabler/icons-svelte/IconCoin.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";
    import { getHubDownloadLinks, getHubGuideLinks } from "$lib/seo/internal-links";

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

    let showNotification = false; // notification is hidden by default
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
        "haokan",
        "toutiao",
        "sohu",
        "weibo",
        "amazon",
        "naver",
        "niconico",
        "xiaohongshu",
        "instagram",
        "threads",
        "youtube",
        "facebook",
        "twitter",
    ];

    const capabilityPlatformLabels = {
        bilibili: { zh: "B\u7AD9", default: "Bilibili" },
        douyin: { zh: "\u6296\u97F3", default: "Douyin" },
        tiktok: { zh: "TikTok", default: "TikTok" },
        kuaishou: { zh: "\u5FEB\u624B", default: "Kuaishou" },
        haokan: { zh: "\u597D\u770B\u89C6\u9891", default: "Haokan" },
        toutiao: { zh: "\u4ECA\u65E5\u5934\u6761", default: "Toutiao" },
        weibo: { zh: "\u5FAE\u535A", default: "Weibo" },
        naver: { zh: "NAVER", default: "NAVER" },
        instagram: { zh: "Instagram", default: "Instagram" },
        youtube: { zh: "YouTube", default: "YouTube" },
    } as const;

    type CapabilityPlatform = keyof typeof capabilityPlatformLabels;

    const collectionGuidePlatforms: CapabilityPlatform[] = [
        "bilibili",
        "douyin",
        "tiktok",
        "youtube",
    ];
    const batchGuidePlatforms: CapabilityPlatform[] = [
        "douyin",
        "tiktok",
        "kuaishou",
        "instagram",
        "bilibili",
    ];

    const getGuidePlatformLabel = (platform: CapabilityPlatform) =>
        currentLocale === "zh"
            ? capabilityPlatformLabels[platform].zh
            : capabilityPlatformLabels[platform].default;

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

    const buildGuideLabel = (title: string) =>
        currentLocale === "zh" ? `${title}\u8BF4\u660E` : `${title} guide`;

    const LOW_POINTS_THRESHOLD = 10;
    const lowPointsBalloonKeyForUser = (userId: string) =>
        `low-points-balloon-dismissed:${userId}`;

    let userPoints: number | null = null;
    let userMembershipActive = false;
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

            const user = data.data?.user;
            userPoints = user?.points ?? null;
            userMembershipActive = user?.membership?.active === true;
            lastPointsUserId = userId;
        } catch (error) {
            userPoints = null;
            userMembershipActive = false;
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
        userMembershipActive = false;
        lastPointsUserId = null;
        lowPointsBalloonDismissed = false;
        lowPointsBalloonDismissKey = null;
        lastDismissUserId = null;
    }

    $: showLowPointsBalloon =
        browser &&
        signedInState &&
        !pointsLoading &&
        !userMembershipActive &&
        userPoints !== null &&
        userPoints < LOW_POINTS_THRESHOLD &&
        !lowPointsBalloonDismissed;

    $: platformCards = platformsList.map((slug) => ({
        slug,
        name: $t(`home.platforms.${slug}.name`),
        desc: $t(`home.platforms.${slug}.desc`),
    }));
    $: heroCapabilities = [
        {
            title: $t("home.capabilities.supported.title"),
        },
        {
            title: $t("home.capabilities.collection.title"),
        },
        {
            title: $t("home.capabilities.batch.title"),
        },
        {
            title: $t("home.capabilities.audio.title"),
        },
    ];
    $: moreTools = [
        {
            href: `/${currentLocale}/videorecord`,
            label: $t("tabs.videorecord"),
        },
        {
            href: `/${currentLocale}/clipboard`,
            label: $t("tabs.feature.file_transfer"),
        },
        {
            href: `/${currentLocale}/remux`,
            label: $t("tabs.remux"),
        },
        {
            href: `/${currentLocale}/random-chat`,
            label: $t("tabs.random_video"),
        },
        {
            href: `/${currentLocale}/free-video-tools`,
            label: currentLocale === "zh" ? "FreeSaveVideo \u4ecb\u7ecd" : "FreeSaveVideo overview",
        },
    ];
    $: homeHubHeading =
        currentLocale === "zh" ? "\u70ed\u95e8\u5e73\u53f0\u89c6\u9891\u4e0b\u8f7d\u4e0e\u6307\u5357" : "Popular Video Downloader Links";
    $: homeInternalLinks = getHubDownloadLinks(
        8,
        currentLocale === "en" ? "international" : "all",
    );
    $: homeGuideLinks = getHubGuideLinks(
        4,
        currentLocale === "en" ? "international" : "all",
    );
    const homeLinkLabel = (platform: string) =>
        currentLocale === "zh" ? `${platform}\u89c6\u9891\u4e0b\u8f7d` : `${platform} video downloader`;
    const homeGuideLabel = (platform: string) =>
        currentLocale === "zh" ? `${platform}\u4e0b\u8f7d\u6307\u5357` : `How to download ${platform} videos`;
    $: faqItems = [
        {
            q:
                currentLocale === "zh"
                    ? "\u5982\u4f55\u4e0b\u8f7d\u6296\u97f3\u3001B\u7ad9\u3001NicoNico\u3001Amazon Live\u3001\u5feb\u624b\u3001\u5c0f\u7ea2\u4e66\u7b49\u5e73\u53f0\u7684\u89c6\u9891\uff1f"
                    : "How to download videos from Douyin, Bilibili, NicoNico, Amazon Live, Kuaishou or Xiaohongshu?",
            a:
                currentLocale === "zh"
                    ? "\u590d\u5236\u89c6\u9891\u94fe\u63a5\uff0c\u7c98\u8d34\u5230\u8f93\u5165\u6846\uff0c\u4fdd\u6301\u81ea\u52a8\u6a21\u5f0f\uff0c\u70b9\u51fb\u4e0b\u8f7d\u5373\u53ef\u751f\u6210\u53ef\u7528\u7684\u4e0b\u8f7d\u7ed3\u679c\u3002"
                    : "Copy the video link, paste it into the box, keep ‘Auto’ mode and click download to get a clean link.",
        },
        {
            q:
                currentLocale === "zh"
                    ? "\u53ef\u4ee5\u6279\u91cf\u89e3\u6790\u6216\u5207\u6362\u97f3\u9891\u3001\u9759\u97f3\u6a21\u5f0f\u5417\uff1f"
                    : "Can I batch process or grab audio-only files?",
            a:
                currentLocale === "zh"
                    ? "\u652f\u6301\u6279\u91cf\u89e3\u6790\u5165\u53e3\uff0c\u4e0b\u8f7d\u6a21\u5f0f\u53ef\u5728\u81ea\u52a8\u3001\u97f3\u9891\u548c\u9759\u97f3\u4e4b\u95f4\u5207\u6362\u3002\u957f\u89c6\u9891\u4f1a\u5c55\u793a\u8fdb\u5ea6\u548c\u901f\u5ea6\u3002"
                    : "Batch mode is available and you can switch between auto, audio-only or muted downloads. Long videos show progress.",
        },
        {
            q:
                currentLocale === "zh"
                    ? "\u624b\u673a\u4e5f\u80fd\u7528\u5417\uff0c\u4f1a\u4e0d\u4f1a\u6709\u6c34\u5370\uff1f"
                    : "Is it mobile-friendly and watermark-free?",
            a:
                currentLocale === "zh"
                    ? "\u5b8c\u5168\u7f51\u9875\u7248\uff0c\u624b\u673a\u3001\u5e73\u677f\u548c\u7535\u8111\u90fd\u53ef\u76f4\u63a5\u4f7f\u7528\uff1b\u65e0\u6c34\u5370\u8f93\u51fa\u4ee5\u5e73\u53f0\u53ef\u7528\u8d44\u6e90\u4e3a\u51c6\u3002"
                    : "It runs in the browser on mobile/desktop and returns watermark-free HD files.",
        },
    ];
    $: siteUrl = `https://${fallbackHost}`;
    $: canonicalUrl = `${siteUrl}/${currentLocale}`;
    $: seoName = $t("general.cobalt");
    $: seoTitle = $t("general.seo.home.title");
    $: seoDescription = $t("general.seo.home.description");
    $: seoKeywords = $t("general.seo.home.keywords");
    $: embedDescription = $t("general.embed.description");
    $: guideDescription1 = $t("general.guide.description1");
    $: guideDescription2 = $t("general.guide.description2");
    $: websiteJsonLd = siteUrl
        ? {
              "@context": "https://schema.org",
              "@type": "WebSite",
              "@id": `${siteUrl}/#website`,
              url: siteUrl,
              name: seoName,
              description: seoDescription,
              potentialAction: {
                  "@type": "ViewAction",
                  target: canonicalUrl,
              },
          }
        : null;
    $: pageJsonLd = canonicalUrl
        ? {
              "@context": "https://schema.org",
              "@type": "WebPage",
              "@id": `${canonicalUrl}#webpage`,
              url: canonicalUrl,
              name: seoTitle,
              isPartOf: {
                  "@id": `${siteUrl}/#website`,
              },
              inLanguage: currentLocale,
              description: seoDescription,
              primaryImageOfPage: {
                  "@type": "ImageObject",
                  url: `https://${fallbackHost}/og-share-v3.png`,
              },
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
              "@type": "WebApplication",
              "@id": `${canonicalUrl}#app`,
              url: canonicalUrl,
              name: seoName,
              description: seoDescription,
              applicationCategory: "MultimediaApplication",
              applicationSubCategory: "Video Downloader",
              operatingSystem: "Any",
              browserRequirements: "Requires JavaScript and a modern web browser.",
              featureList: heroCapabilities.map((item) => item.title),
              knowsAbout: [
                  "public online video download",
                  "batch video download",
                  "playlist download",
                  "collection parsing",
                  "audio extraction",
                  "MP4 to MP3",
                  "browser media tools",
              ],
              potentialAction: {
                  "@type": "UseAction",
                  target: canonicalUrl,
              },
          }
        : null;
    $: structuredData = [websiteJsonLd, pageJsonLd, faqJsonLd, appJsonLd].filter(Boolean);

    let deferredWorkArmed = false;
    let pointsFetchArmed = false;
    let homeInternalOpen = true;
    let moreToolsOpen = true;
    let homeDeferredOpen = true;
    const disclosureLabel = (open: boolean) =>
        open
            ? currentLocale === "zh"
                ? "\u6536\u8d77"
                : "Collapse"
            : currentLocale === "zh"
              ? "\u5c55\u5f00"
              : "Open";

    const runOnIdle = (callback: () => void, timeout = 2500) => {
        if (!browser) return () => {};

        if ("requestIdleCallback" in window) {
            const handle = window.requestIdleCallback(callback, { timeout });
            return () => window.cancelIdleCallback?.(handle);
        }

        const handle = globalThis.setTimeout(callback, Math.min(timeout, 1200));
        return () => globalThis.clearTimeout(handle);
    };

    // 检查本地存储中是否已关闭通知
    const armDeferredHomeTasks = () => {
        if (deferredWorkArmed) return;
        deferredWorkArmed = true;
        pointsFetchArmed = true;
    };

    onMount(() => {
        const needsImmediateClerk = Boolean($page.url.searchParams.get("feedback"));
        const feedbackRequested = Boolean($page.url.searchParams.get("feedback"));
        const isCompactHome = window.matchMedia("(max-width: 600px)").matches;
        let cancelClerkInit = () => {};
        let cancelHomeArm = () => {};
        let cancelNotificationInit = () => {};

        homeInternalOpen = !isCompactHome;
        moreToolsOpen = !isCompactHome;
        homeDeferredOpen = !isCompactHome;

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
                    keepFocus: true,
                    noScroll: true,
                });
            })();
        }

        return () => {
            cancelClerkInit();
            cancelHomeArm();
            cancelNotificationInit();
            window.removeEventListener("pointerdown", armOnInteraction);
            window.removeEventListener("keydown", armOnInteraction);
            window.removeEventListener("scroll", armOnInteraction);
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
    <meta property="og:image" content={`https://${fallbackHost}/og-share-v3.png`} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="FreeSaveVideo online video downloader preview" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={seoDescription} />
    <meta name="twitter:image" content={`https://${fallbackHost}/og-share-v3.png`} />
    <meta name="twitter:image:alt" content="FreeSaveVideo online video downloader preview" />
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
                        {$t("general.notification.youtube_restriction")}
                    </span>
                </div>
            </div>
        {/if}

        <section class="download-hero" aria-labelledby="home-download-title">
            <h1 id="home-download-title">{$t("home.hero.title")}</h1>
            <p class="hero-subtitle">{$t("home.hero.subtitle")}</p>
        </section>

        <Omnibox
            feedbackHref={buildFeedbackRedirectPath()}
            feedbackText={$t("tabs.feature.feedback")}
            onFeedbackClick={() => void openFeedback()}
            collectionGuideText={buildGuideLabel($t("home.capabilities.collection.title"))}
            batchGuideText={buildGuideLabel($t("home.capabilities.batch.title"))}
            collectionGuideBody={$t("home.capabilities.collection.desc")}
            batchGuideBody={$t("home.capabilities.batch.desc")}
            collectionGuidePlatforms={collectionGuidePlatforms.map(getGuidePlatformLabel)}
            batchGuidePlatforms={batchGuidePlatforms.map(getGuidePlatformLabel)}
        />
        <!--<UserGuide/>-->
    </main>

    <details class="seo-disclosure home-internal-disclosure" bind:open={homeInternalOpen}>
        <summary>
            <h2>{homeHubHeading}</h2>
            <span class="seo-disclosure-hint">
                {disclosureLabel(homeInternalOpen)}
            </span>
        </summary>
        <section class="home-internal-hub" aria-label={homeHubHeading}>
            <div class="home-internal-primary-links">
                <a class="home-hub-link home-hub-link--primary" href={`/${currentLocale}/download`}>
                    {currentLocale === "zh" ? "\u89c6\u9891\u4e0b\u8f7d\u76ee\u5f55" : "Video download directory"}
                </a>
                <a class="home-hub-link home-hub-link--primary" href={`/${currentLocale}/guide`}>
                    {currentLocale === "zh" ? "\u89c6\u9891\u4e0b\u8f7d\u6307\u5357" : "Video download guides"}
                </a>
                <a class="home-hub-link home-hub-link--primary" href={`/${currentLocale}/faq`}>
                    {currentLocale === "zh" ? "\u4e0b\u8f7d\u5e38\u89c1\u95ee\u9898" : "Video download FAQ"}
                </a>
            </div>
            <div class="home-internal-link-groups">
                <div class="home-internal-link-group">
                    <h3>{currentLocale === "zh" ? "\u70ed\u95e8\u5e73\u53f0\u4e0b\u8f7d" : "Popular downloaders"}</h3>
                    <div class="home-internal-links">
                        {#each homeInternalLinks as item}
                            <a class="home-hub-link" href={`/${currentLocale}/download/${item.slug}`}>
                                {homeLinkLabel(item.platform)}
                            </a>
                        {/each}
                    </div>
                </div>
                <div class="home-internal-link-group">
                    <h3>{currentLocale === "zh" ? "\u4e0b\u8f7d\u6559\u7a0b" : "Download guides"}</h3>
                    <div class="home-internal-links">
                        {#each homeGuideLinks as item}
                            <a class="home-hub-link" href={`/${currentLocale}/guide/${item.slug}`}>
                                {homeGuideLabel(item.platform)}
                            </a>
                        {/each}
                    </div>
                </div>
            </div>
        </section>
    </details>

    <details class="seo-disclosure more-tools-disclosure" bind:open={moreToolsOpen}>
        <summary>
            <h2>{$t("home.tools.title")}</h2>
            <span class="seo-disclosure-hint">
                {disclosureLabel(moreToolsOpen)}
            </span>
        </summary>
        <section class="more-tools-strip" aria-label={$t("home.tools.title")}>
            <div class="more-tools-copy">
                <p>{$t("home.tools.description")}</p>
            </div>
            <div class="more-tools-links">
                {#each moreTools as item}
                    <a class="more-tools-link" href={item.href}>{item.label}</a>
                {/each}
            </div>
        </section>
    </details>

    <NoPainStudyCard />

    <details class="seo-disclosure home-deferred-disclosure" bind:open={homeDeferredOpen}>
        <summary>
            <h2>
                {currentLocale === "zh" ? "\u652f\u6301\u5e73\u53f0\u4e0e\u4e0b\u8f7d\u8bf4\u660e" : "Supported platforms and download notes"}
            </h2>
            <span class="seo-disclosure-hint">
                {disclosureLabel(homeDeferredOpen)}
            </span>
        </summary>
        <HomeDeferredSections
            {currentLocale}
            {canonicalUrl}
            {platformCards}
            {guideDescription1}
            {guideDescription2}
        />
        <section class="home-faq" aria-labelledby="home-faq-title">
            <div class="home-faq-heading">
                <h2 id="home-faq-title">
                    {currentLocale === "zh" ? "\u4e0b\u8f7d\u5e38\u89c1\u95ee\u9898" : "Download FAQ"}
                </h2>
                <a href={`/${currentLocale}/faq`}>
                    {currentLocale === "zh" ? "\u67e5\u770b\u5168\u90e8" : "View all"}
                </a>
            </div>
            <div class="home-faq-list">
                {#each faqItems as item}
                    <details class="home-faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                {/each}
            </div>
        </section>
    </details>
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
        padding: clamp(10px, 1.5vw, 20px) var(--padding) 28px;
        /* 允许纵向滚动，移除 overflow:hidden 限制 */
        overflow-y: auto;
        overflow-x: hidden;
        justify-content: flex-start;
        min-height: 100%;
        box-sizing: border-box;
    }

    #cobalt-save {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        width: 100%;
        min-height: auto;
        gap: 12px;
        margin-bottom: 18px;
    }

    @media (min-width: 900px) {
        #cobalt-save {
            min-height: auto;
            margin-bottom: 18px;
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
        max-width: 820px;
        box-sizing: border-box;
        margin-bottom: 2px;
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

    .download-hero {
        width: 100%;
        max-width: 860px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        margin-top: 0;
    }

    .download-hero h1 {
        margin: 0;
        max-width: 860px;
        font-size: clamp(2rem, 3.4vw, 2.75rem);
        line-height: 1.08;
        letter-spacing: -0.03em;
        color: var(--text);
        text-wrap: balance;
    }

    .hero-subtitle {
        margin: 0;
        max-width: 760px;
        font-size: clamp(0.94rem, 1.35vw, 1.04rem);
        line-height: 1.5;
        color: var(--secondary-600);
        text-wrap: balance;
    }

    .seo-disclosure {
        width: 100%;
        max-width: 1120px;
        margin: 0 auto 10px;
        padding: 0 var(--padding);
        box-sizing: border-box;
    }

    .seo-disclosure > summary {
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 10px 14px;
        border: 1px solid var(--surface-2);
        border-radius: 10px;
        background: color-mix(in srgb, var(--surface-1) 94%, var(--accent) 6%);
        color: var(--text);
        cursor: pointer;
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.3;
        list-style: none;
        transition:
            border-color 0.2s,
            background-color 0.2s;
    }

    .seo-disclosure > summary::-webkit-details-marker {
        display: none;
    }

    .seo-disclosure > summary::after {
        content: "";
        width: 9px;
        height: 9px;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(45deg);
        flex: 0 0 auto;
        transition: transform 0.2s;
    }

    .seo-disclosure[open] > summary {
        background: rgba(var(--accent-rgb), 0.07);
        border-color: rgba(var(--accent-rgb), 0.22);
    }

    .seo-disclosure[open] > summary::after {
        transform: rotate(225deg);
    }

    .seo-disclosure-hint {
        margin-left: auto;
        color: var(--subtext);
        font-size: 0.82rem;
        font-weight: 500;
    }

    .home-internal-hub {
        width: 100%;
        max-width: none;
        margin: 10px auto 0;
        padding: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .seo-disclosure > summary h2 {
        margin: 0;
        color: inherit;
        font: inherit;
    }

    .home-internal-primary-links,
    .home-internal-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .home-internal-link-groups {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
        gap: 12px;
    }

    .home-internal-link-group {
        padding: 12px;
        border: 1px solid var(--surface-2);
        border-radius: 12px;
        background: color-mix(in srgb, var(--surface-1) 86%, transparent);
    }

    .home-internal-link-group h3 {
        margin: 0;
        font-size: 0.82rem;
        color: var(--subtext);
        line-height: 1.3;
        margin-bottom: 9px;
    }

    .home-hub-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        padding: 7px 11px;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
        color: var(--text);
        text-decoration: none;
        font-size: 0.88rem;
        line-height: 1.2;
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }

    .home-hub-link:hover {
        background: var(--surface-2);
        border-color: var(--accent);
    }

    .home-hub-link--primary {
        border-color: rgba(var(--accent-rgb), 0.32);
        background: rgba(var(--accent-rgb), 0.12);
        color: var(--accent-strong);
        font-weight: 600;
    }

    .more-tools-strip {
        width: 100%;
        max-width: none;
        margin: 10px auto 0;
        padding: 0;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.6fr);
        align-items: center;
        gap: 14px 24px;
    }

    .more-tools-copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .more-tools-copy p {
        margin: 0;
        color: var(--secondary-600);
        font-size: 0.92rem;
        line-height: 1.5;
    }

    .more-tools-links {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
    }

    .more-tools-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--surface-2);
        background: var(--surface-1);
        color: var(--text);
        text-decoration: none;
        font-size: 0.9rem;
        line-height: 1.2;
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }

    .more-tools-link:hover {
        background: var(--surface-1);
        border-color: var(--accent);
    }

    .home-faq {
        width: 100%;
        max-width: 1100px;
        margin: 18px auto 10px;
        padding: 0;
        box-sizing: border-box;
    }

    .home-faq-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 10px;
    }

    .home-faq-heading h2 {
        margin: 0;
        color: var(--text);
        font-size: clamp(18px, 2vw, 22px);
    }

    .home-faq-heading a {
        color: var(--accent-strong);
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
    }

    .home-faq-heading a:hover {
        text-decoration: underline;
    }

    .home-faq-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
    }

    .home-faq-item {
        border: 1px solid var(--surface-2);
        border-radius: 12px;
        background: var(--surface-1);
        overflow: hidden;
    }

    .home-faq-item summary {
        min-height: 48px;
        padding: 12px 38px 12px 13px;
        color: var(--text);
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 650;
        line-height: 1.4;
        list-style: none;
        position: relative;
    }

    .home-faq-item summary::-webkit-details-marker {
        display: none;
    }

    .home-faq-item summary::after {
        content: "+";
        position: absolute;
        top: 50%;
        right: 13px;
        transform: translateY(-50%);
        color: var(--accent-strong);
        font-size: 1.1rem;
        font-weight: 500;
    }

    .home-faq-item[open] summary::after {
        content: "\2212";
    }

    .home-faq-item p {
        margin: 0;
        padding: 0 13px 13px;
        color: var(--secondary-600);
        font-size: 0.86rem;
        line-height: 1.55;
    }

    @media (max-width: 600px) {
        #cobalt-save-container {
            justify-content: flex-start;
        }

        #cobalt-save {
            min-height: auto;
            padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
            margin-bottom: 0;
            gap: 12px;
        }

        .download-hero h1 {
            font-size: clamp(1.72rem, 7.2vw, 2.15rem);
        }

        .download-hero {
            gap: 6px;
            margin-top: 2px;
        }

        .hero-subtitle {
            font-size: 0.96rem;
            line-height: 1.55;
        }

        .seo-disclosure {
            margin-bottom: 8px;
            padding: 0 14px;
        }

        .seo-disclosure > summary {
            min-height: 42px;
            padding: 9px 12px;
            font-size: 0.92rem;
        }

        .home-internal-link-groups,
        .more-tools-strip,
        .home-faq-list {
            grid-template-columns: 1fr;
        }

        .more-tools-links {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .more-tools-copy p {
            font-size: 0.88rem;
        }

        .home-faq {
            margin-top: 14px;
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
        padding: 12px 40px 12px 14px;
        box-shadow: var(--button-box-shadow);
        text-align: left;
        cursor: pointer;
        position: relative;
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
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
