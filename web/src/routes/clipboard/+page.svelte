<script lang="ts">
    import { t } from '$lib/i18n/translations';
    import { onDestroy, onMount } from 'svelte';
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

    // Constants
    const CHUNK_SIZE = 64 * 1024; // 64KB chunks for file transfer

    // State variables - bound to clipboard manager
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
    
    // Clipboard manager instance
    let clipboardManager: ClipboardManager;    // Subscribe to clipboard state
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

// Lifecycle functions
    onMount(async () => {
        // 立即清除任何错误状态
        errorMessage = '';
        showError = false;
        
        clipboardManager = new ClipboardManager();
        
        // 再次确保清除错误状态
        clipboardManager.clearError();
        
        // Check for session parameter in URL
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionParam = urlParams.get('session');
            if (sessionParam) {
                joinCode = sessionParam;
                await clipboardManager.joinSession(joinCode);
            }
        }
    });    onDestroy(() => {
        clipboardManager?.cleanup();
    });
</script>

<svelte:head>
    <title>竹子下载 | {$t("clipboard.title")}</title>
    <meta property="og:title" content="竹子下载 | {$t("clipboard.title")}" />
    <meta property="og:description" content={$t("clipboard.description")} />
    <meta property="description" content={$t("clipboard.description")} />
</svelte:head>

<div class="clipboard-container">
    <div class="clipboard-header">
        <h1>{$t("clipboard.title")}</h1>
        <div class="description-container">
            <p class="description-main">{$t("clipboard.description")}</p>
            <p class="description-subtitle">{$t("clipboard.description_subtitle")}</p>
        </div>    </div>

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
        <div class="tab-content">
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
        margin-bottom: 0.5rem;
        padding: 0.25rem 0;
        position: relative;
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
    }    .clipboard-header h1 {
        margin-bottom: 0.2rem;
        font-size: 2.2rem;
        font-weight: 700;
        background: linear-gradient(135deg, var(--accent), var(--accent-hover));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-top: 0.3rem;
    }.clipboard-header p {
        color: var(--subtext);
        font-size: 1.1rem;
        font-weight: 400;
        opacity: 0.8;
    }    .description-container {
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
        /* PC端高度限制 - 增加高度 */
        max-height: 65vh;
        overflow-y: auto;
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
            max-height: 95vh;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }
        
        .tab-content {
            max-height: 85vh;
            overflow-y: auto;
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
        .clipboard-container {
            max-height: 98vh;
        }
        
        .tab-content {
            max-height: 90vh;
            padding: 1.5rem;
        }
    }/* 平板优化 - 768px 到 1023px */    @media (min-width: 768px) and (max-width: 1023px) {
        .clipboard-container {
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .tab-content {
            max-height: 70vh;
            overflow-y: auto;
        }
    }
    
    @media (max-width: 768px) {
        .clipboard-container {
            padding: 0.75rem;
            margin: 0.75rem;
            border-radius: 16px;
            max-height: 85vh;
            overflow-y: auto;
        }

        .clipboard-header h1 {
            font-size: 1.9rem;
        }        .clipboard-header {
            padding: 0.5rem 0;
            margin-bottom: 0.75rem;
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
