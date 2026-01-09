<script lang="ts">
    import { onMount } from "svelte";

    import { t } from "$lib/i18n/translations";
    import { currentApiURL } from "$lib/api/api-url";
    import { videos, type SocialVideo } from "$lib/api/social";
    import { savingHandler } from "$lib/api/saving-handler";
    import { createDialog } from "$lib/state/dialogs";

    type PlatformFilter = "all" | "tiktok" | "instagram";
    type DiscoverSectionKey = "trending" | "pinned" | "featured" | "latest";

    const SUPPORTED_PLATFORMS = new Set(["tiktok", "instagram"]);
    const LATEST_PAGE_SIZE = 24;

    let selectedPlatform: PlatformFilter = "all";

    let trendingVideos: SocialVideo[] = [];
    let pinnedVideos: SocialVideo[] = [];
    let featuredVideos: SocialVideo[] = [];
    let latestVideos: SocialVideo[] = [];

    let loading = true;
    let loadingMore = false;
    let error = "";

    let latestPage = 1;
    let latestHasMore = false;

    let runningDownloadId: number | null = null;

    $: platformParam = selectedPlatform === "all" ? undefined : selectedPlatform;

    $: platforms = [
        { value: "all", label: $t("discover.filter.all") },
        { value: "tiktok", label: "TikTok" },
        { value: "instagram", label: "Instagram" },
    ] as const;

    const normalize = (list: SocialVideo[]) =>
        list.filter((video) => SUPPORTED_PLATFORMS.has(video.platform));

    const pageHasMore = (pagination: any) =>
        Boolean(pagination && typeof pagination.page === "number" && pagination.page < pagination.pages);

    const setListOrThrow = (
        response: Awaited<ReturnType<typeof videos.list>>,
        setter: (items: SocialVideo[]) => void
    ) => {
        if (response.status !== "success" || !response.data) {
            throw new Error(response.error?.message || $t("discover.status.error"));
        }

        setter(normalize(response.data.videos || []));

        return response.data.pagination;
    };

    const openBatchDialog = (
        items: { url: string; title?: string; duration?: number }[],
        title?: string
    ) => {
        createDialog({
            id: `discover-batch-${Date.now()}`,
            type: "batch",
            title,
            items: items.map((item) => ({
                url: item.url,
                title: item.title,
                duration: item.duration,
            })),
        });
    };

    const getCreatorName = (video: SocialVideo) =>
        video.account?.display_name || video.account?.username || "";

    const getCreatorHandle = (video: SocialVideo) =>
        video.account?.username ? `@${video.account.username}` : "";

    const getPlatformLabel = (platform: string) => {
        if (platform === "tiktok") return "TikTok";
        if (platform === "instagram") return "Instagram";
        return platform;
    };

    const getTitle = (video: SocialVideo) => video.title || video.video_url;

    const getThumbnailSrc = (video: SocialVideo) => {
        if (!video.thumbnail_url) return "";
        if (video.platform === "instagram") {
            return `${currentApiURL()}/social/media/proxy?url=${encodeURIComponent(
                video.thumbnail_url
            )}`;
        }
        return video.thumbnail_url;
    };

    onMount(() => {
        void loadAll();
    });

    async function loadAll() {
        loading = true;
        loadingMore = false;
        error = "";
        latestPage = 1;
        latestHasMore = false;

        try {
            const [trendingRes, pinnedRes, featuredRes, latestRes] = await Promise.all([
                videos.trending({
                    platform: platformParam,
                    days: 7,
                    limit: 12,
                }),
                videos.list({
                    platform: platformParam,
                    is_active: true,
                    is_pinned: true,
                    limit: 12,
                    sort: "pinned_order",
                    order: "DESC",
                }),
                videos.list({
                    platform: platformParam,
                    is_active: true,
                    is_featured: true,
                    limit: 12,
                    sort: "display_order",
                    order: "DESC",
                }),
                videos.list({
                    platform: platformParam,
                    is_active: true,
                    page: 1,
                    limit: LATEST_PAGE_SIZE,
                    sort: "created_at",
                    order: "DESC",
                }),
            ]);

            if (trendingRes.status === "success" && trendingRes.data) {
                trendingVideos = normalize(trendingRes.data.videos || []);
            } else {
                trendingVideos = [];
            }

            try {
                setListOrThrow(pinnedRes, (items) => (pinnedVideos = items));
            } catch {
                pinnedVideos = [];
                error = $t("discover.status.error");
            }

            try {
                setListOrThrow(featuredRes, (items) => (featuredVideos = items));
            } catch {
                featuredVideos = [];
                error = $t("discover.status.error");
            }

            try {
                const pagination = setListOrThrow(latestRes, (items) => (latestVideos = items));
                latestHasMore = pageHasMore(pagination);
            } catch {
                latestVideos = [];
                latestHasMore = false;
                error = $t("discover.status.error");
            }
        } catch (e) {
            trendingVideos = [];
            pinnedVideos = [];
            featuredVideos = [];
            latestVideos = [];
            latestHasMore = false;
            error = e instanceof Error ? e.message : $t("discover.status.error");
        } finally {
            loading = false;
        }
    }

    async function loadMore() {
        if (loadingMore || !latestHasMore) return;

        loadingMore = true;
        error = "";

        try {
            const nextPage = latestPage + 1;

            const res = await videos.list({
                platform: platformParam,
                is_active: true,
                page: nextPage,
                limit: LATEST_PAGE_SIZE,
                sort: "created_at",
                order: "DESC",
            });

            if (res.status !== "success" || !res.data) {
                throw new Error(res.error?.message || $t("discover.status.error"));
            }

            latestVideos = [...latestVideos, ...normalize(res.data.videos || [])];
            latestPage = res.data.pagination.page;
            latestHasMore = pageHasMore(res.data.pagination);
        } catch (e) {
            error = e instanceof Error ? e.message : $t("discover.status.error");
        } finally {
            loadingMore = false;
        }
    }

    async function handleDownload(video: SocialVideo) {
        if (!video?.video_url) return;

        void videos.trackEvent(video.id, "download_click").catch(() => {});

        runningDownloadId = video.id;
        try {
            await savingHandler({ url: video.video_url });
        } finally {
            runningDownloadId = null;
        }
    }

    async function handleCreatorBatch(video: SocialVideo) {
        const accountId = video.account_id;
        const creatorName = getCreatorName(video) || getCreatorHandle(video) || String(accountId);

        void videos.trackEvent(video.id, "creator_batch_open").catch(() => {});

        try {
            const [pinnedRes, recentRes] = await Promise.all([
                videos.list({
                    account_id: accountId,
                    is_active: true,
                    is_pinned: true,
                    limit: 10,
                    sort: "pinned_order",
                    order: "DESC",
                }),
                videos.list({
                    account_id: accountId,
                    is_active: true,
                    limit: 10,
                    sort: "created_at",
                    order: "DESC",
                }),
            ]);

            if (pinnedRes.status !== "success" || !pinnedRes.data) {
                throw new Error(pinnedRes.error?.message || $t("discover.status.error"));
            }
            if (recentRes.status !== "success" || !recentRes.data) {
                throw new Error(recentRes.error?.message || $t("discover.status.error"));
            }

            const merged = normalize([
                ...(pinnedRes.data.videos || []),
                ...(recentRes.data.videos || []),
            ]);

            const seen = new Set<string>();
            const items = merged
                .filter((v) => {
                    if (!v.video_url) return false;
                    if (seen.has(v.video_url)) return false;
                    seen.add(v.video_url);
                    return true;
                })
                .map((v) => ({
                    url: v.video_url,
                    title: v.title || undefined,
                    duration: typeof v.duration === "number" ? v.duration : undefined,
                }))
                .slice(0, 20);

            if (!items.length) {
                throw new Error($t("discover.status.empty.description"));
            }

            openBatchDialog(
                items,
                $t("discover.action.creator_batch_title", { name: creatorName } as any)
            );
        } catch (e) {
            createDialog({
                id: "discover-creator-batch-error",
                type: "small",
                meowbalt: "error",
                bodyText: e instanceof Error ? e.message : $t("discover.status.error"),
                buttons: [
                    {
                        text: $t("button.gotit"),
                        main: true,
                        action: () => {},
                    },
                ],
            });
        }
    }

    $: sections = [
        {
            key: "trending" as const,
            title: $t("discover.section.trending"),
            videos: trendingVideos,
        },
        {
            key: "pinned" as const,
            title: $t("discover.section.pinned"),
            videos: pinnedVideos,
        },
        {
            key: "featured" as const,
            title: $t("discover.section.featured"),
            videos: featuredVideos,
        },
        {
            key: "latest" as const,
            title: $t("discover.section.latest"),
            videos: latestVideos,
        },
    ] satisfies { key: DiscoverSectionKey; title: string; videos: SocialVideo[] }[];
</script>

<svelte:head>
    <title>{$t("general.seo.discover.title")}</title>
    <meta name="description" content={$t("general.seo.discover.description")} />
    <meta name="keywords" content={$t("general.seo.discover.keywords")} />
    <meta property="og:title" content={$t("general.seo.discover.title")} />
    <meta property="og:description" content={$t("general.seo.discover.description")} />
</svelte:head>

<div class="discover-container">
    <header class="header">
        <div class="header-content">
            <h1 class="title">{$t("discover.title")}</h1>
            <p class="subtitle">{$t("discover.subtitle")}</p>
        </div>
    </header>

    <div class="filter-bar">
        <div class="select-wrapper">
            <select bind:value={selectedPlatform} on:change={loadAll} class="platform-select">
                {#each platforms as platform}
                    <option value={platform.value}>{platform.label}</option>
                {/each}
            </select>
            <div class="select-arrow">▼</div>
        </div>
    </div>

    {#if error}
        <div class="error-banner">{error}</div>
    {/if}

    {#if loading}
        <div class="loading-container">
            <div class="spinner"></div>
            <p>{$t("discover.status.loading")}</p>
        </div>
    {:else if trendingVideos.length === 0 && pinnedVideos.length === 0 && featuredVideos.length === 0 && latestVideos.length === 0}
        <div class="empty-state">
            <h3>{$t("discover.status.empty.title")}</h3>
            <p>{$t("discover.status.empty.description")}</p>
        </div>
    {:else}
        {#each sections as section (section.key)}
            {#if section.videos.length > 0}
                <section class="section">
                    <div class="section-header">
                        <h2 class="section-title">{section.title}</h2>
                    </div>

                    <div class="video-grid">
                        {#each section.videos as video (video.id)}
                            <article class="video-card">
                                <button class="thumb" type="button" on:click={() => handleDownload(video)}>
                                    {#if video.thumbnail_url}
                                        <img class="thumb-img" src={getThumbnailSrc(video)} alt={getTitle(video)} loading="lazy" />
                                    {:else}
                                        <div class="thumb-placeholder"></div>
                                    {/if}
                                </button>

                                <div class="card-body">
                                    <div class="card-title" title={getTitle(video)}>
                                        {getTitle(video)}
                                    </div>

                                    <div class="card-meta">
                                        <span class={`badge badge-${video.platform}`}>{getPlatformLabel(video.platform)}</span>

                                        {#if getCreatorName(video)}
                                            <span class="creator">{getCreatorName(video)}</span>
                                        {/if}

                                        {#if getCreatorHandle(video)}
                                            <span class="creator-handle">{getCreatorHandle(video)}</span>
                                        {/if}
                                    </div>

                                    <div class="card-actions">
                                        <button
                                            class="btn-primary"
                                            type="button"
                                            disabled={runningDownloadId === video.id}
                                            on:click={() => handleDownload(video)}
                                        >
                                            {$t("button.download")}
                                        </button>
                                        <button
                                            class="btn-secondary"
                                            type="button"
                                            on:click={() => handleCreatorBatch(video)}
                                        >
                                            {$t("discover.action.creator_batch")}
                                        </button>
                                    </div>
                                </div>
                            </article>
                        {/each}
                    </div>

                    {#if section.key === "latest" && latestHasMore}
                        <div class="load-more">
                            <button
                                class="btn-secondary"
                                type="button"
                                disabled={loadingMore}
                                on:click={loadMore}
                            >
                                {loadingMore
                                    ? $t("discover.status.loading")
                                    : $t("discover.action.load_more")}
                            </button>
                        </div>
                    {/if}
                </section>
            {/if}
        {/each}
    {/if}
</div>

<style>
    .discover-container {
        padding: calc(var(--padding) * 3) calc(var(--padding) * 2);
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .header {
        text-align: center;
        margin-bottom: calc(var(--padding) * 2);
        width: 100%;
        max-width: 1100px;
    }

    .title {
        font-size: 2rem;
        font-weight: 700;
        color: var(--button-text);
        margin: 0 0 0.5rem 0;
        line-height: 1.3;
    }

    .subtitle {
        font-size: 0.95rem;
        color: var(--gray);
        margin: 0;
        line-height: 1.5;
    }

    .filter-bar {
        width: 100%;
        max-width: 1100px;
        margin-bottom: calc(var(--padding) * 2);
        display: flex;
        justify-content: flex-end;
    }

    .select-wrapper {
        position: relative;
        min-width: 200px;
    }

    .platform-select {
        appearance: none;
        width: 100%;
        padding: 12px 40px 12px 16px;
        border: none;
        border-radius: var(--border-radius);
        font-size: 0.95rem;
        background: var(--button);
        color: var(--button-text);
        box-shadow: var(--button-box-shadow);
        cursor: pointer;
        transition: all 0.2s;
    }

    .platform-select:hover {
        background: var(--button-hover);
    }

    .platform-select:focus {
        outline: none;
        box-shadow: 0 0 0 2px var(--blue) inset;
    }

    .select-arrow {
        position: absolute;
        right: 14px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--gray);
        font-size: 0.8rem;
    }

    .error-banner {
        width: 100%;
        max-width: 1100px;
        padding: 12px 16px;
        border-radius: var(--border-radius);
        background: rgba(255, 0, 0, 0.12);
        color: var(--button-text);
        box-shadow: 0 0 0 1px rgba(255, 0, 0, 0.2) inset;
        margin-bottom: calc(var(--padding) * 2);
    }

    .loading-container,
    .empty-state {
        width: 100%;
        max-width: 1100px;
        padding: calc(var(--padding) * 3);
        text-align: center;
        border-radius: calc(var(--border-radius) * 1.5);
        background: var(--popup-bg);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--button);
        border-top: 4px solid var(--blue);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto calc(var(--padding) * 1.5);
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .section {
        width: 100%;
        max-width: 1100px;
        margin-bottom: calc(var(--padding) * 3);
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: calc(var(--padding) * 1.25);
    }

    .section-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--button-text);
        letter-spacing: -0.2px;
    }

    .video-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: calc(var(--padding) * 1.25);
    }

    @media (max-width: 1100px) {
        .video-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
    }

    @media (max-width: 860px) {
        .video-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 520px) {
        .discover-container {
            padding: calc(var(--padding) * 2) var(--padding);
        }

        .filter-bar {
            justify-content: stretch;
        }

        .select-wrapper {
            width: 100%;
        }

        .video-grid {
            grid-template-columns: 1fr;
        }
    }

    .video-card {
        background: var(--popup-bg);
        border-radius: calc(var(--border-radius) * 1.5);
        overflow: hidden;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        display: flex;
        flex-direction: column;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .video-card:hover {
        transform: translateY(-2px);
        box-shadow:
            0 0 0 1.5px var(--popup-stroke) inset,
            0 10px 30px rgba(0, 0, 0, 0.12);
    }

    .thumb {
        all: unset;
        display: block;
        cursor: pointer;
        width: 100%;
        aspect-ratio: 9 / 16;
        background: rgba(0, 0, 0, 0.06);
        position: relative;
    }

    .thumb-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .thumb-placeholder {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
    }

    .card-body {
        padding: calc(var(--padding) * 1.25);
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) * 0.8);
    }

    .card-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--button-text);
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: calc(0.95rem * 1.35 * 2);
    }

    .card-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        color: var(--gray);
        font-size: 0.85rem;
    }

    .badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.2px;
        background: rgba(0, 0, 0, 0.06);
        color: var(--button-text);
        text-transform: uppercase;
    }

    .badge-tiktok {
        background: rgba(0, 0, 0, 0.08);
    }

    .badge-instagram {
        background: rgba(255, 0, 128, 0.12);
    }

    .creator {
        font-weight: 600;
        color: var(--button-text);
        opacity: 0.9;
    }

    .creator-handle {
        font-family: "IBM Plex Mono", monospace;
        opacity: 0.75;
    }

    .card-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }

    .btn-primary,
    .btn-secondary {
        border: none;
        border-radius: var(--border-radius);
        padding: 10px 12px;
        font-size: 0.9rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
        box-shadow: var(--button-box-shadow);
        background: var(--button);
        color: var(--button-text);
    }

    .btn-primary {
        background: var(--blue);
        color: var(--white);
    }

    .btn-primary:hover:not(:disabled) {
        filter: brightness(1.04);
    }

    .btn-secondary:hover:not(:disabled) {
        background: var(--button-hover);
    }

    .btn-primary:disabled,
    .btn-secondary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .load-more {
        display: flex;
        justify-content: center;
        margin-top: calc(var(--padding) * 1.5);
    }
</style>
