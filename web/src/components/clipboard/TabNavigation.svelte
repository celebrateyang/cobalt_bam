<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { t } from '$lib/i18n/translations';
    
    export let activeTab: 'files' | 'text';
    
    const dispatch = createEventDispatcher<{
        tabChange: 'files' | 'text'
    }>();
</script>

<div class="tab-navigation">
    <button 
        class="tab-button" 
        class:active={activeTab === 'files'}
        on:click={() => dispatch('tabChange', 'files')}
    >
        📁 {$t('clipboard.file_transfer.title')}
    </button>
    <button 
        class="tab-button" 
        class:active={activeTab === 'text'}
        on:click={() => dispatch('tabChange', 'text')}
    >
        📝 {$t('clipboard.send_text')}
    </button>
</div>

<style>    .tab-navigation {
        display: flex;        gap: 0.5rem;
        margin-bottom: 0.5rem;
        padding: 0.3rem;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        max-width: fit-content;
        margin: 0 auto 0.5rem auto;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }    .tab-button {
        padding: 0.75rem 1.5rem;
        border: none;
        background: transparent;
        color: var(--subtext);
        border-radius: 12px;
        cursor: pointer;
        font-size: 0.95rem;
        font-weight: 600;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        position: relative;
        overflow: hidden;
        min-width: 120px;
        justify-content: center;
    }

    .tab-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        transition: left 0.5s ease;
    }

    .tab-button:hover::before {
        left: 100%;
    }

    .tab-button:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text);
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }

    .tab-button.active {
        background: linear-gradient(135deg, var(--accent), var(--accent-hover));
        color: white;
        cursor: default;
        box-shadow: 0 4px 20px rgba(var(--accent-rgb), 0.3);
        transform: translateY(-1px);
    }

    .tab-button.active:hover {
        background: linear-gradient(135deg, var(--accent), var(--accent-hover));
        color: white;
        transform: translateY(-1px);
    }

    .tab-button.active::before {
        display: none;
    }    @media (max-width: 768px) {
        .tab-navigation {
            width: 100%;
            max-width: none;
            margin: 0 0 1rem 0;
            padding: 0.25rem;
        }
        
        .tab-button {
            flex: 1;
            justify-content: center;
            padding: 0.75rem;
            font-size: 0.85rem;
            min-width: auto;
        }
    }

    @media (max-width: 480px) {
        .tab-button {
            padding: 0.8rem 0.5rem;
            font-size: 0.85rem;
            gap: 0.5rem;
        }
    }
</style>
