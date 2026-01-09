<script lang="ts">
    import { t, INTERNAL_locale, defaultLocale } from "$lib/i18n/translations";
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";

    import Omnibox from "$components/save/Omnibox.svelte";
    import Meowbalt from "$components/misc/Meowbalt.svelte";
    import SupportedServices from "$components/save/SupportedServices.svelte";
    import UserGuide from "$components/misc/UseGuide.svelte";

    import IconAlertTriangle from "@tabler/icons-svelte/IconAlertTriangle.svelte";
    import IconClipboard from "$components/icons/Clipboard.svelte";
    import IconVideo from "@tabler/icons-svelte/IconVideo.svelte";
    import IconStack2 from "@tabler/icons-svelte/IconStack2.svelte";
    import IconListCheck from "@tabler/icons-svelte/IconListCheck.svelte";
    import env from "$lib/env";
    import languages from "$i18n/languages.json";
    import { createDialog } from "$lib/state/dialogs";
    import {
        checkSignedIn,
        clerkEnabled,
        clerkUser,
        getClerkToken,
        initClerk,
        isSignedIn,
    } from "$lib/state/clerk";
    import { link as omniboxLink } from "$lib/state/omnibox";
    import { currentApiURL } from "$lib/api/api-url";
    import IconCoin from "@tabler/icons-svelte/IconCoin.svelte";
    import IconX from "@tabler/icons-svelte/IconX.svelte";

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

    let showMindsou = false;
    let showYumcheck = false;
    let showNotification = false; // ?????????????????
    const fallbackHost = env.HOST || "freesavevideo.online";
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
        if (!$isSignedIn) {
            const alreadySignedIn = await checkSignedIn();
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
        const userId = $clerkUser?.id;
        if (!userId) return;
        if (lastPointsUserId === userId) return;

        pointsLoading = true;
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

    $: if (browser && $clerkUser?.id) {
        const userId = $clerkUser.id;
        if (lastDismissUserId !== userId) {
            lastDismissUserId = userId;
            const key = lowPointsBalloonKeyForUser(userId);
            lowPointsBalloonDismissKey = key;
            lowPointsBalloonDismissed = localStorage.getItem(key) === "1";
        }
    }

    $: if ($clerkUser) {
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
        $isSignedIn &&
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

    // 检查本地存储中是否已关闭通知
    onMount(() => {
        if (clerkEnabled) {
            initClerk();
        }

        const notificationClosed = localStorage.getItem(
            "notification-finditbuddy-launch-closed",
        );
        if (notificationClosed === "true") {
            showNotification = false;
        }

        if ($page.url.searchParams.get("feedback")) {
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
    <meta name="robots" content="index,follow" />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={seoDescription} />
    <meta property="og:type" content="website" />
    {#if canonicalUrl}
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:url" content={canonicalUrl} />
    {/if}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={seoDescription} />
    <meta name="twitter:image" content="https://{fallbackHost}/og.png" />
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
        <a href={`/${currentLocale}/discover`} class="feature-card">
            <div class="icon-wrapper"><IconVideo size={28} /></div>
            <div class="card-content">
                <h3>{$t("tabs.feature.discover_trends")}</h3>
                <p class="card-desc">
                    {$t("general.seo.discover.description")}
                </p>
            </div>
        </a>
    </section>

    <section class="platform-section seo-section" id="platforms">
        <div class="platform-heading">
            <h2>{$t("home.platforms.title")}</h2>
            <p>
                {$t("home.platforms.description")}
            </p>
        </div>
        <div class="platform-grid">
            {#each platformCards as card}
                <a
                    class="platform-card"
                    id={"platform-" + card.slug}
                    href={card.slug === "youtube"
                        ? `/${currentLocale}/youtube-video-downloader`
                        : canonicalUrl
                          ? `${canonicalUrl}#platform-${card.slug}`
                          : `/${currentLocale}#platform-${card.slug}`}
                >
                    <div class="platform-name">{card.name}</div>
                    <p>{card.desc}</p>
                </a>
            {/each}
        </div>
    </section>

    <section class="seo-hero seo-section">
        <h1>{seoTitle}</h1>
        <p>{seoDescription}</p>
    </section>

    <section class="seo-body seo-section">
        <div class="seo-text">
            <h2>{$t("general.guide.title")}</h2>
            <p>{guideDescription1}</p>
            <p>{guideDescription2}</p>
        </div>

        <div class="seo-grid">
            <article class="seo-card">
                <h3>{$t("tabs.feature.media_downloader")}</h3>
                <p>{seoDescription}</p>
            </article>
            <article class="seo-card">
                <h3>{$t("tabs.feature.file_transfer")}</h3>
                <p>{$t("general.seo.transfer.description")}</p>
            </article>
            <article class="seo-card">
                <h3>{$t("tabs.feature.discover_trends")}</h3>
                <p>{$t("general.seo.discover.description")}</p>
            </article>
            <article class="seo-card">
                <h3>{embedDescription}</h3>
                <p>{seoKeywords}</p>
            </article>
        </div>
    </section>

    <!-- 引流推广模块 -->
    <section id="promotions">
        <!-- Mindsou Accordion -->
        <section id="mindsou">
            <button
                type="button"
                class="accordion-header"
                aria-expanded={showMindsou}
                on:click={() => (showMindsou = !showMindsou)}
            >
                <img
                    src="/popularize/mindsou_logo.png"
                    alt="Mindsou Logo"
                    class="section-icon"
                />
                <span>{$t("general.promotions.mindsou.title")}</span>
                <span class="arrow">{showMindsou ? "▲" : "▼"}</span>
            </button>
            {#if showMindsou}
                <div class="details" role="region">
                    <ul>
                        <li>{$t("general.promotions.mindsou.features.1")}</li>
                        <li>{$t("general.promotions.mindsou.features.2")}</li>
                        <li>{$t("general.promotions.mindsou.features.3")}</li>
                        <li>{$t("general.promotions.mindsou.features.4")}</li>
                        <li>{$t("general.promotions.mindsou.features.5")}</li>
                    </ul>
                    <a
                        class="button"
                        href="https://mindsou.online"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {$t("general.promotions.mindsou.visit")}
                    </a>
                </div>
            {/if}
        </section>

        <!-- YumCheck Accordion -->
        <section id="yumcheck">
            <button
                type="button"
                class="accordion-header"
                aria-expanded={showYumcheck}
                on:click={() => (showYumcheck = !showYumcheck)}
            >
                <img
                    src="/popularize/yumcheck.ico"
                    alt="YumCheck Logo"
                    class="section-icon"
                />
                <span>{$t("general.promotions.yumcheck.title")}</span>
                <span class="arrow">{showYumcheck ? "▲" : "▼"}</span>
            </button>
            {#if showYumcheck}
                <div class="details" role="region">
                    <ul>
                        <li>{$t("general.promotions.yumcheck.features.1")}</li>
                        <li>{$t("general.promotions.yumcheck.features.2")}</li>
                        <li>{$t("general.promotions.yumcheck.features.3")}</li>
                        <li>{$t("general.promotions.yumcheck.features.4")}</li>
                    </ul>
                    <a
                        class="button"
                        href="https://yumcheck.online"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {$t("general.promotions.yumcheck.visit")}
                    </a>
                </div>
            {/if}
        </section>
    </section>

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
         /* flex: 1; removed to allow min-height to work better with specific spacing */
         min-height: 65vh; /* Occupy significant screen space */
         gap: 24px; /* Increased gap between logo and input */
         margin-bottom: 60px; /* Push content below further down */
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
                560px circle at 20% 5%,
                rgba(var(--accent-rgb), 0.16),
                transparent 62%
            ),
            radial-gradient(
                520px circle at 80% 70%,
                rgba(47, 138, 249, 0.1),
                transparent 62%
            );
        filter: blur(18px);
        opacity: 0.35;
        pointer-events: none;
    }

    :global(#cobalt[data-reduce-transparency="true"]) .capabilities::before {
        filter: none;
        opacity: 0.18;
    }

    .cap-card {
        position: relative;
        z-index: 1;
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.1);
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
            transform: translateY(-2px);
            box-shadow: 0 22px 50px rgba(0, 0, 0, 0.12);
        }
    }

    :global(#cobalt[data-reduce-motion="true"]) .cap-card {
        transition: none;
    }

    :global(#cobalt[data-reduce-motion="true"]) .cap-card:hover {
        transform: none;
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.1);
    }

    .cap-card-inner {
        height: 100%;
        border-radius: 18px;
        padding: 16px 16px 14px;
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
        background-image:
            linear-gradient(rgba(0, 0, 0, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.06) 1px, transparent 1px);
        background-size: 28px 28px;
        opacity: 0.55;
        mask-image: radial-gradient(circle at 30% 18%, #000 0%, transparent 72%);
        pointer-events: none;
    }

    :global([data-theme="dark"]) .cap-card-inner::before {
        background-image:
            linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
        opacity: 0.4;
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
        opacity: 0.85;
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
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
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

    @media (prefers-reduced-motion: no-preference) {
        :global(#cobalt[data-reduce-motion="false"]) .cap-card::before {
            background-size: 240% 240%;
            animation: capGlow 10s ease infinite;
        }
    }

    @keyframes capGlow {
        0% {
            background-position: 0% 50%;
        }
        50% {
            background-position: 100% 50%;
        }
        100% {
            background-position: 0% 50%;
        }
    }

    @media (max-width: 720px) {
        .capabilities {
            grid-template-columns: 1fr;
            max-width: 560px;
        }
    }

    ul {
        list-style: disc;
        padding-left: var(--padding);
    }

    a {
        text-decoration: none;
        color: var(--blue);
    }

    .button {
        display: inline-block;
        padding: 10px 20px;
        background-color: var(--secondary);
        color: var(--primary);
        border-radius: var(--border-radius);
        text-align: center;
    }

    /* 推广模块样式 */
    #promotions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--padding);
        padding: var(--padding) 0;
    }
    #promotions > section {
        display: flex;
        flex-direction: column;
        padding: var(--padding);
        background-color: var(--popup-bg);
        border-radius: var(--border-radius);
        width: 100%;
        max-width: 640px;
        box-sizing: border-box;
        gap: 12px;
        transition: all 0.3s ease;
    }

    .accordion-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        padding: var(--padding);
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        transition: background 0.2s;
        gap: 8px;
    }
    .accordion-header:hover {
        background: var(--secondary-bg);
    }
    .arrow {
        font-size: 0.9rem;
    }
    .details {
        padding: calc(var(--padding) / 2) var(--padding);
        background: var(--popup-bg);
        border-bottom-left-radius: var(--border-radius);
        border-bottom-right-radius: var(--border-radius);
        margin-bottom: var(--padding);
        animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-5px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* Mindsou 与 YumCheck 模块样式覆盖（默认暗色） */
    #promotions > section#mindsou,
    #promotions > section#yumcheck {
        background-color: var(--popup-bg);
        color: var(--primary);
    }

    /* Center‑align YumCheck 标题与箭头 */
    #promotions > section#yumcheck .accordion-header {
        justify-content: center;
        text-align: center; /* 万一有多行文字也会居中 */
    }

    /* Light 模式：使用深绿背景 + 白字 */
    @media (prefers-color-scheme: light) {
        #promotions > section#mindsou,
        #promotions > section#yumcheck {
            background-color: var(--secondary);
            color: #ffffff;
        }
        #promotions .accordion-header,
        #promotions .details {
            background: transparent;
            color: inherit;
        }
        #promotions .accordion-header:hover {
            background-color: #ffb02e;
        }
        #promotions a.button {
            background-color: #ffffff;
            color: var(--secondary);
        }
    }

    /* Dark 模式：文字白色 */
    @media (prefers-color-scheme: dark) {
        #promotions > section#mindsou,
        #promotions > section#yumcheck {
            color: #ffffff;
        }
        #promotions a.button {
            color: #ffffff;
        }
    }

    @media screen and (max-width: 535px) {
        #cobalt-save-container {
            padding-top: calc(var(--padding) / 2);
        }
    }

    /* 图标尺寸 & 间距 */
    .section-icon {
        width: 24px;
        height: 24px;
        margin: 0; /* 左右间距由 gap 控制 */
    }

    /* 确保小屏时不溢出 */
    #promotions > section .section-icon {
        max-width: 100%;
    } /* 通知组件样式 */
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

    .seo-section {
        width: 100%;
        max-width: 1100px;
        margin: 28px auto;
        padding: 0 var(--padding);
        box-sizing: border-box;
    }

    .seo-hero {
        padding: 22px 20px;
        border-radius: 16px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
    }

    .seo-hero h1 {
        margin: 0 0 10px;
        font-size: clamp(22px, 3vw, 30px);
        line-height: 1.25;
        color: var(--secondary);
    }

    .seo-hero p {
        margin: 0;
        font-size: 15px;
        color: var(--secondary-600);
        line-height: 1.55;
        max-width: 900px;
    }

    .seo-body {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }

    .seo-text h2 {
        margin: 0;
        font-size: clamp(19px, 2.4vw, 24px);
        color: var(--secondary);
    }

    .seo-text p {
        margin: 6px 0 0;
        color: var(--secondary-600);
        line-height: 1.65;
        max-width: 960px;
    }

    .seo-grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        width: 100%;
    }

    .seo-card {
        padding: 16px;
        border-radius: 14px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.04);
    }

    .seo-card h3 {
        margin: 0;
        font-size: 15px;
        color: var(--secondary);
    }

    .seo-card p {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.5;
        font-size: 14px;
    }

    .platform-section {
        width: 100%;
        max-width: 1100px;
        margin: 0 auto 12px;
        padding: 0 var(--padding);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    .platform-heading h2 {
        margin: 0;
        font-size: clamp(19px, 2.4vw, 24px);
        color: var(--secondary);
    }
    .platform-heading p {
        margin: 6px 0 0;
        color: var(--secondary-600);
        line-height: 1.55;
    }
    .platform-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .platform-card {
        display: block;
        padding: 14px;
        border-radius: 12px;
        background: var(--surface-1);
        border: 1px solid var(--surface-2);
        text-decoration: none;
        color: var(--text);
        transition:
            transform 0.2s,
            box-shadow 0.2s,
            border-color 0.2s;
    }
    .platform-card:hover {
        transform: translateY(-2px);
        border-color: var(--accent);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
    }
    .platform-name {
        font-weight: 600;
        margin-bottom: 6px;
        color: var(--secondary);
    }
    .platform-card p {
        margin: 0;
        color: var(--secondary-600);
        line-height: 1.45;
        font-size: 14px;
    }

    /* Feature Cards */
    .feature-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
        width: 100%;
        max-width: 1000px;
        margin: 0 auto 3rem; /* Adjusted margin */
        padding: 0 var(--padding);
        opacity: 0.95; /* Slight deemphasis */
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
            transform 0.2s,
            background 0.2s;
        border: 1px solid transparent;
    }

    .feature-card:hover {
        transform: translateY(-2px);
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

    @media (max-width: 600px) {
        .feature-cards {
            grid-template-columns: 1fr;
        }

        .seo-section {
            padding: 0 14px;
            margin: 20px auto;
        }

        .seo-hero {
            padding: 18px;
        }

        .seo-hero h1 {
            font-size: clamp(20px, 6vw, 26px);
        }

        .seo-grid {
            grid-template-columns: 1fr;
        }

        .seo-text p {
            font-size: 14px;
        }
        .platform-grid {
            grid-template-columns: 1fr;
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
        animation: low-points-balloon-float 3.5s ease-in-out infinite;
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
        animation: low-points-balloon-pulse 1.8s ease-in-out infinite;
    }

    .low-points-balloon-icon::after {
        content: "";
        position: absolute;
        inset: -6px;
        border-radius: 18px;
        border: 2px solid currentColor;
        opacity: 0;
        transform: scale(0.75);
        animation: low-points-balloon-ring 2.2s ease-out infinite;
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

    @keyframes low-points-balloon-float {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(5px);
        }
    }

    @keyframes low-points-balloon-pulse {
        0%,
        100% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.08);
        }
    }

    @keyframes low-points-balloon-ring {
        0% {
            opacity: 0;
            transform: scale(0.75);
        }
        20% {
            opacity: 1;
        }
        60% {
            opacity: 0;
            transform: scale(1.1);
        }
        100% {
            opacity: 0;
            transform: scale(1.1);
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
