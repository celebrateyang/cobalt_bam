<script lang="ts">
    import { page } from "$app/stores";

    import { t } from "$lib/i18n/translations";
    import { currentApiURL } from "$lib/api/api-url";
    import {
        videos,
        resources,
        type SocialVideo,
        type ResourceCategoryNode,
        type ResourceLink
    } from "$lib/api/social";
    import { buildSaveRequest, savingHandler } from "$lib/api/saving-handler";
    import API from "$lib/api/api";
    import { createDialog } from "$lib/state/dialogs";
    import cachedInfo from "$lib/state/server-info";
    import type { DialogBatchItem } from "$lib/types/dialog";

    type PlatformFilter = "all" | "tiktok" | "instagram";
    type DiscoverTab = "resources" | "beauty";
    type ResourceDownloadMode = "audio" | "video";

    type ResourceListItem = {
        node: ResourceCategoryNode;
        depth: number;
        hasChildren: boolean;
        isExpanded: boolean;
    };

    const SUPPORTED_PLATFORMS = new Set(["tiktok", "instagram"]);
    const LATEST_PAGE_SIZE = 24;
    const DEFAULT_BATCH_MAX_ITEMS = 20;

    const resolveBatchMaxItems = (value: unknown) => {
        if (typeof value === "number" && Number.isFinite(value)) {
            const normalized = Math.floor(value);
            if (normalized === 0) return Number.POSITIVE_INFINITY;
            if (normalized > 0) return normalized;
        }

        return DEFAULT_BATCH_MAX_ITEMS;
    };

    let activeTab: DiscoverTab = "beauty";
    let selectedPlatform: PlatformFilter = "all";

    let featuredVideos: SocialVideo[] = [];
    let latestVideos: SocialVideo[] = [];

    let loading = false;
    let loadingMore = false;
    let error = "";

    let latestPage = 1;
    let latestHasMore = false;

    let streamVideos: SocialVideo[] = [];
    let streamIndex = 0;
    let currentStreamVideo: SocialVideo | null = null;
    let streamPlayingUrl = "";
    let streamResolving = false;
    let streamError = "";
    let streamMuted = true;
    let streamTouchStartY: number | null = null;
    let streamResolveToken = 0;

    let runningDownloadId: number | null = null;
    let showSlowHint = false;
    let slowHintTimer: ReturnType<typeof setTimeout> | null = null;

    let resourceTree: ResourceCategoryNode[] = [];
    let resourceLoading = true;
    let resourceError = "";
    let resourceExpanded = new Set<number>();
    let resourceSelectedId: number | null = null;
    let resourceDownloadingId: number | null = null;
    let resourceDownloadingMode: ResourceDownloadMode | null = null;
    let resourceLoadedLocale = "";
    let resourceList: ResourceListItem[] = [];
    let selectedResource: ResourceCategoryNode | null = null;
    let selectedLinks: ResourceLink[] = [];
    let resourcePath: ResourceCategoryNode[] = [];
    let resourcePathLabel = "";

    let beautyLoaded = false;

    let batchMaxItems: number = DEFAULT_BATCH_MAX_ITEMS;
    let batchLimitEnabled = true;

    $: platformParam = selectedPlatform === "all" ? undefined : selectedPlatform;
    $: locale = $page.params.lang;
    $: batchMaxItems = resolveBatchMaxItems($cachedInfo?.info?.cobalt?.batchMaxItems);
    $: batchLimitEnabled = Number.isFinite(batchMaxItems) && batchMaxItems > 0;

    $: platforms = [
        { value: "all", label: $t("discover.filter.all") },
        { value: "tiktok", label: "TikTok" },
        { value: "instagram", label: "Instagram" },
    ] as const;

    const normalize = (list: SocialVideo[]) =>
        list.filter((video) => SUPPORTED_PLATFORMS.has(video.platform) && !video.is_pinned);

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

    const toMsTimestamp = (value: number | string | null | undefined): number | null => {
        if (value === null || value === undefined) return null;
        const raw = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
        if (!Number.isFinite(raw) || raw <= 0) return null;
        return raw < 1e12 ? raw * 1000 : raw;
    };

    const isPlayableFresh = (video: SocialVideo) => {
        if (!video?.play_url) return false;
        const expiresAt = toMsTimestamp(video.play_url_expires_at);
        if (!expiresAt) return true;
        return expiresAt - Date.now() > 120 * 1000;
    };

    const mergeStreamQueue = () => {
        const merged = [...latestVideos, ...featuredVideos];
        const deduped: SocialVideo[] = [];
        const seen = new Set<number>();
        for (const item of merged) {
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            deduped.push(item);
        }
        return deduped;
    };

    const syncStreamQueue = () => {
        const currentId = currentStreamVideo?.id ?? null;
        streamVideos = mergeStreamQueue();

        if (!streamVideos.length) {
            streamIndex = 0;
            currentStreamVideo = null;
            streamPlayingUrl = "";
            streamError = "";
            return;
        }

        if (currentId) {
            const found = streamVideos.findIndex((item) => item.id === currentId);
            if (found >= 0) {
                streamIndex = found;
                currentStreamVideo = streamVideos[streamIndex];
                return;
            }
        }

        streamIndex = Math.min(streamIndex, streamVideos.length - 1);
        currentStreamVideo = streamVideos[streamIndex];
    };

    const showBatchLimitDialog = (count: number, onDownloadFirst?: (count: number) => void) => {
        if (!batchLimitEnabled) return;

        const subsetCounts = (() => {
            if (!onDownloadFirst) return [];
            const limit = batchMaxItems;
            const candidates = [limit, 50, 20, 10, 5];
            const unique = new Set<number>();

            for (const candidate of candidates) {
                if (
                    typeof candidate === "number" &&
                    Number.isFinite(candidate) &&
                    candidate > 1 &&
                    candidate <= limit
                ) {
                    unique.add(candidate);
                }
            }

            return [...unique].sort((a, b) => b - a).slice(0, 3);
        })();

        createDialog({
            id: "batch-limit",
            type: "small",
            meowbalt: "error",
            title: $t("dialog.batch.limit.title"),
            bodyText: $t("dialog.batch.limit.body", {
                count,
                max: batchMaxItems,
            }),
            buttons: [
                ...subsetCounts.map((subsetCount, index) => ({
                    text: $t("dialog.batch.limit.download_first", { count: subsetCount }),
                    main: index === 0,
                    action: () => onDownloadFirst?.(subsetCount),
                })),
                {
                    text: $t("button.gotit"),
                    main: subsetCounts.length === 0,
                    action: () => {},
                },
            ],
        });
    };

    const spawnBatchDialog = (
        items: DialogBatchItem[],
        title?: string,
        collectionKey?: string,
        collectionSourceUrl?: string,
        downloadMode?: "auto" | "audio",
    ) => {
        createDialog({
            id: `discover-batch-${Date.now()}`,
            type: "batch",
            title,
            items,
            collectionKey,
            collectionSourceUrl,
            downloadMode,
        });
    };

    const openBatchDialog = (
        items: DialogBatchItem[],
        title?: string,
        collectionKey?: string,
        collectionSourceUrl?: string,
        downloadMode?: "auto" | "audio",
    ) => {
        if (batchLimitEnabled && items.length > batchMaxItems) {
            const batchTitle = title || $t("dialog.batch.title");
            showBatchLimitDialog(items.length, (count) => {
                const subset = items.slice(0, count);
                const nextTitle =
                    subset.length < items.length
                        ? `${batchTitle} (${subset.length}/${items.length})`
                        : batchTitle;
                spawnBatchDialog(subset, nextTitle, collectionKey, collectionSourceUrl, downloadMode);
            });
            return;
        }

        spawnBatchDialog(items, title, collectionKey, collectionSourceUrl, downloadMode);
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
            if (video.thumbnail_proxy_path) {
                return `${currentApiURL()}${video.thumbnail_proxy_path}`;
            }
            return `${currentApiURL()}/social/media/proxy?url=${encodeURIComponent(
                video.thumbnail_url
            )}`;
        }
        return video.thumbnail_url;
    };

    const isBilibiliUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname;
            return (
                host === "bilibili.com" ||
                host === "www.bilibili.com" ||
                host === "m.bilibili.com" ||
                host.endsWith(".bilibili.com") ||
                host === "b23.tv"
            );
        } catch {
            return false;
        }
    };

    const isDouyinUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            return (
                parsed.hostname === "v.douyin.com" ||
                parsed.hostname === "douyin.com" ||
                parsed.hostname.endsWith(".douyin.com") ||
                parsed.hostname === "iesdouyin.com" ||
                parsed.hostname.endsWith(".iesdouyin.com")
            );
        } catch {
            return false;
        }
    };

    const isTikTokUrl = (url: string) => {
        try {
            const parsed = new URL(url);
            return parsed.hostname === "tiktok.com" || parsed.hostname.endsWith(".tiktok.com");
        } catch {
            return false;
        }
    };

    const buildResourceRequest = (url: string, mode: ResourceDownloadMode) => {
        const request = buildSaveRequest(url);
        request.downloadMode = mode === "audio" ? "audio" : "auto";
        return request;
    };

    const flattenResourceTree = (
        nodes: ResourceCategoryNode[],
        depth = 0,
        list: ResourceListItem[] = [],
        expanded: Set<number>
    ) => {
        nodes.forEach((node) => {
            const hasChildren = node.children && node.children.length > 0;
            const isExpanded = expanded.has(node.id);
            list.push({ node, depth, hasChildren, isExpanded });
            if (hasChildren && isExpanded) {
                flattenResourceTree(node.children, depth + 1, list, expanded);
            }
        });
        return list;
    };

    const findResourceNode = (
        nodes: ResourceCategoryNode[],
        id: number | null
    ): ResourceCategoryNode | null => {
        if (id == null) return null;
        for (const node of nodes) {
            if (node.id === id) return node;
            const child: ResourceCategoryNode | null = findResourceNode(node.children || [], id);
            if (child) return child;
        }
        return null;
    };

    const findResourcePath = (
        nodes: ResourceCategoryNode[],
        id: number | null,
        trail: ResourceCategoryNode[] = []
    ): ResourceCategoryNode[] => {
        if (id == null) return [];
        for (const node of nodes) {
            const nextTrail = [...trail, node];
            if (node.id === id) return nextTrail;
            const childPath: ResourceCategoryNode[] = findResourcePath(node.children || [], id, nextTrail);
            if (childPath.length) return childPath;
        }
        return [];
    };

    const findFirstSelectable = (nodes: ResourceCategoryNode[]): ResourceCategoryNode | null => {
        for (const node of nodes) {
            if (node.links && node.links.length) return node;
            const child: ResourceCategoryNode | null = findFirstSelectable(node.children || []);
            if (child) return child;
        }
        return nodes.length ? nodes[0] : null;
    };

    const toggleResource = (node: ResourceCategoryNode) => {
        if (!node.children || !node.children.length) return;
        const next = new Set(resourceExpanded);
        if (next.has(node.id)) {
            next.delete(node.id);
        } else {
            next.add(node.id);
        }
        resourceExpanded = next;
    };

    const selectResource = (node: ResourceCategoryNode) => {
        resourceSelectedId = node.id;
        if (node.children && node.children.length) {
            const next = new Set(resourceExpanded);
            if (next.has(node.id)) {
                next.delete(node.id);
            } else {
                next.add(node.id);
            }
            resourceExpanded = next;
        }
    };


    const isBrowser = typeof window !== "undefined";

    $: if (isBrowser && activeTab === "beauty" && !beautyLoaded) {
        beautyLoaded = true;
        void loadAll();
    }

    $: if (isBrowser && activeTab === "resources" && locale && locale !== resourceLoadedLocale) {
        void loadResources();
    }

    $: if (activeTab === "beauty") {
        if (streamVideos.length === 0) {
            currentStreamVideo = null;
            streamPlayingUrl = "";
            streamError = "";
        } else if (!currentStreamVideo) {
            currentStreamVideo = streamVideos[streamIndex] || streamVideos[0];
            streamIndex = Math.max(0, streamVideos.findIndex((item) => item.id === currentStreamVideo?.id));
            if (currentStreamVideo && isPlayableFresh(currentStreamVideo)) {
                streamPlayingUrl = currentStreamVideo.play_url || "";
            }
            void ensureCurrentStreamPlayable(false);
        }
    }

    async function loadResources() {
        resourceLoading = true;
        resourceError = "";
        resourceLoadedLocale = locale;

        try {
            const response = await resources.tree(locale);
            if (response.status !== "success" || !response.data) {
                throw new Error(response.error?.message || $t("discover.status.error"));
            }

            resourceTree = response.data.categories || [];

            resourceExpanded = new Set();

            const first = findFirstSelectable(resourceTree);
            resourceSelectedId = first ? first.id : null;
        } catch (e) {
            resourceTree = [];
            resourceError = e instanceof Error ? e.message : $t("discover.status.error");
        } finally {
            resourceLoading = false;
        }
    }

    async function loadAll() {
        loading = true;
        loadingMore = false;
        error = "";
        latestPage = 1;
        latestHasMore = false;

        try {
            const [featuredRes, latestRes] = await Promise.all([
                videos.list({
                    platform: platformParam,
                    is_active: true,
                    is_featured: true,
                    limit: 20,
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
            featuredVideos = [];
            latestVideos = [];
            latestHasMore = false;
            error = e instanceof Error ? e.message : $t("discover.status.error");
        } finally {
            syncStreamQueue();
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
            syncStreamQueue();
        } catch (e) {
            error = e instanceof Error ? e.message : $t("discover.status.error");
        } finally {
            loadingMore = false;
        }
    }

    const updateStreamVideo = (videoId: number, updates: Partial<SocialVideo>) => {
        streamVideos = streamVideos.map((item) =>
            item.id === videoId ? { ...item, ...updates } : item
        );
        featuredVideos = featuredVideos.map((item) =>
            item.id === videoId ? { ...item, ...updates } : item
        );
        latestVideos = latestVideos.map((item) =>
            item.id === videoId ? { ...item, ...updates } : item
        );
        currentStreamVideo = streamVideos[streamIndex] || null;
    };

    async function ensureCurrentStreamPlayable(forceRefresh = false) {
        const video = currentStreamVideo;
        if (!video) return;

        if (!forceRefresh && isPlayableFresh(video)) {
            streamPlayingUrl = video.play_url || "";
            streamError = "";
            return;
        }

        const token = ++streamResolveToken;
        streamResolving = true;
        streamError = "";

        try {
            const response = await videos.play(video.id, { refresh: forceRefresh });
            if (token !== streamResolveToken) return;

            if (response.status !== "success" || !response.data?.url) {
                throw new Error(response.error?.message || $t("discover.status.error"));
            }

            streamPlayingUrl = response.data.url;
            updateStreamVideo(video.id, {
                play_url: response.data.url,
                play_url_expires_at: response.data.expires_at ?? null,
                play_url_error: null,
            });
        } catch (e) {
            if (token !== streamResolveToken) return;
            streamError = e instanceof Error ? e.message : $t("discover.status.error");
            streamPlayingUrl = video.play_url || "";
        } finally {
            if (token === streamResolveToken) {
                streamResolving = false;
            }
        }
    }

    const ensureMoreAhead = () => {
        if (!latestHasMore || loadingMore) return;
        if (streamIndex >= Math.max(0, streamVideos.length - 3)) {
            void loadMore();
        }
    };

    const goToStreamIndex = (nextIndex: number) => {
        if (!streamVideos.length) return;
        const total = streamVideos.length;
        const normalized = ((nextIndex % total) + total) % total;
        streamIndex = normalized;
        currentStreamVideo = streamVideos[streamIndex] || null;
        streamPlayingUrl = currentStreamVideo?.play_url && isPlayableFresh(currentStreamVideo)
            ? currentStreamVideo.play_url
            : "";
        streamError = "";
        ensureMoreAhead();
        void ensureCurrentStreamPlayable(false);
    };

    const goNextVideo = () => {
        goToStreamIndex(streamIndex + 1);
    };

    const goPrevVideo = () => {
        goToStreamIndex(streamIndex - 1);
    };

    const handleStreamEnded = () => {
        goNextVideo();
    };

    const handleStreamTouchStart = (event: TouchEvent) => {
        streamTouchStartY = event.touches?.[0]?.clientY ?? null;
    };

    const handleStreamTouchEnd = (event: TouchEvent) => {
        if (streamTouchStartY === null) return;
        const endY = event.changedTouches?.[0]?.clientY ?? streamTouchStartY;
        const diff = endY - streamTouchStartY;
        streamTouchStartY = null;
        if (Math.abs(diff) < 36) return;
        if (diff < 0) {
            goNextVideo();
        } else {
            goPrevVideo();
        }
    };

    async function handleDownload(video: SocialVideo) {
        if (!video?.video_url) return;

        void videos.trackEvent(video.id, "download_click").catch(() => {});

        runningDownloadId = video.id;
        showSlowHint = false;
        if (slowHintTimer) {
            clearTimeout(slowHintTimer);
        }
        slowHintTimer = setTimeout(() => {
            showSlowHint = true;
        }, 4000);
        try {
            await savingHandler({ url: video.video_url });
        } finally {
            runningDownloadId = null;
            showSlowHint = false;
            if (slowHintTimer) {
                clearTimeout(slowHintTimer);
                slowHintTimer = null;
            }
        }
    }

    async function handleResourceDownload(link: ResourceLink, mode: ResourceDownloadMode) {
        if (!link?.url) return;
        resourceDownloadingId = link.id;
        resourceDownloadingMode = mode;
        try {
            const url = link.url;
            const downloadMode = mode === "audio" ? "audio" : "auto";

            if (!isBilibiliUrl(url) && !isDouyinUrl(url) && !isTikTokUrl(url)) {
                await savingHandler({ request: buildResourceRequest(url, mode) });
                return;
            }

            let expanded: any;
            try {
                expanded = await API.expand(url);
            } catch {
                await savingHandler({ request: buildResourceRequest(url, mode) });
                return;
            }

            if (!expanded || expanded.status === "error") {
                await savingHandler({ request: buildResourceRequest(url, mode) });
                return;
            }

            const items = expanded.items ?? [];
            const hasBatch = expanded.kind !== "single" && items.length > 1;

            if (!hasBatch) {
                await savingHandler({ request: buildResourceRequest(url, mode) });
                return;
            }

            const batchItems: DialogBatchItem[] = items.map((item: any) => ({
                url: item.url,
                title: item.title,
                duration: item.duration,
                itemKey: item.itemKey,
            }));
            openBatchDialog(
                batchItems,
                expanded.title || link.title || $t("dialog.batch.title"),
                expanded.collectionKey,
                url,
                downloadMode,
            );
        } finally {
            resourceDownloadingId = null;
            resourceDownloadingMode = null;
        }
    }

    async function handleCreatorBatch(video: SocialVideo) {
        const accountId = video.account_id;
        const creatorName = getCreatorName(video) || getCreatorHandle(video) || String(accountId);

        void videos.trackEvent(video.id, "creator_batch_open").catch(() => {});

        try {
            const recentRes = await videos.list({
                account_id: accountId,
                is_active: true,
                limit: 20,
                sort: "created_at",
                order: "DESC",
            });

            if (recentRes.status !== "success" || !recentRes.data) {
                throw new Error(recentRes.error?.message || $t("discover.status.error"));
            }

            const merged = normalize(recentRes.data.videos || []);

            const seen = new Set<string>();
            const items: DialogBatchItem[] = merged
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
                $t("discover.action.creator_batch_title", { name: creatorName } as any),
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

    $: resourceList = flattenResourceTree(resourceTree, 0, [], resourceExpanded);
    $: selectedResource = findResourceNode(resourceTree, resourceSelectedId);
    $: selectedLinks = selectedResource?.links || [];
    $: resourcePath = findResourcePath(resourceTree, resourceSelectedId);
    $: resourcePathLabel = resourcePath.map((node) => node.name).join(" / ");
</script>


<svelte:head>
    <title>{$t("general.seo.discover.title")}</title>
    <meta name="description" content={$t("general.seo.discover.description")} />
    <meta name="keywords" content={$t("general.seo.discover.keywords")} />
    <meta property="og:title" content={$t("general.seo.discover.title")} />
    <meta property="og:description" content={$t("general.seo.discover.description")} />
</svelte:head>

<div class="discover-layout">
    <aside class="discover-menu">
        <button
            class="menu-button"
            class:active={activeTab === "resources"}
            type="button"
            on:click={() => (activeTab = "resources")}
        >
            {$t("discover.menu.resources")}
        </button>
        <button
            class="menu-button"
            class:active={activeTab === "beauty"}
            type="button"
            on:click={() => (activeTab = "beauty")}
        >
            {$t("discover.menu.beauty")}
        </button>
    </aside>

    <div class="discover-main">
        {#if activeTab === "resources"}
            <div class="discover-container discover-container--resources">
                <header class="header header--resource">
                    <div class="header-content">
                        <h1 class="title">{$t("discover.resources.title")}</h1>
                        <p class="subtitle">{$t("discover.resources.subtitle")}</p>
                    </div>
                </header>

                {#if resourceError}
                    <div class="error-banner">{resourceError}</div>
                {/if}

                {#if resourceLoading}
                    <div class="loading-container">
                        <div class="spinner"></div>
                        <p>{$t("discover.status.loading")}</p>
                    </div>
                {:else if resourceTree.length === 0}
                    <div class="empty-state">
                        <h3>{$t("discover.resources.empty.title")}</h3>
                        <p>{$t("discover.resources.empty.description")}</p>
                    </div>
                {:else}
                    <div class="resource-layout">
                        <aside class="resource-tree">
                            <div class="resource-tree-list">
                                {#each resourceList as item (item.node.id)}
                                    <div
                                        class="resource-node"
                                        class:is-active={resourceSelectedId === item.node.id}
                                        style={`--depth:${item.depth}`}
                                    >
                                        {#if item.hasChildren}
                                            <button
                                                class="resource-toggle"
                                                type="button"
                                                on:click|stopPropagation={() => toggleResource(item.node)}
                                            >
                                                {item.isExpanded ? "v" : ">"}
                                            </button>
                                        {:else}
                                            <span class="resource-toggle-spacer"></span>
                                        {/if}
                                        <button
                                            class="resource-label"
                                            type="button"
                                            on:click={() => selectResource(item.node)}
                                        >
                                            {item.node.name}
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        </aside>

                        <section class="resource-detail">
                            {#if selectedResource}
                                <div class="resource-path">{resourcePathLabel}</div>
                                {#if batchLimitEnabled && Number.isFinite(batchMaxItems)}
                                    <div class="resource-limit-hint">
                                        {$t("discover.resources.batch_limit_hint", { max: batchMaxItems })}
                                    </div>
                                {/if}
                                {#if selectedLinks.length === 0}
                                    <div class="resource-empty-links">
                                        <h3>{$t("discover.resources.empty_links.title")}</h3>
                                        <p>{$t("discover.resources.empty_links.description")}</p>
                                    </div>
                                {:else}
                                    <div class="resource-links">
                                        {#each selectedLinks as link (link.id)}
                                            <div class="resource-link">
                                                <div class="resource-link-body">
                                                    <div class="resource-link-title">{link.title}</div>
                                                    <div class="resource-link-url">{link.url}</div>
                                                    {#if link.description}
                                                        <div class="resource-link-desc">{link.description}</div>
                                                    {/if}
                                                </div>
                                                <div class="resource-link-actions">
                                                    <button
                                                        class="btn-secondary"
                                                        type="button"
                                                        disabled={resourceDownloadingId === link.id}
                                                        on:click={() => handleResourceDownload(link, "audio")}
                                                    >
                                                        {resourceDownloadingId === link.id &&
                                                        resourceDownloadingMode === "audio"
                                                            ? $t("discover.resources.action.downloading")
                                                            : $t("button.download.audio")}
                                                    </button>
                                                    <button
                                                        class="btn-primary"
                                                        type="button"
                                                        disabled={resourceDownloadingId === link.id}
                                                        on:click={() => handleResourceDownload(link, "video")}
                                                    >
                                                        {resourceDownloadingId === link.id &&
                                                        resourceDownloadingMode === "video"
                                                            ? $t("discover.resources.action.downloading")
                                                            : $t("button.download.video")}
                                                    </button>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            {:else}
                                <div class="resource-empty-links">
                                    <h3>{$t("discover.resources.select.title")}</h3>
                                    <p>{$t("discover.resources.select.description")}</p>
                                </div>
                            {/if}
                        </section>
                    </div>
                {/if}
            </div>
        {:else}
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
                        <div class="select-arrow">v</div>
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
                {:else if featuredVideos.length === 0 && latestVideos.length === 0}
                    <div class="empty-state">
                        <h3>{$t("discover.status.empty.title")}</h3>
                        <p>{$t("discover.status.empty.description")}</p>
                    </div>
                {:else}
                    <section class="immersive-section">
                        <div
                            class="immersive-player"
                            on:touchstart={handleStreamTouchStart}
                            on:touchend={handleStreamTouchEnd}
                        >
                            {#if currentStreamVideo}
                                {#if streamPlayingUrl}
                                    <video
                                        class="immersive-video"
                                        src={streamPlayingUrl}
                                        autoplay
                                        playsinline
                                        controls
                                        muted={streamMuted}
                                        preload="metadata"
                                        on:ended={handleStreamEnded}
                                    ></video>
                                {:else}
                                    <div class="immersive-loading">
                                        <div class="spinner"></div>
                                        <p>{$t("discover.status.loading")}</p>
                                    </div>
                                {/if}

                                {#if streamResolving}
                                    <div class="immersive-badge">Resolving...</div>
                                {/if}

                                <div class="immersive-meta">
                                    <div class="immersive-title" title={getTitle(currentStreamVideo)}>
                                        {getTitle(currentStreamVideo)}
                                    </div>
                                    <div class="immersive-submeta">
                                        <span class={`badge badge-${currentStreamVideo.platform}`}>
                                            {getPlatformLabel(currentStreamVideo.platform)}
                                        </span>
                                        {#if getCreatorName(currentStreamVideo)}
                                            <span class="creator">{getCreatorName(currentStreamVideo)}</span>
                                        {/if}
                                        <span class="immersive-count">
                                            {streamIndex + 1}/{streamVideos.length}
                                        </span>
                                    </div>
                                </div>

                                <div class="immersive-actions">
                                    <button class="btn-secondary" type="button" on:click={goPrevVideo}>
                                        Prev
                                    </button>
                                    <button class="btn-secondary" type="button" on:click={goNextVideo}>
                                        Next
                                    </button>
                                    <button
                                        class="btn-secondary"
                                        type="button"
                                        on:click={() => {
                                            streamMuted = !streamMuted;
                                        }}
                                    >
                                        {streamMuted ? "Unmute" : "Mute"}
                                    </button>
                                    <button
                                        class="btn-secondary"
                                        type="button"
                                        disabled={streamResolving}
                                        on:click={() => ensureCurrentStreamPlayable(true)}
                                    >
                                        Refresh Link
                                    </button>
                                    <button
                                        class="btn-primary"
                                        type="button"
                                        disabled={!currentStreamVideo || runningDownloadId === currentStreamVideo.id}
                                        on:click={() => {
                                            if (currentStreamVideo) {
                                                void handleDownload(currentStreamVideo);
                                            }
                                        }}
                                    >
                                        {runningDownloadId === currentStreamVideo.id
                                            ? $t("discover.status.parsing")
                                            : $t("button.download")}
                                    </button>
                                </div>

                                {#if streamError}
                                    <div class="error-banner immersive-error">{streamError}</div>
                                {/if}
                            {/if}
                        </div>
                    </section>
                {/if}
            </div>
        {/if}
    </div>
</div>
<style>
    .discover-layout {
        padding: calc(var(--padding) * 2.5) calc(var(--padding) * 2);
        padding-left: 0;
        width: 100%;
        max-width: none;
        margin: 0;
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: calc(var(--padding) * 1.1);
        align-items: start;
    }

    .discover-menu {
        position: sticky;
        top: calc(var(--padding) * 2);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .menu-button {
        border: none;
        border-radius: calc(var(--border-radius) * 1.2);
        padding: 10px 12px;
        font-size: 0.9rem;
        font-weight: 700;
        background: var(--popup-bg);
        color: var(--button-text);
        cursor: pointer;
        text-align: left;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        transition: all 0.2s;
    }

    .menu-button:hover {
        background: var(--button-hover-transparent);
    }

    .menu-button.active {
        background: var(--accent);
        color: var(--white);
        box-shadow: none;
    }

    .discover-main {
        min-width: 0;
        width: 100%;
    }

    .discover-container {
        padding: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .discover-container--resources {
        align-items: stretch;
    }

    .header {
        text-align: center;
        margin-bottom: calc(var(--padding) * 1.5);
        width: 100%;
        max-width: 1100px;
    }

    .header--resource {
        text-align: left;
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

    .immersive-section {
        width: 100%;
        max-width: 1100px;
    }

    .immersive-player {
        width: 100%;
        border-radius: calc(var(--border-radius) * 1.5);
        overflow: hidden;
        background: #0f1116;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        position: relative;
    }

    .immersive-video {
        width: 100%;
        aspect-ratio: 9 / 16;
        max-height: 76vh;
        background: #000;
        object-fit: cover;
        display: block;
    }

    .immersive-loading {
        aspect-ratio: 9 / 16;
        max-height: 76vh;
        min-height: 420px;
        display: grid;
        place-items: center;
        color: var(--white);
        gap: 12px;
    }

    .immersive-meta {
        padding: 12px 14px 10px;
        background: rgba(15, 17, 22, 0.96);
        color: var(--white);
    }

    .immersive-title {
        font-weight: 700;
        line-height: 1.35;
        margin-bottom: 6px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .immersive-submeta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .immersive-count {
        margin-left: auto;
        font-size: 0.82rem;
        opacity: 0.86;
    }

    .immersive-actions {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        padding: 10px 12px 12px;
        background: rgba(15, 17, 22, 0.96);
    }

    .immersive-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 4;
        background: rgba(0, 0, 0, 0.7);
        color: var(--white);
        font-size: 0.72rem;
        border-radius: 999px;
        padding: 4px 10px;
    }

    .immersive-error {
        margin: 0 12px 12px;
    }

    .resource-layout {
        width: 100%;
        max-width: 1100px;
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: calc(var(--padding) * 1.25);
        align-items: start;
    }

    .resource-tree,
    .resource-detail {
        background: var(--popup-bg);
        border-radius: calc(var(--border-radius) * 1.5);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        padding: calc(var(--padding) * 1.1);
    }

    .resource-tree-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .resource-node {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: calc(var(--border-radius) * 1.1);
        padding-left: calc(8px + (var(--depth) * 14px));
        transition: background 0.15s ease;
    }

    .resource-node.is-active {
        background: var(--button-hover-transparent);
    }

    .resource-toggle {
        border: none;
        background: none;
        color: var(--gray);
        font-weight: 700;
        cursor: pointer;
        padding: 0;
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .resource-toggle-spacer {
        width: 16px;
        height: 16px;
        display: inline-block;
    }

    .resource-label {
        border: none;
        background: none;
        color: var(--button-text);
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        text-align: left;
        flex: 1;
    }

    .resource-path {
        font-size: 0.8rem;
        color: var(--gray);
        margin-bottom: calc(var(--padding) * 0.6);
    }

    .resource-limit-hint {
        font-size: 0.78rem;
        color: var(--gray);
        margin-bottom: calc(var(--padding) * 0.8);
    }

    .resource-links {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .resource-link {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px;
        border-radius: calc(var(--border-radius) * 1.2);
        background: var(--button-hover-transparent);
    }

    .resource-link-body {
        flex: 1;
        min-width: 0;
    }

    .resource-link-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        align-items: center;
    }

    .resource-link-title {
        font-size: 0.92rem;
        font-weight: 700;
        color: var(--button-text);
        margin-bottom: 4px;
    }

    .resource-link-desc {
        font-size: 0.82rem;
        color: var(--gray);
        line-height: 1.4;
    }

    .resource-link-url {
        font-size: 0.78rem;
        color: var(--gray);
        word-break: break-all;
        line-height: 1.35;
        user-select: text;
        cursor: text;
        opacity: 0.9;
    }

    .resource-empty-links {
        text-align: center;
        padding: calc(var(--padding) * 1.5) 0;
        color: var(--gray);
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
        .discover-layout {
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

        .resource-link {
            flex-direction: column;
            align-items: stretch;
        }

        .resource-link-actions {
            width: 100%;
        }
    }

    @media (max-width: 900px) {
        .discover-layout {
            grid-template-columns: 1fr;
        }

        .discover-menu {
            position: static;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 8px;
        }

        .menu-button {
            flex: 1 1 auto;
            text-align: center;
        }

        .resource-layout {
            grid-template-columns: 1fr;
        }

        .immersive-video,
        .immersive-loading {
            max-height: 72vh;
        }

        .immersive-actions {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
    }

    @media (max-width: 520px) {
        .immersive-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
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

    .thumb:disabled {
        cursor: not-allowed;
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

    .thumb-loading {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        color: var(--white);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        text-align: center;
        padding: 12px;
    }

    .thumb-hint {
        font-size: 0.75rem;
        font-weight: 500;
        opacity: 0.85;
    }

    .thumb-spinner {
        width: 28px;
        height: 28px;
        border: 3px solid rgba(255, 255, 255, 0.35);
        border-top-color: var(--white);
        border-radius: 50%;
        animation: spin 1s linear infinite;
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
        background: var(--accent);
        color: var(--white);
    }

    .btn-primary:hover:not(:disabled) {
        background: var(--accent-hover);
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
