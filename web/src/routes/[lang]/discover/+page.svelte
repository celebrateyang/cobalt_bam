<script lang="ts">
    import { t } from '$lib/i18n/translations';
    import { onMount } from 'svelte';
    import { videos, type GroupedVideos } from '$lib/api/social';
    
    let groupedVideos: GroupedVideos[] = [];
    let loading = true;
    let error = '';
    let selectedPlatform = 'tiktok';
    let copiedId: number | null = null;

    $: translate = (key: string, vars?: any) => $t(key, vars);
    
    $: platforms = [
        { value: 'all', label: $t('discover.filter.all'), icon: '🌐' },
        { value: 'tiktok', label: 'TikTok', icon: '🎵' },
        { value: 'instagram', label: 'Instagram', icon: '📷' },
        { value: 'youtube', label: 'YouTube', icon: '▶️' },
    ];
    
    onMount(() => {
        loadVideos();
    });
    
    async function loadVideos() {
        loading = true;
        error = '';
        
        const platform = selectedPlatform === 'all' ? undefined : selectedPlatform;
        const response = await videos.grouped(platform);
        
        loading = false;
        
        if (response.status === 'success' && response.data) {
            groupedVideos = response.data;
        } else {
            error = response.error?.message || $t('discover.status.error');
        }
    }
    
    function handlePlatformChange(platform: string) {
        selectedPlatform = platform;
        loadVideos();
    }
    
    async function copyUrl(url: string, videoId: number) {
        try {
            // 尝试使用现代 Clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
            } else {
                // 备用方案：使用 execCommand (适用于 HTTP 或旧浏览器)
                const textArea = document.createElement('textarea');
                textArea.value = url;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (!successful) {
                    throw new Error('execCommand failed');
                }
            }
            
            copiedId = videoId;
            setTimeout(() => {
                copiedId = null;
            }, 2000);
        } catch (err) {
            console.error('复制失败:', err);
            // 提供更友好的错误提示
            const message = $t('discover.action.manualCopy', { url } as any);
            if (confirm(message + '\n\n' + $t('discover.action.closeDialog'))) {
                // 用户关闭了对话框
            }
        }
    }
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
            <h1 class="title">{$t('discover.title')}</h1>
            <p class="subtitle">{$t('discover.subtitle')}</p>
        </div>
    </header>
    
    <div class="filter-bar">
        <div class="select-wrapper">
            <select 
                bind:value={selectedPlatform} 
                on:change={() => loadVideos()}
                class="platform-select"
            >
                {#each platforms as platform}
                    <option value={platform.value}>
                        {platform.icon} {platform.label}
                    </option>
                {/each}
            </select>
            <div class="select-arrow">▼</div>
        </div>
    </div>
    
    {#if error}
        <div class="error-banner">
            ⚠️ {error}
        </div>
    {/if}
    
    {#if loading}
        <div class="loading-container">
            <div class="spinner"></div>
            <p>{$t('discover.status.loading')}</p>
        </div>
    {:else if groupedVideos.length === 0}
        <div class="empty-state">
            <div class="empty-icon">📹</div>
            <h3>{$t('discover.status.empty.title')}</h3>
            <p>{$t('discover.status.empty.description')}</p>
        </div>
    {:else}
        <div class="content">
            {#each groupedVideos as group (group.account.id)}
                <div class="account-section">
                    <div class="account-header">
                        {#if group.account.avatar_url}
                            <img class="avatar" src={group.account.avatar_url} alt={group.account.name} />
                        {:else}
                            <div class="avatar-placeholder">
                                {group.account.name.charAt(0).toUpperCase()}
                            </div>
                        {/if}
                        <div class="account-info">
                            <h2 class="account-name">{group.account.name}</h2>
                            <p class="account-meta">
                                <span class="platform-badge">
                                    {#if group.account.platform === 'tiktok'}🎵
                                    {:else if group.account.platform === 'instagram'}📷
                                    {:else if group.account.platform === 'youtube'}▶️
                                    {:else}🌐{/if}
                                    {group.account.platform}
                                </span>
                                <span class="username">@{group.account.username}</span>
                                <span class="video-count">{translate('discover.account.videoCount', { count: group.videos.length })}</span>
                            </p>
                        </div>
                    </div>
                    
                    <div class="video-list">
                        {#each group.videos as video (video.id)}
                            <div class="video-item">
                                <div class="video-url">
                                    <span class="url-text">{video.url}</span>
                                </div>
                                <button
                                    class="copy-btn"
                                    class:copied={copiedId === video.id}
                                    on:click={() => copyUrl(video.url, video.id)}
                                    title={$t('discover.action.copyTitle')}
                                >
                                    {#if copiedId === video.id}
                                        {$t('discover.action.copied')}
                                    {:else}
                                        {$t('discover.action.copy')}
                                    {/if}
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
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
    }
    
    .header-content {
        display: block;
    }
    
    .title {
        font-size: 2rem;
        font-weight: 700;
        color: var(--button-text);
        margin: 0 0 0.5rem 0;
        line-height: 1.3;
    }
    
    .subtitle {
        font-size: 0.9rem;
        color: var(--gray);
        margin: 0;
        line-height: 1.5;
    }
    
    .filter-bar {
        display: flex;
        justify-content: center;
        margin-bottom: calc(var(--padding) * 2);
        width: 100%;
    }
    
    .select-wrapper {
        position: relative;
        display: inline-block;
        width: 200px;
    }

    .platform-select {
        width: 100%;
        padding: 12px 40px 12px 16px;
        appearance: none;
        -webkit-appearance: none;
        background: var(--button);
        color: var(--button-text);
        border: none;
        border-radius: var(--border-radius);
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        box-shadow: var(--button-box-shadow);
        transition: all 0.2s;
    }

    .platform-select:hover {
        background: var(--button-hover);
    }

    .platform-select:focus {
        outline: none;
        box-shadow: 0 0 0 2px var(--secondary);
    }

    .select-arrow {
        position: absolute;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--gray);
        font-size: 0.8rem;
    }
    
    .error-banner {
        background: var(--red);
        color: var(--white);
        padding: var(--padding);
        border-radius: var(--border-radius);
        margin-bottom: var(--padding);
        text-align: center;
        font-weight: 500;
        max-width: 640px;
        margin-left: auto;
        margin-right: auto;
    }
    
    .loading-container, .empty-state {
        text-align: center;
        padding: calc(var(--padding) * 4) var(--padding);
        color: var(--gray);
    }
    
    .spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--button-stroke);
        border-top-color: var(--secondary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto var(--padding);
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .empty-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
    }
    
    .content {
        max-width: 900px;
        width: 100%;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: calc(var(--padding) * 1.5);
    }
    
    .account-section {
        background: var(--popup-bg);
        border-radius: var(--border-radius);
        overflow: hidden;
        box-shadow: 0 0 0 1.5px var(--popup-stroke) inset;
    }
    
    .account-header {
        display: flex;
        align-items: center;
        gap: var(--padding);
        padding: calc(var(--padding) * 1.5);
        background: var(--button);
        border-bottom: 1px solid var(--popup-stroke);
    }
    
    .avatar, .avatar-placeholder {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
    }
    
    .avatar-placeholder {
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
    }
    
    .account-name {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--secondary);
        margin: 0 0 4px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .account-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.85rem;
        color: var(--gray);
        margin: 0;
    }
    
    .platform-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        background: var(--button-elevated);
        color: var(--secondary);
        border-radius: 6px;
        font-weight: 600;
        text-transform: capitalize;
        font-size: 0.8rem;
    }
    
    .username {
        color: var(--gray);
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .video-count {
        color: var(--gray);
        font-weight: 400;
    }
    
    .video-list {
        padding: calc(var(--padding) * 1.5);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .video-item {
        display: flex;
        align-items: center;
        gap: var(--padding);
        padding: var(--padding);
        background: var(--button);
        border-radius: var(--border-radius);
        transition: all 0.2s ease;
        box-shadow: var(--button-box-shadow);
    }
    
    .video-item:hover {
        background: var(--button-hover);
    }
    
    .video-url {
        flex: 1;
        min-width: 0;
    }
    
    .url-text {
        display: block;
        font-family: "IBM Plex Mono", monospace;
        font-size: 0.85rem;
        color: var(--secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .copy-btn {
        padding: 8px 16px;
        background: var(--button-elevated);
        color: var(--button-text);
        border: none;
        border-radius: var(--border-radius);
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        white-space: nowrap;
        transition: all 0.2s ease;
        flex-shrink: 0;
        box-shadow: var(--button-box-shadow);
    }
    
    .copy-btn:hover {
        background: var(--button-hover);
    }
    
    .copy-btn:active {
        transform: scale(0.98);
    }
    
    .copy-btn.copied {
        background: var(--green);
        color: var(--white);
        box-shadow: none;
    }
    
    @media screen and (max-width: 535px) {
        .discover-container {
            padding: var(--padding);
            padding-top: calc(var(--padding) * 2);
        }
        
        .header {
            padding: var(--padding) 0;
            margin-bottom: var(--padding);
        }
        
        .title {
            font-size: 1.5rem;
        }
        
        .subtitle {
            font-size: 0.85rem;
        }
        
        .filter-bar {
            margin-bottom: var(--padding);
        }
        
        .content {
            gap: var(--padding);
        }
        
        .account-header {
            padding: var(--padding);
        }
        
        .avatar, .avatar-placeholder {
            width: 40px;
            height: 40px;
        }
        
        .account-name {
            font-size: 1rem;
        }
        
        .account-meta {
            font-size: 0.75rem;
            gap: 6px;
        }
        
        .platform-badge {
            font-size: 0.7rem;
            padding: 2px 6px;
        }
        
        .video-list {
            padding: var(--padding);
        }
        
        .video-item {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
            padding: 10px;
        }
        
        .url-text {
            font-size: 0.75rem;
        }
        
        .copy-btn {
            width: 100%;
            padding: 10px;
        }
        
        .loading-container, .empty-state {
            padding: calc(var(--padding) * 2) var(--padding);
        }
        
        .spinner {
            width: 40px;
            height: 40px;
        }
        
        .empty-icon {
            font-size: 3rem;
        }
    }
</style>
