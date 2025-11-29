<script lang="ts">
    import { t } from '$lib/i18n/translations';
    import { historyStore, removeFromHistory, clearHistory, type HistoryItem } from '$lib/history';
    import { goto } from '$app/navigation';
    
    import IconTrash from '@tabler/icons-svelte/IconTrash.svelte';
    import IconCopy from '@tabler/icons-svelte/IconCopy.svelte';
    import IconDownload from '@tabler/icons-svelte/IconDownload.svelte';
    import IconHistory from '@tabler/icons-svelte/IconHistory.svelte';

    let historyItems: HistoryItem[] = [];

    $: historyItems = $historyStore;

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleDownload = (url: string) => {
        goto(`/?u=${encodeURIComponent(url)}`);
    };

    const handleClear = () => {
        if (confirm($t('history.clear') + '?')) {
            clearHistory();
        }
    };
</script>

<svelte:head>
    <title>{$t('history.title')} - Cobalt</title>
    <meta name="description" content={$t('history.title')} />
</svelte:head>

<div class="history-container">
    <header class="header">
        <div class="header-content">
            <h1>
                <IconHistory size={32} />
                <span>{$t('history.title')}</span>
            </h1>
            {#if historyItems.length > 0}
                <button class="button clear-btn" on:click={handleClear}>
                    <IconTrash size={18} />
                    <span>{$t('history.clear')}</span>
                </button>
            {/if}
        </div>
    </header>

    <div class="history-list">
        {#if historyItems.length === 0}
            <div class="empty-state">
                <p>{$t('history.empty')}</p>
            </div>
        {:else}
            {#each historyItems as item (item.id)}
                <div class="history-item">
                    <div class="item-info">
                        <div class="item-title" title={item.title}>{item.title || item.url}</div>
                        <div class="item-meta">
                            <span class="item-date">{new Date(item.timestamp).toLocaleString()}</span>
                            <span class="item-url">{item.url}</span>
                        </div>
                    </div>
                    <div class="item-actions">
                        <button class="action-btn" on:click={() => handleCopy(item.url)} title={$t('history.copy')}>
                            <IconCopy size={20} />
                        </button>
                        <button class="action-btn primary" on:click={() => handleDownload(item.url)} title={$t('history.download_again')}>
                            <IconDownload size={20} />
                        </button>
                        <button class="action-btn danger" on:click={() => removeFromHistory(item.id)} title={$t('history.remove')}>
                            <IconTrash size={20} />
                        </button>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<style>
    .history-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem 1rem;
        width: 100%;
        height: 100%;
        overflow-y: auto;
    }

    .header {
        margin-bottom: 2rem;
    }

    .header-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    h1 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        font-size: 1.5rem;
    }

    .button {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        border: none;
        cursor: pointer;
        font-weight: 500;
        transition: background 0.2s;
    }

    .clear-btn {
        background: var(--surface-2);
        color: var(--text);
    }

    .clear-btn:hover {
        background: var(--surface-3);
    }

    .history-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding-bottom: 2rem;
    }

    .history-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem;
        background: var(--surface-1);
        border-radius: var(--border-radius);
        gap: 1rem;
    }

    .item-info {
        flex: 1;
        min-width: 0;
    }

    .item-title {
        font-weight: 600;
        margin-bottom: 0.25rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .item-meta {
        display: flex;
        gap: 1rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
    }

    .item-url {
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
    }

    .item-actions {
        display: flex;
        gap: 0.5rem;
    }

    .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: none;
        background: var(--surface-2);
        color: var(--text);
        cursor: pointer;
        transition: all 0.2s;
    }

    .action-btn:hover {
        background: var(--surface-3);
        transform: translateY(-1px);
    }

    .action-btn.primary {
        background: var(--accent);
        color: white;
    }

    .action-btn.danger:hover {
        background: var(--red);
        color: white;
    }

    .empty-state {
        text-align: center;
        padding: 3rem;
        color: var(--text-secondary);
        background: var(--surface-1);
        border-radius: var(--border-radius);
    }

    @media (max-width: 600px) {
        .history-item {
            flex-direction: column;
            align-items: flex-start;
        }
        
        .item-actions {
            width: 100%;
            justify-content: flex-end;
            margin-top: 0.5rem;
        }
        
        .item-url {
            display: none;
        }
    }
</style>