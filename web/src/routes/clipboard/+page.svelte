<script lang="ts">
    import { t } from '$lib/i18n/translations';
    import { onDestroy, onMount, tick } from 'svelte';
// Import clipboard components
    import FileTransfer from '$components/clipboard/FileTransfer.svelte';
    import SessionManager from '$components/clipboard/SessionManager.svelte';
    import TabNavigation from '$components/clipboard/TabNavigation.svelte';
    import TextSharing from '$components/clipboard/TextSharing.svelte';
// Import clipboard manager
    import { ClipboardManager, clipboardState, type FileItem } from '$lib/clipboard/clipboard-manager';
    // Types
    interface ReceivingFile {
        name: string;
        size: number;
        type: string;
        chunks: Uint8Array[];
        receivedSize: number;
    }

    // Clipboard session state
    let sessionId = '';
    let joinCode = '';
    let isConnected = false;
    let isCreating = false;
    let isJoining = false;
    let isCreator = false;
    let peerConnected = false;
    let qrCodeUrl = '';

    // Navigation state
    let activeTab: 'files' | 'text' = 'files';
    
    // File transfer state
    let files: File[] = [];
    let receivedFiles: FileItem[] = [];
    let textContent = '';
    let receivedText = '';
    let dragover = false;
    let sendingFiles = false;    let receivingFiles = false;
    let transferProgress = 0;
    let isTransferring = false; // 新增：传输状态
    let currentReceivingFile: ReceivingFile | null = null;
    let dataChannel: RTCDataChannel | null = null;
    let peerConnection: RTCPeerConnection | null = null;
    
    // Error handling state
    let errorMessage = '';
    let showError = false;
    let waitingForCreator = false;
    let showLinkCopied = false;

    const COMPACT_VIEWPORT_MAX_WIDTH = 768;

    let headerCollapsed = false;
    let headerManualOverride: 'collapsed' | 'expanded' | null = null;
    let isCompactViewport = false;
    let shouldCollapseAutomatically = false;
    let autoCollapseWasActive = false;
    let tabContentEl: HTMLDivElement | null = null;
    let detachViewportListener: (() => void) | null = null;
    
    // Clipboard manager instance
    let clipboardManager: ClipboardManager;

    $: if (clipboardManager) {
        clipboardState.subscribe(state => {
            sessionId = state.sessionId;
            isConnected = state.isConnected;
            isCreating = state.isCreating;
            isJoining = state.isJoining;
            isCreator = state.isCreator;
            peerConnected = state.peerConnected;
            qrCodeUrl = state.qrCodeUrl;
            activeTab = state.activeTab;
            files = state.files;
            receivedFiles = state.receivedFiles;
            // Don't overwrite textContent - it's managed by the TextSharing component binding
            // textContent = state.textContent;
            receivedText = state.receivedText;
            dragover = state.dragover;
            sendingFiles = state.sendingFiles;
            receivingFiles = state.receivingFiles;
            transferProgress = state.transferProgress;
            isTransferring = state.isTransferring; // 新增：订阅传输状态
            dataChannel = state.dataChannel;
            peerConnection = state.peerConnection;
            errorMessage = state.errorMessage;
            showError = state.showError;
            waitingForCreator = state.waitingForCreator;
        });
    }

    $: shouldCollapseAutomatically = isCompactViewport && (isTransferring || sendingFiles || receivingFiles || transferProgress > 0);

    $: {
        if (shouldCollapseAutomatically) {
            if (headerManualOverride === null) {
                headerCollapsed = true;
            }
        } else {
            if (headerManualOverride === null || headerManualOverride === 'expanded') {
                headerCollapsed = false;
            } else if (headerManualOverride === 'collapsed') {
                headerCollapsed = true;
            }

            if (headerManualOverride === 'expanded') {
                headerManualOverride = null;
            }
        }
    }

    $: if (shouldCollapseAutomatically && !autoCollapseWasActive) {
        autoCollapseWasActive = true;
        if (isCompactViewport) {
            (async () => {
                await tick();
                tabContentEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            })();
        }
    } else if (!shouldCollapseAutomatically && autoCollapseWasActive) {
        autoCollapseWasActive = false;
    }

    // Event handlers for components
    function handleCreateSession() {
        clipboardManager?.createSession();
    }    function handleJoinSession() {
        if (joinCode.trim()) {
            clipboardManager?.joinSession(joinCode.trim());
        }
    }

    function handleCleanup() {
        clipboardManager?.cleanup();
    }

    function handleTabChange(event: CustomEvent<'files' | 'text'>) {
        clipboardState.update(state => ({ ...state, activeTab: event.detail }));
    }

    // File transfer handlers
    function handleFilesSelected(event: CustomEvent) {
        clipboardState.update(state => ({
            ...state,
            files: [...state.files, ...event.detail.files]
        }));
    }

    function handleRemoveFile(event: CustomEvent) {
        clipboardState.update(state => ({
            ...state,
            files: state.files.filter((_, i) => i !== event.detail.index)
        }));
    }    function handleSendFiles() {
        clipboardManager?.sendFiles();
    }

    function handleCancelSending() {
        console.log('🚫 处理取消发送事件');
        clipboardManager?.cancelSending();
    }

    function handleCancelReceiving() {
        console.log('🚫 处理取消接收事件');
        clipboardManager?.cancelReceiving();
    }

    function handleDownloadFile(event: CustomEvent) {
        const file = event.detail.file;
        const url = URL.createObjectURL(file.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleRemoveReceivedFile(event: CustomEvent) {
        clipboardState.update(state => ({
            ...state,
            receivedFiles: state.receivedFiles.filter((_, i) => i !== event.detail.index)
        }));
    }    // Text sharing handlers
    function handleSendText(event?: CustomEvent) {
        const text = event?.detail?.text || textContent;
        console.log('handleSendText called with text:', text);
        console.log('clipboardManager exists:', !!clipboardManager);
        console.log('dataChannel ready:', clipboardManager?.debugInfo?.dataChannel?.readyState);
        console.log('peerConnected:', peerConnected);
        
        if (text.trim()) {
            clipboardManager?.sendText(text);
        } else {
            console.log('No text to send');
        }    }    function handleClearText() {
        clipboardState.update(state => ({ ...state, receivedText: '' }));
    }

    function handleClearError() {
        clipboardManager?.clearError();
    }

    // 文件选择前的准备工作
    function handlePrepareFileSelection() {
        console.log('📱 准备文件选择');
        clipboardManager?.prepareForFileSelection();
    }

    // 文件选择完成后的处理
    async function handleFileSelectionComplete() {
        console.log('📱 文件选择完成');
        await clipboardManager?.completeFileSelection();
    }

    // Copy session link handler
    function handleCopySessionLink() {
        if (sessionId) {
            const sessionUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;
            navigator.clipboard.writeText(sessionUrl).then(() => {
                showLinkCopied = true;
                setTimeout(() => {
                    showLinkCopied = false;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy link:', err);
            });
        }
    }

    function toggleHeaderCollapse() {
        headerCollapsed = !headerCollapsed;
        headerManualOverride = headerCollapsed ? 'collapsed' : 'expanded';

        if (!headerCollapsed && isCompactViewport) {
            (async () => {
                await tick();
                tabContentEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            })();
        }
    }

// Lifecycle functions
    onMount(async () => {
        // 立即清除任何错误状态
        errorMessage = '';
        showError = false;
        
        clipboardManager = new ClipboardManager();
        
        // 再次确保清除错误状态
        clipboardManager.clearError();
        
        if (typeof window !== 'undefined') {
            const viewportQuery = window.matchMedia(`(max-width: ${COMPACT_VIEWPORT_MAX_WIDTH}px)`);

            const applyViewportMatch = (matches: boolean) => {
                isCompactViewport = matches;
            };

            applyViewportMatch(viewportQuery.matches);

            const handleViewportChange = (event: MediaQueryListEvent) => {
                applyViewportMatch(event.matches);
            };

            viewportQuery.addEventListener('change', handleViewportChange);
            detachViewportListener = () => viewportQuery.removeEventListener('change', handleViewportChange);

            const urlParams = new URLSearchParams(window.location.search);
            const sessionParam = urlParams.get('session');
            if (sessionParam) {
                joinCode = sessionParam;
                await clipboardManager.joinSession(joinCode);
            }
        }
    });

    onDestroy(() => {
        detachViewportListener?.();
        clipboardManager?.cleanup();
    });
</script>

<svelte:head>
    <title>{$t("general.seo.transfer.title")}</title>
    <meta name="description" content={$t("general.seo.transfer.description")} />
    <meta name="keywords" content={$t("general.seo.transfer.keywords")} />
    <meta property="og:title" content={$t("general.seo.transfer.title")} />
    <meta property="og:description" content={$t("general.seo.transfer.description")} />
</svelte:head>



<div class="clipboard-container">
    <div class="clipboard-header" class:collapsed={headerCollapsed}>
        <div class="header-top">
            <h1>{$t("clipboard.title")}</h1>
            {#if isCompactViewport}
                <button
                    type="button"
                    class="header-toggle"
                    on:click={toggleHeaderCollapse}
                    aria-expanded={!headerCollapsed}
                    aria-controls="clipboard-header-description"
                    aria-label={headerCollapsed ? $t("clipboard.expand_header") : $t("clipboard.collapse_header")}
                >
                    <span class="toggle-label">{headerCollapsed ? $t("clipboard.expand_header") : $t("clipboard.collapse_header")}</span>
                    <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            {/if}
        </div>
        <div
            class="header-description"
            id="clipboard-header-description"
            aria-hidden={headerCollapsed}
        >
            <div class="description-container">
                <p class="description-main">{$t("clipboard.description")}</p>
                <p class="description-subtitle">{$t("clipboard.description_subtitle")}</p>
            </div>
        </div>
    </div>

    <!-- Error Message Display -->
    {#if showError && errorMessage}
        <div class="error-notification" class:waiting={waitingForCreator} class:success={errorMessage.includes('成功')}>
            <div class="error-content">
                <div class="error-icon">
                    {#if waitingForCreator}
                        <div class="spinner"></div>
                    {:else if errorMessage.includes('成功')}
                        ✅
                    {:else}
                        ⚠️
                    {/if}
                </div>                <div class="error-text">
                    <strong>{waitingForCreator ? '等待中' : errorMessage.includes('成功') ? '成功' : '提示'}</strong>
                    <p>{errorMessage}</p>
                </div>
                <button class="error-close" on:click={handleClearError} aria-label="关闭">
                    ✕
                </button>
            </div>
        </div>
    {/if}

    {#if isConnected && peerConnected}
        <!-- Connection Status Indicator -->
        <div class="session-status">
            <div class="status-badge">
                <div class="status-dot connected"></div>
                <span class="status-text">{$t('clipboard.peer_connected')}</span>
            </div>
        </div>

        <!-- Tab Navigation Component - Moved to top -->
        <TabNavigation
            {activeTab}
            on:tabChange={handleTabChange}
        />

        <!-- Content Area - Moved to top -->
    <div class="tab-content" bind:this={tabContentEl}>
            <!-- File Transfer Component -->
            {#if activeTab === 'files'}
                <FileTransfer
                    {files}
                    {receivedFiles}
                    {sendingFiles}
                    {receivingFiles}
                    {transferProgress}
                    {dragover}
                    {peerConnected}
                    {isTransferring}
                    on:filesSelected={handleFilesSelected}
                    on:removeFile={handleRemoveFile}
                    on:sendFiles={handleSendFiles}
                    on:cancelSending={handleCancelSending}
                    on:cancelReceiving={handleCancelReceiving}
                    on:downloadFile={handleDownloadFile}
                    on:removeReceivedFile={handleRemoveReceivedFile}
                    on:prepareFileSelection={handlePrepareFileSelection}
                    on:fileSelectionComplete={handleFileSelectionComplete}
                />
            {/if}

            <!-- Text Sharing Component -->
            {#if activeTab === 'text'}
                <TextSharing
                    {receivedText}
                    {peerConnected}
                    on:sendText={handleSendText}
                    on:clearText={handleClearText}
                    bind:textContent
                />
            {/if}
        </div>

        <!-- Session Management Section - Moved to bottom -->
        <div class="session-management-section">
            <div class="session-info">
                <h3>{$t("clipboard.session_management")}</h3>
                
                <!-- Session ID and copy link removed for cleaner UI when connected -->
                
                <div class="session-actions">
                    <button class="btn-secondary danger" on:click={handleCleanup}>
                        {$t('clipboard.disconnect')}
                    </button>
                </div>
            </div>
        </div>
    {:else}
        <!-- Session Management Component - Show when not connected -->
        <SessionManager
            {sessionId}            {isConnected}
            {isCreating}
            {isJoining}
            {isCreator}
            {peerConnected}
            {qrCodeUrl}
            on:createSession={handleCreateSession}
            on:joinSession={handleJoinSession}
            on:cleanup={handleCleanup}
            bind:joinCode
        />
    {/if}
</div>

<style>    /* Main container styles */
    .clipboard-container {
        max-width: 900px;
        margin: 0 auto;
        padding: 1rem;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
        border-radius: 20px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
        min-height: 60vh;
    }.clipboard-header {
        text-align: center;
        margin-bottom: 0.75rem;
        padding: 0.35rem 0 0.85rem;
        position: relative;
        transition: padding 0.3s ease, margin 0.3s ease;
    }

    .clipboard-header.collapsed {
        margin-bottom: 0.2rem;
        padding-bottom: 0.25rem;
    }

    .clipboard-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 60px;
        height: 4px;
        background: linear-gradient(90deg, var(--accent), var(--accent-hover));
        border-radius: 2px;
        margin-bottom: 1rem;
    }

    .header-top {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }

    .clipboard-header h1 {
        margin-bottom: 0.2rem;
        font-size: 2.2rem;
        font-weight: 700;
        background: linear-gradient(135deg, var(--accent), var(--accent-hover));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-top: 0.3rem;
    }

    .header-description {
        overflow: hidden;
        transition: max-height 0.3s ease, opacity 0.3s ease, margin-top 0.3s ease;
        max-height: 220px;
        opacity: 1;
        margin-top: 0.35rem;
    }

    .clipboard-header.collapsed .header-description {
        max-height: 0;
        opacity: 0;
        margin-top: 0;
        pointer-events: none;
    }

    .header-toggle {
        display: none;
        align-items: center;
        gap: 0.4rem;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 999px;
        padding: 0.35rem 0.8rem;
        color: var(--text);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
    }

    .header-toggle:hover,
    .header-toggle:focus-visible {
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.3);
        outline: none;
    }

    .header-toggle:active {
        transform: translateY(1px);
    }

    .header-toggle .toggle-label {
        white-space: nowrap;
    }

    .header-toggle .toggle-icon {
        transition: transform 0.25s ease;
        transform: rotate(180deg);
    }

    .clipboard-header.collapsed .header-toggle .toggle-icon {
        transform: rotate(0deg);
    }

    @media (max-width: 768px) {
        .header-top {
            justify-content: space-between;
        }

        .header-toggle {
            display: inline-flex;
        }

        .header-toggle .toggle-label {
            font-size: 0.8rem;
        }

        .clipboard-header.collapsed h1 {
            font-size: 1.7rem;
            margin-bottom: 0;
        }
    }

    @media (max-width: 480px) {
        .header-toggle {
            padding: 0.3rem 0.6rem;
        }

        .header-toggle .toggle-label {
            display: none;
        }
    }

    .description-container {
        display: flex;
        flex-direction: column;
        gap: 0.02rem;
        align-items: center;
    }

    .description-main {
        color: var(--text);
        font-size: 1.3rem !important;
        font-weight: 500 !important;
        opacity: 0.9 !important;
        margin: 0;
    }

    .description-subtitle {
        color: var(--subtext);
        font-size: 0.95rem !important;
        font-weight: 400 !important;
        opacity: 0.7 !important;
        margin: 0;
        max-width: 600px;        line-height: 1.4;
    }

    /* Error notification styles */
    .error-notification {
        margin: 1rem 0;
        padding: 1rem;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 12px;
        backdrop-filter: blur(8px);
        animation: slideIn 0.3s ease-out;
    }

    .error-notification.waiting {
        background: rgba(34, 197, 94, 0.1);
        border-color: rgba(34, 197, 94, 0.3);
    }

    .error-notification.success {
        background: rgba(34, 197, 94, 0.08);
        border-color: rgba(34, 197, 94, 0.25);
    }

    .error-content {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
    }

    .error-icon {
        flex-shrink: 0;
        font-size: 1.2rem;
        margin-top: 0.1rem;
    }

    .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(34, 197, 94, 0.3);
        border-top: 2px solid #22c55e;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .error-text {
        flex: 1;
    }

    .error-text strong {
        color: #ef4444;
        font-weight: 600;
        display: block;
        margin-bottom: 0.25rem;
    }

    .error-notification.waiting .error-text strong {
        color: #22c55e;
    }

    .error-notification.success .error-text strong {
        color: #22c55e;
    }

    .error-text p {
        color: var(--text);
        margin: 0;
        font-size: 0.9rem;
        opacity: 0.9;
    }

    .error-close {
        background: none;
        border: none;
        color: var(--text);
        font-size: 1.2rem;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s ease;
        padding: 0;
        line-height: 1;
        flex-shrink: 0;
    }

    .error-close:hover {
        opacity: 1;
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

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    /* Enhanced session status */
    .session-status {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0.25rem 0;
        padding: 0.4rem;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.2);
        border-radius: 12px;
        backdrop-filter: blur(8px);
    }

    .status-badge {
        display: flex;
        align-items: center;
        gap: 0.8rem;
    }

    .status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
        animation: pulse 2s infinite;
    }

    .status-text {
        font-weight: 500;
        color: #22c55e;
        font-size: 0.95rem;
    }

    @keyframes pulse {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.7;
            transform: scale(1.1);
        }
    }    /* Tab content styling */
    .tab-content {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 15px;
        padding: 0.75rem;
        margin-top: 0.25rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        transition: all 0.3s ease;
        position: relative;
        overflow: visible; /* 允许通知显示在容器外 */
    /* 允许内容根据实际高度扩展，避免桌面端被裁剪 */
    }

    .tab-content:hover {
        box-shadow: 0 6px 30px rgba(0, 0, 0, 0.08);
        border-color: rgba(255, 255, 255, 0.12);
    }

    /* Session management section styling */
    .session-management-section {
        margin-top: 1.5rem;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 15px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(8px);
    }

    .session-info {
        text-align: center;
    }

    .session-info h3 {
        color: var(--text);
        font-size: 1.2rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }

    .session-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        flex-wrap: wrap;
    }

    .btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        padding: 0.6rem 1.2rem;
        color: var(--text);
        font-weight: 500;
        transition: all 0.3s ease;
        cursor: pointer;
        font-size: 0.9rem;
    }

    .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.25);
        transform: translateY(-1px);
    }

    .btn-secondary.danger {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #ef4444;
    }

    .btn-secondary.danger:hover {
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.4);
    }

    /* Enhanced card-like sections */
    :global(.card) {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        padding: 1.5rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
        margin-bottom: 1.5rem;
    }

    :global(.card:hover) {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        border-color: rgba(255, 255, 255, 0.15);
    }

    /* Progress indicators */
    :global(.progress-container) {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
        padding: 1rem;
        margin: 1rem 0;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* File drop zone enhancements */
    :global(.drop-zone) {
        border: 2px dashed rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        padding: 3rem 2rem;
        text-align: center;
        transition: all 0.3s ease;
        background: rgba(255, 255, 255, 0.02);
        position: relative;
        overflow: hidden;
    }

    :global(.drop-zone::before) {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
        transition: left 0.6s ease;
    }

    :global(.drop-zone:hover::before) {
        left: 100%;
    }

    :global(.drop-zone.dragover) {
        border-color: var(--accent);
        background: rgba(var(--accent-rgb), 0.05);
        transform: scale(1.02);
    }

    /* Button enhancements */
    :global(.btn-primary) {
        background: linear-gradient(135deg, var(--accent), var(--accent-hover));
        border: none;
        border-radius: 12px;
        padding: 0.8rem 2rem;
        font-weight: 600;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(var(--accent-rgb), 0.3);
        position: relative;
        overflow: hidden;
    }

    :global(.btn-primary:hover) {
        transform: translateY(-2px);
        box-shadow: 0 6px 25px rgba(var(--accent-rgb), 0.4);
    }

    :global(.btn-primary::before) {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        transition: left 0.5s ease;
    }

    :global(.btn-primary:hover::before) {
        left: 100%;
    }

    /* Text areas and inputs */
    :global(.text-input, .textarea) {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 1rem;
        transition: all 0.3s ease;
        backdrop-filter: blur(5px);
    }

    :global(.text-input:focus, .textarea:focus) {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.1);
        background: rgba(255, 255, 255, 0.08);
    }

    /* Enhanced spacing and layout */
    :global(.section-spacing) {
        margin: 2rem 0;
    }

    :global(.content-spacing) {
        margin: 1.5rem 0;
    }

    /* Loading states */
    :global(.loading-shimmer) {
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.05) 100%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
    }

    @keyframes shimmer {
        0% {
            background-position: -200% 0;
        }
        100% {
            background-position: 200% 0;
        }    }    /* Override SettingsCategory default padding for clipboard page */
    :global(.settings-content) {
        padding: 0.25rem !important;
        gap: 0.5rem !important;
    }
    
    @media screen and (max-width: 750px) {
        :global(.settings-content) {
            padding: 0.1rem !important;
            gap: 0.25rem !important;
        }
    }    /* Responsive Design */    /* PC/Desktop 优化 - 1024px 及以上 */
    @media (min-width: 1024px) {
        .clipboard-container {
            display: flex;
            flex-direction: column;
        }
        
        .tab-content {
            flex: 1;
            padding: 1rem;
            /* 确保子组件可以使用横向布局 */
            display: flex;
            flex-direction: column;
        }
        
        .tab-content::-webkit-scrollbar {
            width: 8px;
        }
        
        .tab-content::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }
        
        .tab-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 4px;
        }
        
        .tab-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.25);
        }
        
        /* 确保内容区域不会溢出 */
        .session-management-section {
            flex-shrink: 0;
        }
    }    /* 超大桌面屏幕优化 - 1440px 及以上 */
    @media (min-width: 1440px) {
        .tab-content {
            padding: 1.5rem;
        }
    }/* 平板优化 - 768px 到 1023px */    @media (min-width: 768px) and (max-width: 1023px) {
        .clipboard-container {
            overflow-y: visible;
        }
        
        .tab-content {
            overflow-y: visible;
        }
    }
    
    @media (max-width: 768px) {
        .clipboard-container {
            padding: 0.75rem;
            margin: 0.75rem;
            border-radius: 16px;
        }

        .clipboard-header h1 {
            font-size: 1.9rem;
        }

        :global(.card) {
            padding: 0.75rem;
        }

        :global(.tab-content) {
            padding: 0.75rem;
            margin-top: 0.5rem;
        }
    }    @media (max-width: 480px) {
        .clipboard-container {
            margin: 0.5rem;
            padding: 0.5rem;
            max-height: 90vh;
            overflow-y: auto;
        }

        .clipboard-header h1 {
            font-size: 1.6rem;
        }

        :global(.drop-zone) {
            padding: 1.5rem 1rem;
        }
    }
</style>
