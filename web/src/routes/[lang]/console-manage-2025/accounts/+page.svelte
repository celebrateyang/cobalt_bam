<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { auth, accounts, type SocialAccount } from "$lib/api/social";
    import { currentApiURL } from "$lib/api/api-url";

    let accountList: SocialAccount[] = [];
    let loading = true;
    let error = "";
    let showAddModal = false;
    let editingAccount: SocialAccount | null = null;
    let syncingUsers = false;
    let syncMessage = "";
    let syncingAccountId: number | null = null;
    let socialSyncMessage = "";
    $: lang = $page.params.lang;

    // 表单数据
    let formData = {
        platform: "tiktok",
        username: "",
        display_name: "",
        avatar_url: "",
        profile_url: "",
        description: "",
        follower_count: 0,
        category: "beauty",
        tags: "",
        priority: 5,
        is_active: true,
        sync_enabled: true,
    };

    onMount(async () => {
        // 验证登录状态
        const verified = await auth.verify();
        if (verified.status !== "success") {
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        await loadAccounts();
    });

    async function loadAccounts() {
        loading = true;
        error = "";
        try {
            const response = await accounts.list();
            if (response.status === "success" && response.data) {
                accountList = response.data.accounts || [];
            } else {
                accountList = [];
                error = response.error?.message || "加载失败";
            }
        } catch (e) {
            accountList = [];
            error = "网络错误";
        } finally {
            loading = false;
        }
    }

    async function syncClerkUsers() {
        const token = typeof window !== "undefined"
            ? window.localStorage.getItem("admin_token")
            : null;

        if (!token) {
            error = "请先登录";
            goto(`/${lang}/console-manage-2025`);
            return;
        }

        syncingUsers = true;
        syncMessage = "";
        try {
            const res = await fetch(`${currentApiURL()}/user/admin/sync-all`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await res.json();
            if (!res.ok || data.status !== "success") {
                throw new Error(data?.error?.message || "同步失败");
            }

            syncMessage = `同步成功：${data.data?.synced ?? 0} 条`;
        } catch (e) {
            syncMessage = e instanceof Error ? e.message : "同步失败";
        } finally {
            syncingUsers = false;
        }
    }

    function openAddModal() {
        editingAccount = null;
        formData = {
            platform: "tiktok",
            username: "",
            display_name: "",
            avatar_url: "",
            profile_url: "",
            description: "",
            follower_count: 0,
            category: "beauty",
            tags: "",
            priority: 5,
            is_active: true,
            sync_enabled: true,
        };
        showAddModal = true;
    }

    function openEditModal(account: SocialAccount) {
        editingAccount = account;
        formData = {
            platform: account.platform,
            username: account.username,
            display_name: account.display_name || "",
            avatar_url: account.avatar_url || "",
            profile_url: account.profile_url || "",
            description: account.description || "",
            follower_count: account.follower_count,
            category: account.category,
            tags: account.tags.join(", "),
            priority: account.priority,
            is_active: account.is_active,
            sync_enabled: Boolean(account.sync_enabled),
        };
        showAddModal = true;
    }

    const formatDateTime = (value?: number | null) => {
        if (!value) return "";
        try {
            return new Date(value).toLocaleString();
        } catch {
            return "";
        }
    };

    async function syncSocialAccount(id: number) {
        syncingAccountId = id;
        socialSyncMessage = "";

        try {
            const response = await accounts.sync(id);
            if (response.status !== "success" || !response.data) {
                throw new Error(response.error?.message || "同步失败");
            }

            const { total, created, updated } = response.data;
            socialSyncMessage = `同步成功：${total}（新增 ${created}，更新 ${updated}）`;
            await loadAccounts();
        } catch (e) {
            socialSyncMessage = e instanceof Error ? e.message : "同步失败";
        } finally {
            syncingAccountId = null;
        }
    }

    async function handleSubmit() {
        try {
            console.log("Submitting account:", formData);
            const data = {
                ...formData,
                tags: formData.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter((t) => t),
            };

            let response;
            if (editingAccount) {
                response = await accounts.update(editingAccount.id, data);
            } else {
                console.log("Creating new account:", data);
                response = await accounts.create(data);
                console.log("Create response:", response);
            }

            if (response.status === "success") {
                showAddModal = false;
                await loadAccounts();

                const accountId = editingAccount ? editingAccount.id : response.data?.id;
                const shouldAutoSync =
                    Boolean(formData.sync_enabled) &&
                    (!editingAccount || !editingAccount.sync_enabled);

                if (shouldAutoSync && typeof accountId === "number") {
                    await syncSocialAccount(accountId);
                }
            } else {
                console.error("Account operation failed:", response);
                error = response.error?.message || "操作失败";
            }
        } catch (e) {
            console.error("Exception in handleSubmit:", e);
            error = "网络错误";
        }
    }

    async function handleDelete(id: number) {
        if (!confirm("确定要删除这个账号吗？")) return;

        try {
            const response = await accounts.delete(id);
            if (response.status === "success") {
                await loadAccounts();
            } else {
                error = response.error?.message || "删除失败";
            }
        } catch (e) {
            error = "网络错误";
        }
    }

    async function handleToggleActive(account: SocialAccount) {
        try {
            const response = await accounts.update(account.id, {
                is_active: !account.is_active,
            });
            if (response.status === "success") {
                await loadAccounts();
            }
        } catch (e) {
            error = "操作失败";
        }
    }
</script>

<div class="admin-container">
    <header class="admin-header">
        <h1>账号管理</h1>
        <div class="header-actions">
            <button class="btn-primary" on:click={openAddModal}
                >+ 添加账号</button
            >
            <button
                class="btn-secondary"
                on:click={syncClerkUsers}
                disabled={syncingUsers}
                >{syncingUsers ? "同步中..." : "同步 Clerk 用户"}</button
            >
            {#if syncMessage}
                <span class="sync-status">{syncMessage}</span>
            {/if}
            {#if socialSyncMessage}
                <span class="sync-status">{socialSyncMessage}</span>
            {/if}
        </div>
    </header>

    {#if error}
        <div class="error-message">{error}</div>
    {/if}

    {#if loading}
        <div class="loading">加载中...</div>
    {:else}
        <div class="accounts-list">
            {#each accountList as account}
                <div class="account-item">
                    <div class="account-main">
                        <div class="account-left">
                            {#if account.avatar_url}
                                <img
                                    src={account.avatar_url}
                                    alt={account.username}
                                    class="avatar-small"
                                />
                            {:else}
                                <div class="avatar-placeholder-small">
                                    {(account.display_name || account.username)
                                        .charAt(0)
                                        .toUpperCase()}
                                </div>
                            {/if}

                            <div class="account-info">
                                <div class="name-row">
                                    <h3 class="account-name">
                                        {account.display_name ||
                                            account.username}
                                    </h3>
                                    <span class="username-text"
                                        >@{account.username}</span
                                    >
                                </div>
                                <div class="meta-row">
                                    <span
                                        class="platform-badge-small"
                                        class:tiktok={account.platform ===
                                            "tiktok"}
                                        class:instagram={account.platform ===
                                            "instagram"}
                                        class:youtube={account.platform ===
                                            "youtube"}
                                    >
                                        {#if account.platform === "tiktok"}🎵
                                        {:else if account.platform === "instagram"}📷
                                        {:else if account.platform === "youtube"}▶️
                                        {:else}🌐{/if}
                                        {account.platform}
                                    </span>
                                    <span class="stat-item"
                                        >👥 {account.follower_count.toLocaleString()}</span
                                    >
                                    <span class="stat-item"
                                        >🎬 {account.video_count || 0}</span
                                    >
                                    <span class="stat-item"
                                        >⭐ {account.priority}</span
                                    >
                                </div>
                                {#if account.tags.length > 0}
                                    <div class="tags-inline">
                                        {#each account.tags as tag}
                                            <span class="tag-small">{tag}</span>
                                        {/each}
                                    </div>
                                {/if}
                                {#if account.sync_enabled || account.sync_last_run_at || account.sync_error}
                                    <div class="sync-inline">
                                        {#if account.sync_enabled}
                                            <span class="sync-badge">AUTO SYNC</span>
                                        {/if}
                                        {#if account.sync_last_run_at}
                                            <span class="sync-meta"
                                                >上次同步：{formatDateTime(account.sync_last_run_at)}</span
                                            >
                                        {/if}
                                        {#if account.sync_error}
                                            <span class="sync-error" title={account.sync_error}
                                                >同步失败</span
                                            >
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <div class="account-actions">
                            <button
                                class="btn-icon btn-sync"
                                disabled={syncingAccountId === account.id}
                                on:click={() => syncSocialAccount(account.id)}
                                title="同步最近内容"
                            >
                                🔄
                            </button>
                            <button
                                class="toggle-btn-small"
                                class:active={account.is_active}
                                on:click={() => handleToggleActive(account)}
                                title={account.is_active
                                    ? "点击禁用"
                                    : "点击启用"}
                            >
                                {account.is_active ? "✓" : "✗"}
                            </button>
                            <button
                                class="btn-icon btn-edit"
                                on:click={() => openEditModal(account)}
                                title="编辑"
                            >
                                ✏️
                            </button>
                            <button
                                class="btn-icon btn-delete"
                                on:click={() => handleDelete(account.id)}
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
            <h2>{editingAccount ? "编辑账号" : "添加账号"}</h2>

            <form on:submit|preventDefault={handleSubmit}>
                <div class="form-group">
                    <label>平台</label>
                    <select bind:value={formData.platform} required>
                        <option value="tiktok">TikTok</option>
                        <option value="instagram">Instagram</option>
                        <option value="youtube">YouTube</option>
                        <option value="other">其他</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>用户名 *</label>
                    <input
                        type="text"
                        bind:value={formData.username}
                        required
                    />
                </div>

                <div class="form-group">
                    <label>显示名称</label>
                    <input type="text" bind:value={formData.display_name} />
                </div>

                <div class="form-group">
                    <label>头像 URL</label>
                    <input type="url" bind:value={formData.avatar_url} />
                </div>

                <div class="form-group">
                    <label>主页 URL</label>
                    <input type="url" bind:value={formData.profile_url} />
                </div>

                <div class="form-group">
                    <label>简介</label>
                    <textarea bind:value={formData.description} rows="3"
                    ></textarea>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>粉丝数</label>
                        <input
                            type="number"
                            bind:value={formData.follower_count}
                            min="0"
                        />
                    </div>

                    <div class="form-group">
                        <label>优先级 (1-10)</label>
                        <input
                            type="number"
                            bind:value={formData.priority}
                            min="1"
                            max="10"
                        />
                    </div>
                </div>

                <div class="form-group">
                    <label>分类</label>
                    <select bind:value={formData.category}>
                        <option value="beauty">美女</option>
                        <option value="dance">舞蹈</option>
                        <option value="fashion">时尚</option>
                        <option value="lifestyle">生活</option>
                        <option value="other">其他</option>
                    </select>
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
                            bind:checked={formData.is_active}
                        />
                        启用此账号
                    </label>
                </div>

                <div class="form-group checkbox">
                    <label>
                        <input
                            type="checkbox"
                            bind:checked={formData.sync_enabled}
                        />
                        自动同步（最近 5 条 + 置顶）
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
                        {editingAccount ? "保存" : "添加"}
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
        align-items: center;
    }

    .sync-status {
        font-size: 0.9rem;
        color: var(--secondary);
        white-space: nowrap;
    }

    .sync-inline {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin-top: 8px;
        font-size: 0.8rem;
        color: var(--subtext);
    }

    .sync-badge {
        padding: 3px 10px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.06);
        color: var(--text);
        font-weight: 700;
        letter-spacing: 0.2px;
    }

    .sync-meta {
        opacity: 0.85;
    }

    .sync-error {
        color: var(--red);
        font-weight: 600;
    }

    .accounts-list {
        display: flex;
        flex-direction: column;
        gap: var(--padding);
        max-width: 1100px;
        margin: 0 auto;
    }

    .account-item {
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        overflow: hidden;
        transition: all 0.2s;
    }

    .account-item:hover {
        box-shadow: 0 0 0 2px var(--popup-stroke) inset;
    }

    .account-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: calc(var(--padding) * 1.5);
        gap: var(--padding);
    }

    .account-left {
        display: flex;
        align-items: center;
        gap: var(--padding);
        flex: 1;
        min-width: 0;
    }

    .avatar-small,
    .avatar-placeholder-small {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
    }

    .avatar-placeholder-small {
        background: var(--secondary);
        color: var(--primary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        font-weight: 600;
    }

    .account-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .name-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
    }

    .account-name {
        font-size: 1rem;
        font-weight: 600;
        color: var(--secondary);
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .username-text {
        font-size: 0.85rem;
        color: var(--gray);
        font-weight: 500;
    }

    .meta-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 0.8rem;
    }

    .platform-badge-small {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--white);
        text-transform: capitalize;
    }

    .platform-badge-small.tiktok {
        background: #000;
    }
    .platform-badge-small.instagram {
        background: linear-gradient(45deg, #f09433, #e6683c, #dc2743);
    }
    .platform-badge-small.youtube {
        background: #ff0000;
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

    .account-actions {
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
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .toggle-btn-small.active {
        background: var(--green);
        color: var(--white);
    }

    .toggle-btn-small:not(.active) {
        background: var(--red);
        color: var(--white);
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

    .btn-icon:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .btn-sync {
        background: var(--accent);
        color: var(--white);
    }

    .btn-sync:hover:not(:disabled) {
        background: var(--accent-hover);
    }

    .accounts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--padding);
    }

    .account-card {
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        padding: var(--padding);
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
        transition: transform 0.2s;
    }

    .account-card:hover {
        transform: translateY(-2px);
    }

    .account-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--padding);
    }

    .platform-badge {
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--white);
    }

    .platform-badge.tiktok {
        background: #000;
    }
    .platform-badge.instagram {
        background: linear-gradient(
            45deg,
            #f09433,
            #e6683c,
            #dc2743,
            #cc2366,
            #bc1888
        );
    }
    .platform-badge.youtube {
        background: #ff0000;
    }

    .toggle-btn {
        padding: 4px 10px;
        border-radius: 6px;
        border: none;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .toggle-btn.active {
        background: var(--green);
        color: var(--white);
    }

    .toggle-btn:not(.active) {
        background: var(--red);
        color: var(--white);
    }

    .avatar {
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: var(--border-radius);
        margin-bottom: var(--padding);
    }

    .account-card h3 {
        font-size: 1.15rem;
        font-weight: 600;
        margin: 0 0 4px 0;
        color: var(--text);
    }

    .username {
        color: var(--subtext);
        font-size: 0.85rem;
        margin-bottom: 8px;
    }

    .description {
        font-size: 0.85rem;
        color: var(--subtext);
        margin-bottom: var(--padding);
        line-height: 1.5;
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
        display: flex;
        gap: 8px;
    }

    .btn-primary,
    .btn-secondary,
    .btn-edit,
    .btn-delete {
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

    .btn-edit {
        flex: 1;
        background: var(--blue);
        color: var(--white);
    }

    .btn-edit:hover {
        opacity: 0.9;
    }

    .btn-delete {
        flex: 1;
        background: var(--red);
        color: var(--white);
    }

    .btn-delete:hover {
        opacity: 0.9;
    }

    .error-message {
        background: var(--red);
        color: var(--white);
        padding: var(--padding);
        border-radius: var(--border-radius);
        margin-bottom: var(--padding);
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
        grid-template-columns: 1fr 1fr;
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
            flex-wrap: wrap;
        }

        .header-actions button {
            flex: 1;
            min-width: 120px;
        }

        .account-main {
            flex-direction: column;
            align-items: stretch;
            padding: var(--padding);
        }

        .account-left {
            flex-direction: column;
            align-items: flex-start;
            gap: calc(var(--padding) / 2);
        }

        .avatar-small,
        .avatar-placeholder-small {
            width: 40px;
            height: 40px;
        }

        .account-info {
            width: 100%;
        }

        .name-row {
            flex-direction: column;
            gap: 4px;
        }

        .meta-row {
            gap: 8px;
        }

        .stat-item {
            font-size: 0.75rem;
        }

        .account-actions {
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
