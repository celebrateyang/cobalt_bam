<script lang="ts">
    import { createEventDispatcher, onMount, tick } from 'svelte';
    import SettingsCategory from '$components/settings/SettingsCategory.svelte';
    import { t } from '$lib/i18n/translations';
    import type { ClipboardMessage } from '$lib/clipboard/clipboard-manager';

    const dispatch = createEventDispatcher<{
        sendText: { text: string; ephemeral: boolean };
        retryText: { messageId: string };
        revealText: { messageId: string };
    }>();

    export let textContent: string;
    export let messages: ClipboardMessage[];
    export let peerConnected: boolean;
    export let peerSupportsEphemeral = false;
    export let burnAfterRead = false;
    let now = Date.now();
    $: visibleMessages = messages.filter(message => message.expiresAt === undefined || message.expiresAt > now);

    let messageListElement: HTMLDivElement | null = null;
    let previousMessageCount = 0;
    let copiedMessageId = '';
    let showNewMessageButton = false;
    let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

    $: latestOutgoingMessage = [...messages].reverse().find(message => message.direction === 'outgoing');
    $: statusAnnouncement = latestOutgoingMessage ? getStatusLabel(latestOutgoingMessage) : '';

    $: if (messages.length !== previousMessageCount) {
        const previousCount = previousMessageCount;
        previousMessageCount = messages.length;
        void handleMessageCountChange(previousCount);
    }

    onMount(() => {
        const updateClock = () => { now = Date.now(); };
        const clockTimer = setInterval(updateClock, 250);
        document.addEventListener('visibilitychange', updateClock);
        window.addEventListener('pageshow', updateClock);
        previousMessageCount = messages.length;
        void scrollToLatest('auto');

        return () => {
            clearInterval(clockTimer);
            document.removeEventListener('visibilitychange', updateClock);
            window.removeEventListener('pageshow', updateClock);
            if (copyResetTimer) clearTimeout(copyResetTimer);
        };
    });

    async function handleMessageCountChange(previousCount: number): Promise<void> {
        if (typeof window === 'undefined' || messages.length <= previousCount) return;

        const latestMessage = messages[messages.length - 1];
        const shouldScroll = previousCount === 0
            || latestMessage?.direction === 'outgoing'
            || isNearBottom();

        await tick();
        if (shouldScroll) {
            await scrollToLatest(previousCount === 0 ? 'auto' : 'smooth');
        } else if (latestMessage?.direction === 'incoming') {
            showNewMessageButton = true;
        }
    }

    function isNearBottom(): boolean {
        if (!messageListElement) return true;
        const distance = messageListElement.scrollHeight
            - messageListElement.scrollTop
            - messageListElement.clientHeight;
        return distance < 72;
    }

    async function scrollToLatest(behavior: ScrollBehavior = 'smooth'): Promise<void> {
        await tick();
        if (!messageListElement) return;
        messageListElement.scrollTo({ top: messageListElement.scrollHeight, behavior });
        showNewMessageButton = false;
    }

    function handleListScroll(): void {
        if (isNearBottom()) showNewMessageButton = false;
    }

    function sendText(): void {
        const text = textContent.trim();
        if (!text || !peerConnected || (burnAfterRead && !peerSupportsEphemeral)) return;

        dispatch('sendText', { text, ephemeral: burnAfterRead });
        textContent = '';
    }

    function handleComposerKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        sendText();
    }

    function retryText(messageId: string): void {
        if (!peerConnected) return;
        dispatch('retryText', { messageId });
    }

    async function copyMessage(message: ClipboardMessage): Promise<void> {
        if (message.ephemeral) return;
        try {
            await navigator.clipboard.writeText(message.text);
            copiedMessageId = message.id;
            if (copyResetTimer) clearTimeout(copyResetTimer);
            copyResetTimer = setTimeout(() => {
                copiedMessageId = '';
            }, 1800);
        } catch (error) {
            console.warn('Unable to copy clipboard message:', error);
        }
    }

    function formatTime(timestamp: number): string {
        return new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
        }).format(timestamp);
    }

    function getStatusLabel(message: ClipboardMessage): string {
        switch (message.status) {
            case 'sending': return t.get('clipboard.chat.sending');
            case 'delivered': return t.get('clipboard.chat.delivered');
            case 'unconfirmed': return t.get('clipboard.chat.unconfirmed');
            case 'failed': return t.get('clipboard.chat.failed');
        }
    }
</script>

<SettingsCategory title={$t('clipboard.chat.conversation')} sectionId="text-sharing">
    <div class="chat-shell">
        <div class="privacy-note">
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>{$t('clipboard.chat.storage_notice')}</span>
        </div>

        <div class="message-area">
            <div
                class="message-list"
                bind:this={messageListElement}
                on:scroll={handleListScroll}
                role="log"
                aria-label={$t('clipboard.chat.conversation')}
                aria-live="polite"
            >
                {#if visibleMessages.length === 0}
                    <div class="empty-state">
                        <div class="empty-icon" aria-hidden="true">
                            <svg width="38" height="38" viewBox="0 0 24 24">
                                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                            </svg>
                        </div>
                        <strong>{$t('clipboard.chat.empty_title')}</strong>
                        <span>{$t('clipboard.chat.empty_hint')}</span>
                    </div>
                {:else}
                    {#each visibleMessages as message (message.id)}
                        <div class:outgoing={message.direction === 'outgoing'} class="message-row">
                            <div class="message-group">
                                <div class="message-bubble">
                                    {#if message.ephemeral && message.direction === 'incoming' && message.expiresAt === undefined}
                                        <button type="button" class="reveal-button" disabled={!peerConnected}
                                            on:click={() => dispatch('revealText', { messageId: message.id })}>
                                            {$t('clipboard.chat.burn_reveal')}
                                        </button>
                                    {:else}
                                        <div class="message-text">{message.text}</div>
                                    {/if}
                                </div>
                                <div class="message-meta">
                                    {#if !message.ephemeral}
                                    <button
                                        type="button"
                                        class="copy-button"
                                        on:click={() => copyMessage(message)}
                                        aria-label={$t('clipboard.chat.copy_message')}
                                    >
                                        {copiedMessageId === message.id
                                            ? $t('clipboard.chat.copied')
                                            : $t('clipboard.copy')}
                                    </button>
                                    {/if}
                                    <span>{formatTime(message.createdAt)}</span>
                                    {#if message.ephemeral}
                                        <span class="burn-status">
                                            {message.expiresAt === undefined
                                                ? $t('clipboard.chat.burn_waiting')
                                                : $t('clipboard.chat.burn_countdown', { count: Math.max(0, Math.ceil((message.expiresAt - now) / 1000)) })}
                                        </span>
                                    {/if}
                                    {#if message.direction === 'outgoing'}
                                        <span class:warning={message.status === 'unconfirmed'} class:error={message.status === 'failed'} class="delivery-status">
                                            {#if message.status === 'sending'}
                                                <span class="status-spinner" aria-hidden="true"></span>
                                            {:else if message.status === 'delivered'}
                                                <span aria-hidden="true">✓</span>
                                            {/if}
                                            {getStatusLabel(message)}
                                        </span>
                                        {#if message.expiresAt === undefined && (message.status === 'unconfirmed' || message.status === 'failed')}
                                            <button
                                                type="button"
                                                class="retry-button"
                                                disabled={!peerConnected}
                                                on:click={() => retryText(message.id)}
                                            >
                                                {$t('clipboard.chat.retry')}
                                            </button>
                                        {/if}
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>

            {#if showNewMessageButton}
                <button type="button" class="new-message-button" on:click={() => scrollToLatest()}>
                    ↓ {$t('clipboard.chat.new_messages')}
                </button>
            {/if}
        </div>

        {#if !peerConnected}
            <div class="offline-notice" role="status">{$t('clipboard.chat.peer_offline')}</div>
        {/if}

        <div class="composer">
            <label class="burn-option">
                <input type="checkbox" bind:checked={burnAfterRead} />
                <span>{$t('clipboard.chat.burn_option')}</span>
            </label>
            {#if burnAfterRead}
                <p class="burn-help">{$t('clipboard.chat.burn_hint')}</p>
                {#if !peerSupportsEphemeral}
                    <p class="burn-help" role="status">{$t('clipboard.chat.burn_unavailable')}</p>
                {/if}
            {/if}
            <textarea
                class="text-input"
                bind:value={textContent}
                placeholder={$t('clipboard.chat.placeholder')}
                rows="3"
                maxlength="100000"
                disabled={!peerConnected}
                on:keydown={handleComposerKeydown}
            ></textarea>
            <div class="composer-footer">
                <span class="send-hint">{$t('clipboard.chat.send_hint')}</span>
                <button
                    type="button"
                    class="send-button"
                    disabled={!peerConnected || !textContent.trim() || (burnAfterRead && !peerSupportsEphemeral)}
                    on:click={sendText}
                >
                    <span>{$t('clipboard.chat.send_message')}</span>
                    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m4 4 17 8-17 8 3-8zm3 8h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</SettingsCategory>

<span class="sr-only" aria-live="polite">{statusAnnouncement}</span>

<style>
    .burn-option { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.85rem; margin-bottom: 0.6rem; }
    .burn-help { font-size: 0.78rem; line-height: 1.5; margin: 0 0 0.7rem; color: #52634b; }
    .burn-status { color: #52634b; }
    .reveal-button { padding: 0.5rem; border: 1px solid currentColor; border-radius: 8px; color: inherit; background: transparent; cursor: pointer; font: inherit; }
    .reveal-button:disabled { opacity: 0.6; cursor: not-allowed; }
    .chat-shell {
        overflow: hidden;
        border: 1px solid rgba(112, 178, 35, 0.16);
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 12px 34px rgba(33, 61, 16, 0.07);
    }

    .privacy-note {
        display: flex;
        min-height: 34px;
        padding: 5px 16px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        color: #75806e;
        border-bottom: 1px solid #edf2e9;
        background: #f8fbf5;
        font-size: 12px;
        text-align: center;
    }

    .privacy-note svg { flex: 0 0 auto; color: #70b223; }
    .message-area { position: relative; }

    .message-list {
        height: min(48vh, 450px);
        min-height: 300px;
        overflow-y: auto;
        padding: 24px 22px;
        background: radial-gradient(circle at 12% 15%, rgba(112, 178, 35, 0.055), transparent 24%), linear-gradient(180deg, #fdfefd 0%, #f8faf7 100%);
        scrollbar-width: thin;
        scrollbar-color: #cbd7c4 transparent;
    }

    .empty-state {
        display: flex;
        min-height: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 7px;
        color: #899184;
        text-align: center;
    }

    .empty-state strong { color: #5e6759; font-size: 15px; font-weight: 600; }
    .empty-state span { max-width: 320px; font-size: 13px; line-height: 1.55; }

    .empty-icon {
        display: grid;
        width: 68px;
        height: 68px;
        margin-bottom: 5px;
        place-items: center;
        color: #83b94c;
        border: 1px solid #dcebd0;
        border-radius: 50%;
        background: #f3f9ee;
    }

    .message-row { display: flex; margin-bottom: 18px; justify-content: flex-start; }
    .message-row.outgoing { justify-content: flex-end; }

    .message-group {
        display: flex;
        max-width: min(78%, 680px);
        min-width: 120px;
        flex-direction: column;
        align-items: flex-start;
    }

    .outgoing .message-group { align-items: flex-end; }

    .message-bubble {
        padding: 11px 14px;
        color: #30362d;
        border: 1px solid #e3e9df;
        border-radius: 5px 16px 16px 16px;
        background: #fff;
        box-shadow: 0 4px 14px rgba(38, 54, 29, 0.05);
    }

    .outgoing .message-bubble {
        color: #fff;
        border-color: #70b223;
        border-radius: 16px 5px 16px 16px;
        background: linear-gradient(135deg, #7dbc2e, #66a91b);
        box-shadow: 0 6px 17px rgba(96, 157, 28, 0.18);
    }

    .message-text {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.6;
        user-select: text;
    }

    .message-meta {
        display: flex;
        min-height: 24px;
        margin-top: 4px;
        align-items: center;
        gap: 7px;
        color: #8a9286;
        font-size: 11px;
    }

    .outgoing .message-meta { justify-content: flex-end; }

    .copy-button, .retry-button {
        padding: 2px 4px;
        color: #698357;
        border: 0;
        border-radius: 4px;
        background: transparent;
        font: inherit;
        cursor: pointer;
    }

    .copy-button:hover, .retry-button:hover:not(:disabled) { color: #57960e; background: #edf6e6; }
    .retry-button { color: #b4692b; font-weight: 600; }
    .retry-button:disabled { cursor: not-allowed; opacity: 0.5; }

    .delivery-status { display: inline-flex; align-items: center; gap: 3px; color: #6e9c3e; }
    .delivery-status.warning { color: #b67a27; }
    .delivery-status.error { color: #c85858; }

    .status-spinner {
        width: 9px;
        height: 9px;
        border: 1.5px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .new-message-button {
        position: absolute;
        right: 50%;
        bottom: 12px;
        transform: translateX(50%);
        padding: 7px 13px;
        color: #527f20;
        border: 1px solid #cfe4bc;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 5px 16px rgba(40, 70, 22, 0.13);
        font-size: 12px;
        cursor: pointer;
    }

    .offline-notice {
        padding: 8px 16px;
        color: #8a651f;
        border-top: 1px solid #f0dfb8;
        background: #fff9eb;
        font-size: 12px;
        text-align: center;
    }

    .composer { padding: 14px 16px 13px; border-top: 1px solid #e9eee6; background: #fff; }

    .text-input {
        display: block;
        width: 100%;
        min-height: 78px;
        box-sizing: border-box;
        resize: vertical;
        padding: 10px 12px;
        color: #30362d;
        border: 1px solid #dce4d7;
        border-radius: 10px;
        outline: none;
        background: #fcfdfb;
        font: inherit;
        font-size: 14px;
        line-height: 1.5;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .text-input:focus { border-color: #82bc45; box-shadow: 0 0 0 3px rgba(112, 178, 35, 0.1); }
    .text-input:disabled { cursor: not-allowed; background: #f2f3f1; }

    .composer-footer {
        display: flex;
        margin-top: 9px;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .send-hint { color: #9aa095; font-size: 11px; }

    .send-button {
        display: inline-flex;
        min-width: 112px;
        height: 38px;
        padding: 0 18px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        color: #fff;
        border: 0;
        border-radius: 9px;
        background: linear-gradient(135deg, #79b92b, #65a91a);
        box-shadow: 0 5px 14px rgba(101, 169, 26, 0.2);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
    }

    .send-button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 7px 18px rgba(101, 169, 26, 0.27); }
    .send-button:disabled { cursor: not-allowed; box-shadow: none; opacity: 0.45; }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
        .chat-shell { border-radius: 12px; }
        .message-list { height: min(52vh, 420px); min-height: 270px; padding: 18px 12px; }
        .message-group { max-width: 88%; }
        .composer { padding: 11px 12px; }
        .send-hint { display: none; }
        .composer-footer { justify-content: flex-end; }
    }

    @media (prefers-reduced-motion: reduce) {
        .send-button, .text-input { transition: none; }
        .status-spinner { animation-duration: 1.8s; }
        .message-list { scroll-behavior: auto; }
    }
</style>
