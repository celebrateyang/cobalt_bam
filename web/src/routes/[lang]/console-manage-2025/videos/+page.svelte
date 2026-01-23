<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { currentApiURL } from "$lib/api/api-url";
    import {
        auth,
        videos,
        accounts,
        type SocialVideo,
        type SocialAccount,
    } from "$lib/api/social";

    let videoList: SocialVideo[] = [];
    let accountList: SocialAccount[] = [];
    let loading = true;
    let error = "";
    let message = "";
    let showAddModal = false;
    let editingVideo: SocialVideo | null = null;
    $: lang = $page.params.lang;

    let selectedVideoIds = new Set<number>();
    let deletingSelected = false;
    let syncingThumbnails = false;
    let syncingIgAccounts = false;
    $: selectedCount = selectedVideoIds.size;
    $: allSelected =
        videoList.length > 0 &&
        videoList.every((video) => selectedVideoIds.has(video.id));

    // 筛选条件
    let filters = {
        platform: "",
        account_id: "",
        is_featured: "",
    };

    $: filteredAccounts = filters.platform
        ? accountList.filter((account) => account.platform === filters.platform)
        : accountList;

    // 表单数据
    let formData = {
        account_id: 0,
        title: "",
        description: "",
        video_url: "",
        thumbnail_url: "",
        duration: 0,
        view_count: 0,
        like_count: 0,
        is_featured: false,
        tags: "",
    };

    onMount(async () => {
        const verified = await auth.verify();
        if (verified.status !== "success") {
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        await Promise.all([loadVideos(), loadAccounts()]);
    });

    async function loadVideos() {
        loading = true;
        error = "";
        message = "";
        selectedVideoIds = new Set();
        try {
            const params: any = {};
            if (filters.platform) params.platform = filters.platform;
            if (filters.account_id)
                params.account_id = parseInt(filters.account_id);
            if (filters.is_featured)
                params.is_featured = filters.is_featured === "true";

            console.log("Loading videos with params:", params);
            const response = await videos.list(params);
            console.log("Videos response:", response);
            if (response.status === "success" && response.data) {
                videoList = response.data.videos || [];
                console.log("Loaded videos:", videoList.length);
            } else {
                console.error("Failed to load videos:", response);
                error = response.error?.message || "加载失败";
            }
        } catch (e) {
            console.error("Exception in loadVideos:", e);
            error = "网络错误";
        } finally {
            loading = false;
        }
    }

    async function loadAccounts() {
        const response = await accounts.list();
        if (response.status === "success" && response.data) {
            accountList = response.data.accounts || [];
            if (
                filters.account_id &&
                !accountList.some(
                    (account) =>
                        account.id === Number(filters.account_id) &&
                        (!filters.platform || account.platform === filters.platform)
                )
            ) {
                filters.account_id = "";
            }
        }
    }

    function handlePlatformChange() {
        if (
            filters.platform &&
            filters.account_id &&
            !accountList.some(
                (account) =>
                    account.id === Number(filters.account_id) &&
                    account.platform === filters.platform
            )
        ) {
            filters.account_id = "";
        }
        loadVideos();
    }

    function handleAccountChange() {
        loadVideos();
    }

    function openAddModal() {
        editingVideo = null;
        formData = {
            account_id: accountList[0]?.id || 0,
            title: "",
            description: "",
            video_url: "",
            thumbnail_url: "",
            duration: 0,
            view_count: 0,
            like_count: 0,
            is_featured: false,
            tags: "",
        };
        showAddModal = true;
    }

    function openEditModal(video: SocialVideo) {
        editingVideo = video;
        formData = {
            account_id: video.account_id,
            title: video.title || "",
            description: video.description || "",
            video_url: video.video_url,
            thumbnail_url: video.thumbnail_url || "",
            duration: video.duration || 0,
            view_count: video.view_count,
            like_count: video.like_count,
            is_featured: video.is_featured,
            tags: video.tags.join(", "),
        };
        showAddModal = true;
    }

    async function handleSubmit() {
        try {
            const data = {
                ...formData,
                tags: formData.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter((t) => t),
            };

            let response;
            if (editingVideo) {
                response = await videos.update(editingVideo.id, data);
            } else {
                response = await videos.create(data);
            }

            if (response.status === "success") {
                showAddModal = false;
                await loadVideos();
            } else {
                error = response.error?.message || "操作失败";
            }
        } catch (e) {
            error = "网络错误";
        }
    }

    async function handleDelete(id: number) {
        if (!confirm("确定要删除这个视频吗？")) return;

        try {
            const response = await videos.delete(id);
            if (response.status === "success") {
                await loadVideos();
            } else {
                error = response.error?.message || "删除失败";
            }
        } catch (e) {
            error = "网络错误";
        }
    }

    function toggleSelected(id: number) {
        selectedVideoIds = new Set(selectedVideoIds);
        if (selectedVideoIds.has(id)) {
            selectedVideoIds.delete(id);
        } else {
            selectedVideoIds.add(id);
        }
    }

    function toggleSelectAll() {
        if (allSelected) {
            selectedVideoIds = new Set();
        } else {
            selectedVideoIds = new Set(videoList.map((video) => video.id));
        }
    }

    function clearSelection() {
        selectedVideoIds = new Set();
    }

    async function handleBatchDelete() {
        const ids = Array.from(selectedVideoIds);
        if (!ids.length) return;

        if (!confirm(`确认删除选中的 ${ids.length} 条视频吗？此操作不可撤销。`)) return;

        const token =
            typeof window !== "undefined"
                ? window.localStorage.getItem("admin_token")
                : null;

        if (!token) {
            error = "请先登录";
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        deletingSelected = true;
        error = "";
        message = "";

        try {
            const res = await fetch(`${currentApiURL()}/social/videos/batch-delete`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ids }),
            });

            const data = await res.json().catch(() => null);

            if (!res.ok || data?.status !== "success") {
                throw new Error(data?.error?.message || "批量删除失败");
            }

            const deleted = data?.data?.deleted ?? 0;
            message = `已删除 ${deleted} 条`;
            clearSelection();
            await loadVideos();
            message = `已删除 ${deleted} 条`;
        } catch (e) {
            error = e instanceof Error ? e.message : "网络错误";
        } finally {
            deletingSelected = false;
        }
    }

    async function handleResyncInstagramAccounts() {
        const selectedIds = Array.from(selectedVideoIds);
        const selectedAccountIds = selectedIds.length
            ? Array.from(new Set(
                videoList
                    .filter((video) => selectedVideoIds.has(video.id))
                    .map((video) => video.account_id)
            ))
            : [];

        const fallbackIds = filters.account_id
            ? [Number(filters.account_id)]
            : filters.platform === "instagram"
                ? filteredAccounts.map((account) => account.id)
                : [];

        const candidateIds = selectedAccountIds.length > 0 ? selectedAccountIds : fallbackIds;
        const instagramIds = candidateIds.filter((id) =>
            accountList.some((account) => account.id === id && account.platform === "instagram")
        );

        if (!instagramIds.length) {
            error = "Please select Instagram accounts/videos first.";
            return;
        }

        const label = instagramIds.length === 1 ? "1 account" : `${instagramIds.length} accounts`;
        if (!confirm(`Re-sync recent+pinned for ${label}?`)) return;

        syncingIgAccounts = true;
        error = "";
        message = "";

        let ok = 0;
        let failed = 0;

        try {
            for (const id of instagramIds) {
                try {
                    const response = await accounts.sync(id);
                    if (response.status === "success") {
                        ok += 1;
                    } else {
                        failed += 1;
                    }
                } catch (e) {
                    failed += 1;
                }
            }

            message = `IG re-sync done: ${ok} ok, ${failed} failed`;
            await loadVideos();
        } finally {
            syncingIgAccounts = false;
        }
    }

    async function handleRefreshThumbnails() {
        const ids =
            selectedCount > 0
                ? Array.from(selectedVideoIds)
                : videoList.map((video) => video.id);
        if (!ids.length) return;

        const label =
            selectedCount > 0 ? `${selectedCount} æ¡` : "æœ¬é¡µè§†é¢‘";
        if (!confirm(`ç¡®è®¤åŒæ­¥${label}çš„ç¼©ç•¥å›¾å—ï¼Ÿ`)) return;

        syncingThumbnails = true;
        error = "";
        message = "";
        try {
            const response = await videos.refreshThumbnails(ids);
            if (response.status === "success" && response.data) {
                const { refreshed, skipped, total, unsupported = 0 } = response.data;
                message = `å·²æ›´æ–°${refreshed}/${total}ï¼Œè·³è¿‡${skipped}`;
                await loadVideos();
            } else {
                error = response.error?.message || "åŒæ­¥å¤±è´¥";
            }
        } catch (e) {
            error = "ç½‘ç»œé”™è¯¯";
        } finally {
            syncingThumbnails = false;
        }
    }

    async function handleToggleFeatured(video: SocialVideo) {
        try {
            const response = await videos.toggleFeatured(video.id);
            if (response.status === "success") {
                await loadVideos();
            }
        } catch (e) {
            error = "操作失败";
        }
    }

    function getAccountName(accountId: number): string {
        const account = accountList.find((a) => a.id === accountId);
        return account ? account.display_name || account.username : "未知";
    }

    function getThumbnailSrc(video: SocialVideo): string {
        if (!video.thumbnail_url) return "";
        const cacheBust =
            typeof video.synced_at === "number" && video.synced_at > 0
                ? video.synced_at
                : typeof video.updated_at === "number"
                    ? video.updated_at
                    : Date.now();
        const raw = video.thumbnail_url.includes("?")
            ? `${video.thumbnail_url}&cb=${cacheBust}`
            : `${video.thumbnail_url}?cb=${cacheBust}`;

        if (video.platform === "instagram" || video.platform === "tiktok") {
            return `${currentApiURL()}/social/media/proxy?url=${encodeURIComponent(
                raw
            )}`;
        }
        return raw;
    }

    function formatDuration(seconds?: number): string {
        const safeSeconds = typeof seconds === "number" && seconds > 0 ? Math.floor(seconds) : 0;
        const mins = Math.floor(safeSeconds / 60);
        const secs = safeSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
</script>

<div class="admin-container">
    <header class="admin-header">
        <h1>视频管理</h1>
        <div class="header-actions">
            <button class="btn-primary" on:click={openAddModal}
                >+ 添加视频</button
            >
        </div>
    </header>

    <div class="filters">
        <select bind:value={filters.platform} on:change={handlePlatformChange}>
            <option value="">所有平台</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
        </select>

        <select bind:value={filters.account_id} on:change={handleAccountChange}>
            <option value="">所有账号</option>
            {#each filteredAccounts as account}
                <option value={account.id}
                    >{account.display_name || account.username}</option
                >
            {/each}
        </select>

        <select bind:value={filters.is_featured} on:change={loadVideos}>
            <option value="">所有视频</option>
            <option value="true">仅精选</option>
            <option value="false">非精选</option>
        </select>
    </div>

    {#if videoList.length > 0}
        <div class="bulk-bar">
            <label class="bulk-checkbox">
                <input
                    type="checkbox"
                    checked={allSelected}
                    on:change={toggleSelectAll}
                />
                全选本页
            </label>

            <div class="bulk-right">
                <span class="bulk-count">已选 {selectedCount} 条</span>
                <button
                    class="btn-secondary"
                    type="button"
                    disabled={selectedCount === 0 || deletingSelected}
                    on:click={clearSelection}
                >
                    清空
                </button>
                <button
                    class="btn-secondary"
                    type="button"
                    disabled={syncingThumbnails || videoList.length === 0}
                    on:click={handleRefreshThumbnails}
                >
                    {syncingThumbnails
                        ? "Refreshing..."
                        : selectedCount > 0
                            ? `Refresh thumbnails (${selectedCount})`
                            : "Refresh thumbnails (page)"}
                </button>
                <button
                    class="btn-secondary"
                    type="button"
                    disabled={syncingIgAccounts}
                    on:click={handleResyncInstagramAccounts}
                >
                    {syncingIgAccounts ? "IG re-sync..." : "IG re-sync (recent+pinned)"}
                </button>
                <button
                    class="btn-bulk-delete"
                    type="button"
                    disabled={selectedCount === 0 || deletingSelected}
                    on:click={handleBatchDelete}
                >
                    {deletingSelected ? "删除中..." : `删除已选 (${selectedCount})`}
                </button>
            </div>
        </div>
    {/if}

    {#if error}
        <div class="error-message">{error}</div>
    {/if}

    {#if message}
        <div class="message">{message}</div>
    {/if}

    {#if loading}
        <div class="loading">加载中...</div>
    {:else}
        <div class="videos-list">
            {#each videoList as video}
                <div class="video-item" class:selected={selectedVideoIds.has(video.id)}>
                    <div class="video-main">
                        <div class="video-left">
                            <div class="video-select">
                                <input
                                    type="checkbox"
                                    checked={selectedVideoIds.has(video.id)}
                                    on:change={() => toggleSelected(video.id)}
                                />
                            </div>
                            <div class="thumbnail-small">
                                {#if video.thumbnail_url}
                                    <img
                                        src={getThumbnailSrc(video)}
                                        alt={video.title}
                                    />
                                {:else}
                                    <div class="no-thumbnail-small">📹</div>
                                {/if}
                                <div class="duration-badge">
                                    {formatDuration(video.duration)}
                                </div>
                                {#if video.is_featured}
                                    <div class="featured-star">⭐</div>
                                {/if}
                            </div>

                            <div class="video-info">
                                <div class="title-row">
                                    <h3 class="video-title">{video.title}</h3>
                                </div>
                                <div class="meta-row">
                                    <span class="account-badge"
                                        >{getAccountName(
                                            video.account_id,
                                        )}</span
                                    >
                                    <span class="stat-item"
                                        >👁 {video.view_count.toLocaleString()}</span
                                    >
                                    <span class="stat-item"
                                        >❤️ {video.like_count.toLocaleString()}</span
                                    >
                                </div>
                                {#if video.tags.length > 0}
                                    <div class="tags-inline">
                                        {#each video.tags as tag}
                                            <span class="tag-small">{tag}</span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <div class="video-actions">
                            <button
                                class="toggle-btn-small"
                                class:active={video.is_featured}
                                on:click={() => handleToggleFeatured(video)}
                                title={video.is_featured
                                    ? "取消精选"
                                    : "设为精选"}
                            >
                                ⭐
                            </button>
                            <button
                                class="btn-icon btn-edit"
                                on:click={() => openEditModal(video)}
                                title="编辑"
                            >
                                ✏️
                            </button>
                            <button
                                class="btn-icon btn-delete"
                                on:click={() => handleDelete(video.id)}
                                title="删除"
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showAddModal}
    <div class="modal-overlay" on:click={() => (showAddModal = false)}>
        <div class="modal" on:click|stopPropagation>
            <h2>{editingVideo ? "编辑视频" : "添加视频"}</h2>

            <form on:submit|preventDefault={handleSubmit}>
                <div class="form-group">
                    <label>所属账号 *</label>
                    <select bind:value={formData.account_id} required>
                        {#each accountList as account}
                            <option value={account.id}>
                                {account.display_name || account.username} ({account.platform})
                            </option>
                        {/each}
                    </select>
                </div>

                <div class="form-group">
                    <label>标题 *</label>
                    <input type="text" bind:value={formData.title} required />
                </div>

                <div class="form-group">
                    <label>描述</label>
                    <textarea bind:value={formData.description} rows="3"
                    ></textarea>
                </div>

                <div class="form-group">
                    <label>视频 URL *</label>
                    <input
                        type="url"
                        bind:value={formData.video_url}
                        required
                    />
                </div>

                <div class="form-group">
                    <label>缩略图 URL</label>
                    <input type="url" bind:value={formData.thumbnail_url} />
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>时长（秒）</label>
                        <input
                            type="number"
                            bind:value={formData.duration}
                            min="0"
                        />
                    </div>

                    <div class="form-group">
                        <label>观看数</label>
                        <input
                            type="number"
                            bind:value={formData.view_count}
                            min="0"
                        />
                    </div>

                    <div class="form-group">
                        <label>点赞数</label>
                        <input
                            type="number"
                            bind:value={formData.like_count}
                            min="0"
                        />
                    </div>
                </div>

                <div class="form-group">
                    <label>标签（逗号分隔）</label>
                    <input
                        type="text"
                        bind:value={formData.tags}
                        placeholder="美女, 自拍, 时尚"
                    />
                </div>

                <div class="form-group checkbox">
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={formData.is_featured}
                        />
                        设为精选视频
                    </label>
                </div>

                <div class="modal-actions">
                    <button
                        type="button"
                        class="btn-secondary"
                        on:click={() => (showAddModal = false)}
                    >
                        取消
                    </button>
                    <button type="submit" class="btn-primary">
                        {editingVideo ? "保存" : "添加"}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    .admin-container {
        max-width: 1280px;
        margin: 0;
        padding: calc(var(--padding) * 2);
        min-height: 100vh;
        background: var(--background);
    }

    .admin-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: calc(var(--padding) * 2);
        padding-bottom: var(--padding);
        border-bottom: 1.5px solid var(--popup-stroke);
    }

    .admin-header h1 {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--text);
        margin: 0;
    }

    .header-actions {
        display: flex;
        gap: var(--padding);
        flex-wrap: wrap;
    }

    .filters {
        display: flex;
        gap: var(--padding);
        margin-bottom: calc(var(--padding) * 2);
        flex-wrap: wrap;
    }

    .filters select {
        padding: 10px 14px;
        border: none;
        border-radius: var(--border-radius);
        font-size: 0.85rem;
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
        cursor: pointer;
    }

    .filters select:hover {
        background: var(--button-hover);
    }

    .bulk-bar {
        max-width: 1100px;
        margin: 0 auto var(--padding) auto;
        padding: var(--padding);
        border-radius: var(--border-radius);
        background: var(--popup-bg);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--padding);
        flex-wrap: wrap;
    }

    .bulk-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: var(--text);
        user-select: none;
    }

    .bulk-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .bulk-count {
        color: var(--subtext);
        font-size: 0.9rem;
        white-space: nowrap;
    }

    .btn-bulk-delete {
        border: none;
        border-radius: var(--border-radius);
        padding: 10px 12px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        background: var(--red);
        color: var(--white);
    }

    .btn-bulk-delete:hover:not(:disabled) {
        opacity: 0.92;
    }

    .btn-bulk-delete:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .videos-list {
        display: flex;
        flex-direction: column;
        gap: var(--padding);
        max-width: 1100px;
        margin: 0 auto;
    }

    .video-item {
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        overflow: hidden;
        transition: all 0.2s;
    }

    .video-item:hover {
        box-shadow: 0 0 0 2px var(--popup-stroke) inset;
    }

    .video-item.selected {
        box-shadow: 0 0 0 2px var(--blue) inset;
    }

    .video-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: calc(var(--padding) * 1.5);
        gap: var(--padding);
    }

    .video-left {
        display: flex;
        align-items: center;
        gap: var(--padding);
        flex: 1;
        min-width: 0;
    }

    .video-select {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .video-select input {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .thumbnail-small {
        width: 120px;
        height: 68px;
        border-radius: 6px;
        overflow: hidden;
        background: var(--button);
        flex-shrink: 0;
        position: relative;
    }

    .thumbnail-small img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .no-thumbnail-small {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        color: var(--gray);
    }

    .duration-badge {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background: rgba(0, 0, 0, 0.8);
        color: var(--white);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 600;
    }

    .featured-star {
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 1rem;
        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
    }

    .video-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .title-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
    }

    .video-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--secondary);
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.4;
    }

    .meta-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 0.8rem;
    }

    .account-badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--button-elevated);
        color: var(--secondary);
    }

    .stat-item {
        color: var(--gray);
        font-size: 0.8rem;
        white-space: nowrap;
    }

    .tags-inline {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .tag-small {
        padding: 2px 6px;
        background: var(--button-elevated);
        border-radius: 4px;
        font-size: 0.7rem;
        color: var(--secondary);
        white-space: nowrap;
    }

    .video-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }

    .toggle-btn-small {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--button);
        box-shadow: var(--button-box-shadow);
    }

    .toggle-btn-small.active {
        background: var(--yellow);
        box-shadow: none;
    }

    .btn-icon {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--button);
        box-shadow: var(--button-box-shadow);
    }

    .btn-icon:hover {
        background: var(--button-hover);
    }

    .btn-icon:active {
        transform: scale(0.95);
    }

    .videos-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--padding);
    }

    .video-card {
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        overflow: hidden;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        transition: transform 0.2s;
        position: relative;
    }

    .video-card:hover {
        transform: translateY(-2px);
    }

    .featured-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        background: var(--yellow);
        color: #78350f;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 700;
        z-index: 10;
    }

    .video-thumbnail {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: var(--button);
    }

    .video-thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .no-thumbnail {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--gray);
        font-size: 0.85rem;
    }

    .duration {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.8);
        color: var(--white);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
    }

    .video-info {
        padding: var(--padding);
    }

    .video-info h3 {
        font-size: 0.95rem;
        font-weight: 600;
        margin: 0 0 4px 0;
        color: var(--text);
        line-height: 1.4;
    }

    .account-name {
        color: var(--subtext);
        font-size: 0.85rem;
        margin-bottom: 8px;
    }

    .description {
        font-size: 0.85rem;
        color: var(--subtext);
        margin-bottom: var(--padding);
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .stats {
        display: flex;
        gap: var(--padding);
        margin-bottom: var(--padding);
        font-size: 0.85rem;
        color: var(--gray);
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: var(--padding);
    }

    .tag {
        padding: 4px 8px;
        background: var(--button);
        border-radius: 6px;
        font-size: 0.75rem;
        color: var(--subtext);
    }

    .actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
    }

    .btn-primary,
    .btn-secondary,
    .btn-edit,
    .btn-delete,
    .btn-featured {
        padding: 10px 16px;
        border: none;
        border-radius: var(--border-radius);
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .btn-primary {
        background: var(--accent);
        color: var(--white);
    }

    .btn-primary:hover {
        background: var(--accent-hover);
    }

    .btn-secondary {
        background: var(--button);
        color: var(--text);
        box-shadow: var(--button-box-shadow);
    }

    .btn-secondary:hover {
        background: var(--button-hover);
    }

    .btn-featured {
        background: var(--yellow);
        color: #78350f;
        font-size: 0.75rem;
        padding: 8px 10px;
    }

    .btn-featured.active {
        background: var(--button);
        color: var(--subtext);
    }

    .btn-edit {
        background: var(--blue);
        color: var(--white);
        font-size: 0.75rem;
        padding: 8px 10px;
    }

    .btn-delete {
        background: var(--red);
        color: var(--white);
        font-size: 0.75rem;
        padding: 8px 10px;
    }

    .error-message {
        background: var(--red);
        color: var(--white);
        padding: var(--padding);
        border-radius: var(--border-radius);
        margin-bottom: var(--padding);
    }

    .message {
        background: rgba(0, 0, 0, 0.06);
        color: var(--text);
        padding: var(--padding);
        border-radius: var(--border-radius);
        margin-bottom: var(--padding);
        max-width: 1100px;
        margin-left: auto;
        margin-right: auto;
    }

    .loading {
        text-align: center;
        padding: calc(var(--padding) * 3);
        color: var(--subtext);
    }

    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        padding: calc(var(--padding) * 2);
        max-width: 600px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
    }

    .modal h2 {
        font-size: 1.4rem;
        font-weight: 700;
        margin: 0 0 calc(var(--padding) * 1.5) 0;
        color: var(--text);
    }

    .form-group {
        margin-bottom: var(--padding);
    }

    .form-group label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        font-size: 0.9rem;
        color: var(--text);
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: var(--border-radius);
        font-size: 0.9rem;
        background: var(--button);
        color: var(--text);
        box-sizing: border-box;
        box-shadow: var(--button-box-shadow);
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
        outline: none;
        background: var(--button-hover);
    }

    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: var(--padding);
    }

    .form-group.checkbox label {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .form-group.checkbox input {
        width: auto;
    }

    .modal-actions {
        display: flex;
        gap: var(--padding);
        margin-top: calc(var(--padding) * 1.5);
        justify-content: flex-end;
    }

    @media screen and (max-width: 768px) {
        .admin-container {
            padding: var(--padding);
        }

        .admin-header {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--padding);
        }

        .admin-header h1 {
            font-size: 1.4rem;
        }

        .header-actions {
            width: 100%;
        }

        .header-actions button {
            flex: 1;
            min-width: 100px;
        }

        .filters {
            flex-direction: column;
        }

        .filters select {
            width: 100%;
        }

        .video-main {
            flex-direction: column;
            align-items: stretch;
            padding: var(--padding);
        }

        .video-left {
            flex-direction: column;
            align-items: flex-start;
            gap: calc(var(--padding) / 2);
        }

        .thumbnail-small {
            width: 100%;
            height: auto;
            aspect-ratio: 16 / 9;
        }

        .video-info {
            width: 100%;
        }

        .meta-row {
            gap: 8px;
        }

        .video-actions {
            width: 100%;
            justify-content: flex-end;
            margin-top: calc(var(--padding) / 2);
        }

        .modal {
            width: 95%;
            padding: var(--padding);
        }

        .form-row {
            grid-template-columns: 1fr;
        }
    }
</style>
