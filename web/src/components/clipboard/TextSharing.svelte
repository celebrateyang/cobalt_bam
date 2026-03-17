<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import SettingsCategory from '$components/settings/SettingsCategory.svelte';
    import ActionButton from '$components/buttons/ActionButton.svelte';
    import { t } from '$lib/i18n/translations';
    
    const dispatch = createEventDispatcher();
    
    export let textContent: string;
    export let receivedText: string;
    export let peerConnected: boolean;
    
    let previousReceivedText = '';
    let showNewMessageNotification = false;
    let isNewMessage = false;
    let receivedTextElement: HTMLElement;
    
    // 监听接收文本的变化
    $: if (receivedText !== previousReceivedText && receivedText && previousReceivedText !== '') {
        handleNewTextReceived();
        previousReceivedText = receivedText;
    }
    
    // 初始化时记录当前文本
    onMount(() => {
        previousReceivedText = receivedText;
    });
    
    function handleNewTextReceived() {
        // 显示新消息通知
        showNewMessageNotification = true;
        isNewMessage = true;
        
        // 滚动到接收文本区域
        if (receivedTextElement) {
            receivedTextElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
        
        // 3秒后隐藏通知
        setTimeout(() => {
            showNewMessageNotification = false;
        }, 3000);
        
        // 5秒后移除新消息高亮
        setTimeout(() => {
            isNewMessage = false;
        }, 5000);
        
        // 可选：播放提示音
        playNotificationSound();
    }
      function playNotificationSound() {
        try {
            // 创建一个短暂的提示音
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            // 如果音频播放失败，忽略错误
            console.log('Audio notification not available');
        }
    }
    
    function sendText(): void {
        if (textContent.trim()) {
            dispatch('sendText', { text: textContent });
        }
    }
    
    function clearReceivedText(): void {
        isNewMessage = false;
        showNewMessageNotification = false;
        dispatch('clearText');
    }
    
    function copyReceivedText(): void {
        if (receivedText && navigator.clipboard) {
            navigator.clipboard.writeText(receivedText);
            isNewMessage = false;
        }
    }
    
    function dismissNotification() {
        showNewMessageNotification = false;
        isNewMessage = false;
    }
</script>

<!-- 新消息通知 -->
{#if showNewMessageNotification}
    <div class="new-message-notification" on:click={dismissNotification}>
        <div class="notification-content">
            <div class="notification-icon">📩</div>
            <div class="notification-text">
                <strong>{$t('clipboard.new_message_received')}</strong>
                <span>{$t('clipboard.click_to_view')}</span>
            </div>
            <button class="notification-close" on:click|stopPropagation={dismissNotification}>✕</button>
        </div>
    </div>
{/if}

<SettingsCategory title={$t('clipboard.send_text')} sectionId="text-sharing">
    <div class="text-sharing-section">
        <!-- 发送文本区域 - 移到上方 -->
        <div class="send-text">
            <textarea
                class="text-input"
                bind:value={textContent}
                placeholder={$t('clipboard.text_placeholder')}
                rows="3"
                disabled={!peerConnected}
            ></textarea>
            <ActionButton
                id="send-text"
                disabled={!peerConnected || !textContent.trim()}
                click={sendText}
            >
                {$t('clipboard.send_text')}
            </ActionButton>
        </div>

        <!-- 接收文本区域 - 移到下方 -->
        <div class="received-text" class:new-message={isNewMessage} bind:this={receivedTextElement}>
            {#if receivedText}
                <div class="text-display">
                    <div class="text-content">{receivedText}</div>
                </div>
                <div class="text-actions">
                    <button
                        class="copy-btn"
                        on:click={copyReceivedText}
                    >
                        {$t('clipboard.copy')}
                    </button>
                    <button
                        class="clear-btn"
                        on:click={clearReceivedText}
                    >
                        {$t('clipboard.clear')}
                    </button>
                </div>
            {:else}
                <div class="empty-state">
                    {$t('clipboard.no_text_received')}
                </div>
            {/if}
        </div>
    </div>
</SettingsCategory>

<style>
    /* 新消息通知样式 */
    .new-message-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
        animation: slideInRight 0.3s ease-out;
        cursor: pointer;
        max-width: 320px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
    }

    .notification-content {
        display: flex;
        align-items: center;
        padding: 1rem;
        gap: 0.75rem;
        position: relative;
    }

    .notification-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
    }

    .notification-text {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        color: white;
        flex: 1;
    }

    .notification-text strong {
        font-weight: 600;
        font-size: 0.95rem;
    }

    .notification-text span {
        font-size: 0.8rem;
        opacity: 0.9;
    }

    .notification-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 1.1rem;
        padding: 0.25rem;
        border-radius: 4px;
        transition: background-color 0.2s ease;
        flex-shrink: 0;
    }

    .notification-close:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    .text-sharing-section {
        display: flex;
        flex-direction: column;
        gap: 1.6rem;
        padding: 1rem;
    }

    .send-text, .received-text {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 2rem;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(8px);
        transition: all 0.3s ease;
        align-items: center;
        text-align: center;
    }

    /* 新消息状态的特殊样式 */
    .received-text.new-message {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
        border-color: rgba(102, 126, 234, 0.3);
        box-shadow: 0 0 20px rgba(102, 126, 234, 0.2);
        animation: glow 2s ease-in-out infinite alternate;
    }

    @keyframes glow {
        from {
            box-shadow: 0 0 20px rgba(102, 126, 234, 0.2);
        }
        to {
            box-shadow: 0 0 30px rgba(102, 126, 234, 0.4);
        }
    }

    .send-text:hover, .received-text:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .received-text.new-message:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 35px rgba(102, 126, 234, 0.3);
        border-color: rgba(102, 126, 234, 0.4);
    }

    .text-input {
        width: 100%;
        padding: 1rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.02);
        color: var(--text);
        resize: vertical;
        font-family: inherit;
        font-size: 0.95rem;
        line-height: 1.6;
        min-height: 100px;
        transition: all 0.3s ease;
        backdrop-filter: blur(4px);
        text-align: left;
        align-self: center;
        margin: 0 auto;
        box-sizing: border-box;
    }

    .text-input:focus {
        outline: none;
        border-color: rgba(102, 126, 234, 0.5);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1), 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateY(-1px);
    }

    .text-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }    .text-display {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.02);
        overflow: hidden;
        backdrop-filter: blur(4px);
        transition: all 0.3s ease;
        align-self: stretch;
        width: 100%;
    }

    .text-display:hover {
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }    .text-content {
        padding: 1.5rem;
        white-space: pre-wrap;
        word-wrap: break-word;
        color: var(--text);
        line-height: 1.7;
        font-size: 0.95rem;
        background: rgba(255, 255, 255, 0.01);
        min-height: 60px;
        max-height: 200px;
        overflow-y: auto;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .text-content::-webkit-scrollbar {
        width: 6px;
    }

    .text-content::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.02);
        border-radius: 3px;
    }

    .text-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
    }

    .text-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }    .text-actions {
        display: flex;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        background: rgba(255, 255, 255, 0.01);
        justify-content: center;
        flex-wrap: wrap;
        align-self: stretch;
    }

    .copy-btn, .clear-btn {
        padding: 0.75rem 1.25rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.02);
        color: var(--text);
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 44px;
    }

    .copy-btn:hover {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
        border-color: rgba(102, 126, 234, 0.3);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.2);
    }

    .clear-btn:hover {
        background: linear-gradient(135deg, rgba(244, 67, 54, 0.1) 0%, rgba(229, 57, 53, 0.1) 100%);
        border-color: rgba(244, 67, 54, 0.3);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(244, 67, 54, 0.2);
    }

    .copy-btn:active, .clear-btn:active {
        transform: translateY(0) scale(0.95);
    }

    .empty-state {
        padding: 3rem 2rem;
        text-align: center;
        color: var(--secondary);
        background: rgba(255, 255, 255, 0.01);
        border-radius: 12px;
        border: 2px dashed rgba(255, 255, 255, 0.1);
        font-style: italic;
        backdrop-filter: blur(4px);
        position: relative;
        overflow: hidden;
    }

    .empty-state::before {
        content: '📭';
        display: block;
        font-size: 2.5rem;
        margin-bottom: 1rem;
        opacity: 0.5;
    }

    .empty-state::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.03), transparent);
        animation: shimmer 3s infinite;
    }

    @keyframes shimmer {
        0% {
            left: -100%;
        }
        100% {
            left: 100%;
        }
    }    /* 移动端响应式 */    /* PC/Desktop 优化 - 1024px 及以上 - 横向布局 */
    @media (min-width: 1024px) {
        .text-sharing-section {
            flex-direction: row;
            gap: 2rem;
            padding: 0.5rem;
            max-height: 55vh;
            align-items: stretch;
        }        .send-text, .received-text {
            padding: 1.5rem;
            flex: 1;
            max-width: calc(50% - 1rem);
            align-items: center;
            text-align: center;
            justify-content: center;
        }
          /* 确保标题在PC端居中 */
        
        /* 确保输入框在PC端居中 */
        .text-input {
            align-self: center;
            margin: 0 auto;
            display: block;
        }
          /* 调整发送文本区域 */
        .send-text {
            order: 1;
        }
        
        /* 调整接收文本区域 */
        .received-text {
            order: 2;
        }
          .text-content {
            max-height: 250px;
            overflow-y: auto;
        }
        
        .text-input {
            min-height: 200px;
            max-height: 250px;
            resize: vertical;
        }
        
        /* 优化PC端滚动条 */
        .text-content::-webkit-scrollbar,
        .text-input::-webkit-scrollbar {
            width: 6px;
        }
        
        .text-content::-webkit-scrollbar-track,
        .text-input::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 3px;
        }
        
        .text-content::-webkit-scrollbar-thumb,
        .text-input::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }
        
        .text-content::-webkit-scrollbar-thumb:hover,
        .text-input::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    }    /* 超大桌面屏幕优化 - 1440px 及以上 */
    @media (min-width: 1440px) {
        .text-sharing-section {
            gap: 2.5rem;
            max-height: 60vh;
            padding: 1rem;
        }
          .send-text, .received-text {
            padding: 2rem;
            align-items: center;
            text-align: center;
            justify-content: center;
        }
          /* 确保大桌面端标题居中 */
        
        /* 确保大桌面端输入框居中 */
        .text-input {
            align-self: center;
            margin: 0 auto;
            display: block;
        }
        
        .text-content {
            max-height: 300px;
        }
        
        .text-input {
            min-height: 250px;
            max-height: 300px;
        }
        
        .text-actions {
            gap: 1rem;
        }
        
        .copy-btn, .clear-btn {
            padding: 0.9rem 1.5rem;
            font-size: 0.95rem;
        }
    }    /* 平板优化 - 768px 到 1023px */
    @media (min-width: 768px) and (max-width: 1023px) {
        .text-sharing-section {
            gap: 1.8rem;
            padding: 0.75rem;
            max-height: 40vh;
            overflow-y: auto;
        }
        
        .send-text, .received-text {
            padding: 1.75rem;
        }
        
        .text-content {
            max-height: 200px;
        }
    }
    
    @media (max-width: 768px) {
        .new-message-notification {
            right: 10px;
            left: 10px;
            max-width: none;
            top: 10px;
        }

        :global(#text-sharing .heading-container) {
            display: none;
        }

        .text-sharing-section {
            gap: 0.65rem;
            padding: 0.2rem;
            height: calc(100vh - 250px);
            height: calc(100dvh - 250px);
            min-height: 0;
        }

        .send-text, .received-text {
            padding: 0.85rem;
            gap: 0.65rem;
            border-radius: 12px;
            min-height: 0;
            flex: 1;
        }

        .send-text {
            justify-content: space-between;
        }

        .text-input {
            min-height: 0;
            max-height: none;
            height: auto;
            flex: 1;
            padding: 0.7rem;
            font-size: 0.88rem;
            line-height: 1.35;
        }

        .send-text :global(.action-button) {
            min-height: 36px;
            padding: 0.45rem 0.9rem;
            font-size: 0.82rem;
        }

        .text-display {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
        }

        .text-content {
            padding: 0.75rem;
            font-size: 0.86rem;
            min-height: 0;
            max-height: none;
            flex: 1;
            line-height: 1.4;
        }

        .text-actions {
            padding: 0.5rem 0.65rem;
            gap: 0.4rem;
        }

        .copy-btn, .clear-btn {
            padding: 0.5rem 0.7rem;
            font-size: 0.78rem;
            flex: 1;
            justify-content: center;
            min-height: 34px;
            gap: 0.35rem;
        }

        .empty-state {
            padding: 0.85rem 0.75rem;
            min-height: 72px;
            font-size: 0.82rem;
        }

        .empty-state::before {
            display: none;
        }
    }

    @media (max-width: 480px) {
        .notification-content {
            padding: 0.75rem;
            gap: 0.5rem;
        }

        .notification-text strong {
            font-size: 0.9rem;
        }

        .notification-text span {
            font-size: 0.75rem;
        }

        .text-sharing-section {
            height: calc(100vh - 220px);
            height: calc(100dvh - 220px);
        }

        .send-text, .received-text {
            padding: 0.7rem;
            border-radius: 10px;
        }

        .text-input {
            padding: 0.65rem;
            font-size: 0.84rem;
        }

        .text-content {
            padding: 0.65rem;
            font-size: 0.82rem;
        }

        .copy-btn, .clear-btn {
            font-size: 0.75rem;
        }
    }
    
    /* ActionButton居中样式 */
    .send-text :global(.action-button) {
        align-self: center;
        margin: 0 auto;
        display: block;
    }
    
    /* PC端ActionButton居中 */
    @media (min-width: 1024px) {
        .send-text :global(.action-button) {
            align-self: center;
            margin: 0 auto;
            display: block;
            width: auto;
            max-width: 200px;
        }
    }
    
    /* 大桌面端ActionButton居中 */
    @media (min-width: 1440px) {
        .send-text :global(.action-button) {
            align-self: center;
            margin: 0 auto;
            display: block;
            width: auto;
            max-width: 220px;
        }
    }

    /* Layout overrides: keep left/right text boxes same height and align action row */
    .send-text,
    .received-text {
        align-items: stretch;
        text-align: left;
        justify-content: flex-start;
    }

    .text-input,
    .text-display {
        width: 100%;
        min-height: 180px;
        max-height: 180px;
    }

    .text-input {
        resize: none;
        align-self: stretch;
        margin: 0;
    }

    .text-content {
        min-height: 100%;
        max-height: 100%;
        border-bottom: none;
    }

    .text-actions {
        margin-top: 0.75rem;
        padding: 0;
        background: transparent;
        display: flex;
        flex-wrap: nowrap;
        justify-content: center;
        gap: 0.75rem;
    }

    .copy-btn,
    .clear-btn {
        flex: 1;
        justify-content: center;
        min-height: 44px;
    }

    .send-text :global(.action-button) {
        min-height: 44px;
    }

    @media (min-width: 1024px) {
        .text-input,
        .text-display {
            min-height: 220px;
            max-height: 220px;
        }
    }

    @media (min-width: 1440px) {
        .text-input,
        .text-display {
            min-height: 260px;
            max-height: 260px;
        }
    }

    @media (min-width: 768px) and (max-width: 1023px) {
        .text-input,
        .text-display {
            min-height: 190px;
            max-height: 190px;
        }
    }

    @media (max-width: 768px) {
        .text-input,
        .text-display {
            min-height: 0;
            max-height: none;
            height: auto;
        }

        .text-content {
            min-height: 0;
            max-height: none;
            height: 100%;
        }

        .text-actions {
            margin-top: 0.55rem;
            gap: 0.4rem;
        }

        .copy-btn,
        .clear-btn {
            min-height: 34px;
        }

        .send-text :global(.action-button) {
            min-height: 34px;
        }
    }

</style>
