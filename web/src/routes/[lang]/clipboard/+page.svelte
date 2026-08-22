<script lang="ts">
    import { t } from '$lib/i18n/translations';
    import { onDestroy, onMount, tick } from 'svelte';
    import { page } from '$app/stores';
// Import clipboard components
    import FileTransfer from '$components/clipboard/FileTransfer.svelte';
    import SessionManager from '$components/clipboard/SessionManager.svelte';
    import TabNavigation from '$components/clipboard/TabNavigation.svelte';
    import TextSharing from '$components/clipboard/TextSharing.svelte';
// Import clipboard manager
    import {
        ClipboardManager,
        clipboardState,
        type ClipboardMessage,
        type FileItem,
    } from '$lib/clipboard/clipboard-manager';
    import { getClerkToken } from '$lib/state/clerk';
    import env from '$lib/env';
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
    let sessionType: 'random' | 'personal' = 'random';
    let qrCodeUrl = '';
    let isLAN = false; // 新增：LAN状态

    // Navigation state
    let activeTab: 'files' | 'text' = 'files';
    
    // File transfer state
    let files: File[] = [];
    let receivedFiles: FileItem[] = [];
    let textContent = '';
    let messages: ClipboardMessage[] = [];
    const fallbackHost = env.HOST || 'freesavevideo.online';
    $: currentLang = $page.url.pathname.match(/^\/([a-z]{2})/)?.[1] || 'en';
    $: isEnglish = currentLang === 'en';
    $: canonicalUrl = `https://${fallbackHost}/${currentLang}/clipboard`;
    $: transferJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        '@id': `${canonicalUrl}#app`,
        name: 'FreeSaveVideo File Transfer',
        url: canonicalUrl,
        applicationCategory: 'UtilitiesApplication',
        applicationSubCategory: 'File Transfer',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        description: String($t('general.seo.transfer.description')),
        featureList: ['cross-device file transfer', 'text sharing', 'QR code join', 'WebRTC data channel'],
    };
    $: transferFaqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: 'Do I need to upload files to a cloud drive first?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'No. The two browsers connect through a WebRTC data channel and transfer the selected files directly when the connection allows it.',
                },
            },
            {
                '@type': 'Question',
                name: 'How do I connect my phone and computer?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Create a transfer session on one device, then scan its QR code or enter the session code on the other device.',
                },
            },
            {
                '@type': 'Question',
                name: 'Can I send text as well as files?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Yes. After both devices connect, switch between the Files and Text tabs to transfer files or copy text between them.',
                },
            },
        ],
    };
    let dragover = false;
    let sendingFiles = false;    let receivingFiles = false;
    let transferProgress = 0;
    let isTransferring = false; // 新增：传输状态
    let currentReceivingFile: ReceivingFile | null = null;
    let dataChannel: RTCDataChannel | null = null;
    let peerConnection: RTCPeerConnection | null = null;
    
    // Error handling state
    let errorMessage = '';
    let errorCode = '';
    let canReplaceSession = false;
    let isReleasingPeer = false;
    let isLeavingSession = false;
    let showError = false;
    let waitingForCreator = false;
    let showLinkCopied = false;
    let hasSignedInSession = false;
    let personalStatusLoading = false;
    let personalRecommendedAction: 'create' | 'join' | 'resume' | 'manage' | 'restart' = 'create';
    let personalOnlinePeers = 0;
    let personalMaxPeers = 2;
    let personalCurrentDeviceConnected = false;
    let personalSessionState: 'empty' | 'waiting_joiner' | 'connected' | 'waiting_creator_reconnect' = 'empty';
    let personalStatusPollTimer: ReturnType<typeof setInterval> | null = null;
    let detachPersonalStatusListeners: (() => void) | null = null;

    const COMPACT_VIEWPORT_MAX_WIDTH = 768;
    const HEADER_AUTO_COLLAPSE_DELAY_MS = 3000;

    let headerCollapsed = false;
    let headerManualOverride: 'collapsed' | 'expanded' | null = null;
    let isCompactViewport = false;
    let shouldCollapseAutomatically = false;
    let autoCollapseWasActive = false;
    let initialHeaderCollapseTimer: ReturnType<typeof setTimeout> | null = null;
    let hasQueuedInitialHeaderCollapse = false;
    let tabContentEl: HTMLDivElement | null = null;
    let detachViewportListener: (() => void) | null = null;
    
    // Clipboard manager instance
    let clipboardManager: ClipboardManager;
    let unsubscribeClipboardState: (() => void) | null = null;

    $: if (clipboardManager && !unsubscribeClipboardState) {
        unsubscribeClipboardState = clipboardState.subscribe(state => {
            sessionId = state.sessionId;
            isConnected = state.isConnected;
            isCreating = state.isCreating;
            isJoining = state.isJoining;
            isCreator = state.isCreator;
            peerConnected = state.peerConnected;
            sessionType = state.sessionType;
            qrCodeUrl = state.qrCodeUrl;
            isLAN = state.isLAN; // 新增：订阅LAN状态
            activeTab = state.activeTab;
            files = state.files;
            receivedFiles = state.receivedFiles;
            // Don't overwrite textContent - it's managed by the TextSharing component binding
            // textContent = state.textContent;
            messages = state.messages;
            dragover = state.dragover;
            sendingFiles = state.sendingFiles;
            receivingFiles = state.receivingFiles;
            transferProgress = state.transferProgress;
            isTransferring = state.isTransferring; // 新增：订阅传输状态
            dataChannel = state.dataChannel;
            peerConnection = state.peerConnection;
            errorMessage = state.errorMessage;
            errorCode = state.errorCode;
            canReplaceSession = state.canReplaceSession;
            isReleasingPeer = state.isReleasingPeer;
            isLeavingSession = state.isLeavingSession;
            showError = state.showError;
            waitingForCreator = state.waitingForCreator;
            personalStatusLoading = state.personalStatusLoading;
            personalRecommendedAction = state.personalRecommendedAction;
            personalOnlinePeers = state.personalOnlinePeers;
            personalMaxPeers = state.personalMaxPeers;
            personalCurrentDeviceConnected = state.personalCurrentDeviceConnected;
            personalSessionState = state.personalSessionState;
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

    function handleEnterPersonalSession() {
        void clipboardManager?.enterPersonalSession();
    }

    function handleLeaveSession() {
        const confirmationKey = isCreator
            ? 'clipboard.end_session_confirm'
            : 'clipboard.leave_session_confirm';
        if (!window.confirm($t(confirmationKey))) return;
        clipboardManager?.leaveSession();
    }

    function handleReplaceOccupiedSession() {
        if (!window.confirm($t('clipboard.replace_device_confirm'))) return;
        clipboardManager?.replaceOccupiedPersonalSession();
    }

    function handleRemoveConnectedPeer() {
        if (!window.confirm($t('clipboard.release_peer_confirm'))) return;
        clipboardManager?.removeConnectedPeer();
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
    function handleSendText(event?: CustomEvent<{ text: string }>) {
        const text = event?.detail?.text || textContent;
        if (text.trim()) {
            void clipboardManager?.sendText(text);
        }
    }

    function handleRetryText(event: CustomEvent<{ messageId: string }>) {
        void clipboardManager?.retryText(event.detail.messageId);
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

    function clearInitialHeaderCollapseTimer() {
        if (initialHeaderCollapseTimer) {
            clearTimeout(initialHeaderCollapseTimer);
            initialHeaderCollapseTimer = null;
        }
    }

    function scheduleInitialHeaderCollapse() {
        if (!isCompactViewport || hasQueuedInitialHeaderCollapse) {
            return;
        }

        hasQueuedInitialHeaderCollapse = true;
        clearInitialHeaderCollapseTimer();

        initialHeaderCollapseTimer = setTimeout(() => {
            initialHeaderCollapseTimer = null;

            if (!isCompactViewport) return;
            if (headerManualOverride !== null) return;
            if (shouldCollapseAutomatically) return;

            headerCollapsed = true;
            headerManualOverride = 'collapsed';
        }, HEADER_AUTO_COLLAPSE_DELAY_MS);
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
            hasSignedInSession = Boolean(await getClerkToken());
            if (hasSignedInSession) {
                await clipboardManager.loadPersonalSessionStatus();
                const refreshPersonalStatus = () => {
                    if (document.visibilityState === 'visible' && (!isConnected || !peerConnected)) {
                        void clipboardManager?.loadPersonalSessionStatus();
                    }
                };
                const handleVisibilityChange = () => refreshPersonalStatus();
                window.addEventListener('focus', refreshPersonalStatus);
                document.addEventListener('visibilitychange', handleVisibilityChange);
                personalStatusPollTimer = setInterval(refreshPersonalStatus, 15_000);
                detachPersonalStatusListeners = () => {
                    window.removeEventListener('focus', refreshPersonalStatus);
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                };
            }
            const viewportQuery = window.matchMedia(`(max-width: ${COMPACT_VIEWPORT_MAX_WIDTH}px)`);

            const applyViewportMatch = (matches: boolean) => {
                isCompactViewport = matches;
                if (!matches) {
                    clearInitialHeaderCollapseTimer();
                    return;
                }

                scheduleInitialHeaderCollapse();
            };

            applyViewportMatch(viewportQuery.matches);

            const handleViewportChange = (event: MediaQueryListEvent) => {
                applyViewportMatch(event.matches);
            };

            viewportQuery.addEventListener('change', handleViewportChange);
            detachViewportListener = () => viewportQuery.removeEventListener('change', handleViewportChange);

            const urlParams = new URLSearchParams(window.location.search);
            const sessionParam = urlParams.get('session');
            const modeParam = (urlParams.get('mode') || '').toLowerCase();
            const autoStartPersonal = urlParams.get('autostart') === '1';
            const autoJoinPersonal = urlParams.get('autojoin') === '1';
            if (sessionParam) {
                joinCode = sessionParam;
                await clipboardManager.joinSession(joinCode);
            } else if (modeParam === 'personal' && hasSignedInSession && (autoStartPersonal || autoJoinPersonal)) {
                await clipboardManager.enterPersonalSession();
            }
        }
    });

    onDestroy(() => {
        clearInitialHeaderCollapseTimer();
        detachViewportListener?.();
        if (personalStatusPollTimer) clearInterval(personalStatusPollTimer);
        personalStatusPollTimer = null;
        detachPersonalStatusListeners?.();
        detachPersonalStatusListeners = null;
        unsubscribeClipboardState?.();
        unsubscribeClipboardState = null;
        clipboardManager?.dispose();
    });
</script>

<svelte:head>
    <title>{$t("general.seo.transfer.title")}</title>
    <meta name="description" content={$t("general.seo.transfer.description")} />
    <meta name="keywords" content={$t("general.seo.transfer.keywords")} />
    <meta property="og:title" content={$t("general.seo.transfer.title")} />
    <meta property="og:description" content={$t("general.seo.transfer.description")} />
    <link rel="canonical" href={canonicalUrl} />
    {@html `<script type="application/ld+json">${JSON.stringify(transferJsonLd).replace(/</g, '\\u003c')}</script>`}
    {#if isEnglish}
        {@html `<script type="application/ld+json">${JSON.stringify(transferFaqJsonLd).replace(/</g, '\\u003c')}</script>`}
    {/if}
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
                {#if isConnected && peerConnected}
                    <div class="session-status">
                        <div class="status-badge">
                            <div class="status-dot connected"></div>
                            <span class="status-text">{$t('clipboard.peer_connected')}</span>
                        </div>
                        {#if isLAN}
                            <div class="status-badge lan" title={$t('clipboard.lan_direct')}>
                                <span class="status-icon">LAN</span>
                                <span class="status-text">{$t('clipboard.lan_direct')}</span>
                            </div>
                        {/if}
                    </div>
                {/if}
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
                {#if errorCode === 'SESSION_FULL_ONLINE' && canReplaceSession}
                    <button class="error-action" type="button" on:click={handleReplaceOccupiedSession}>
                        {$t('clipboard.replace_old_device')}
                    </button>
                {/if}
                <button class="error-close" on:click={handleClearError} aria-label="关闭">
                    ✕
                </button>
            </div>
        </div>
    {/if}

    {#if isConnected && peerConnected}

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
                    {messages}
                    {peerConnected}
                    on:sendText={handleSendText}
                    on:retryText={handleRetryText}
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
                    {#if isCreator && peerConnected}
                        <button class="btn-secondary release" on:click={handleRemoveConnectedPeer} disabled={isReleasingPeer}>
                            {isReleasingPeer ? $t('clipboard.releasing_peer_slot') : $t('clipboard.release_peer_slot')}
                        </button>
                    {/if}
                    <button class="btn-secondary danger" on:click={handleLeaveSession} disabled={isLeavingSession}>
                        {isLeavingSession
                            ? $t('clipboard.leaving_session')
                            : isCreator
                                ? $t('clipboard.end_session')
                                : $t('clipboard.leave_session')}
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
            {sessionType}
            {qrCodeUrl}
            {hasSignedInSession}
            {personalStatusLoading}
            {personalRecommendedAction}
            {personalOnlinePeers}
            {personalMaxPeers}
            {personalCurrentDeviceConnected}
            {personalSessionState}
            {isLeavingSession}
            on:createSession={handleCreateSession}
            on:joinSession={handleJoinSession}
            on:enterPersonalSession={handleEnterPersonalSession}
            on:leaveSession={handleLeaveSession}
            bind:joinCode
        />
    {/if}

    {#if isEnglish}
        <article class="transfer-guide" aria-labelledby="transfer-guide-title">
            <h2 id="transfer-guide-title">Send files from phone to computer without a cloud upload</h2>
            <p>
                FreeSaveVideo File Transfer connects two browsers with WebRTC. Create a session on one device,
                scan the QR code or enter the session code on the other, then send files or text between them.
            </p>

            <h3>How to transfer files between devices</h3>
            <ol>
                <li>Open this page on the device that will start the transfer and create a session.</li>
                <li>Scan the QR code with the second device, or enter the displayed session code.</li>
                <li>Select one or more files and keep both browser tabs open until the transfer finishes.</li>
            </ol>

            <h3>Why use a browser-to-browser transfer?</h3>
            <ul>
                <li>No cloud-drive account or temporary upload link is required.</li>
                <li>Files are split into small chunks, with missing chunks requested again when necessary.</li>
                <li>Devices on the same local network can use a direct LAN connection when available.</li>
                <li>The Text tab also moves links, notes, and short messages between devices.</li>
            </ul>

            <h3>Transfer tips</h3>
            <p>
                Keep both devices online and leave the transfer page open. For large files, avoid switching networks
                while the transfer is running. Only send files that you own or are authorized to share.
            </p>
        </article>
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
    }

    .transfer-guide {
        margin: 2.5rem auto 1rem;
        padding: 1.5rem;
        border: 1px solid rgba(128, 128, 128, 0.24);
        border-radius: 1rem;
        background: rgba(128, 128, 128, 0.06);
        line-height: 1.7;
        text-align: left;
    }

    .transfer-guide h2,
    .transfer-guide h3 {
        line-height: 1.3;
    }

    .transfer-guide h3 {
        margin-top: 1.5rem;
    }

    .transfer-guide li + li {
        margin-top: 0.45rem;
    }

    .clipboard-header {
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
        max-height: 280px;
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
            padding: 0.25rem 0.55rem;
            font-size: 0.72rem;
        }

        .header-toggle .toggle-label {
            font-size: 0.72rem;
        }

        .clipboard-header {
            margin-bottom: 0.35rem;
            padding: 0.12rem 0 0.45rem;
        }

        .clipboard-header::before {
            width: 46px;
            height: 3px;
        }

        .clipboard-header h1 {
            font-size: 1.55rem;
            margin-top: 0.15rem;
            margin-bottom: 0;
            line-height: 1.1;
        }

        .clipboard-header.collapsed h1 {
            font-size: 1.45rem;
            margin-bottom: 0;
        }
    }

    @media (max-width: 480px) {
        .header-toggle {
            padding: 0.2rem 0.45rem;
        }

        .header-toggle .toggle-icon {
            width: 14px;
            height: 14px;
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

    .error-action {
        flex-shrink: 0;
        padding: 0.5rem 0.8rem;
        color: #b42318;
        border: 1px solid rgba(239, 68, 68, 0.35);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.72);
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
    }

    .error-action:hover {
        background: #fff;
        border-color: rgba(239, 68, 68, 0.55);
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
        margin: 0.65rem 0 0;
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

    .status-badge.lan {
        background: rgba(59, 130, 246, 0.15);
        padding: 0.3rem 0.8rem;
        border-radius: 20px;
        border: 1px solid rgba(59, 130, 246, 0.3);
        margin-left: 1rem;
    }

    .status-badge.lan .status-text {
        color: #60a5fa;
        font-size: 0.85rem;
    }
    
    .status-badge.lan .status-icon {
        margin-right: 0.4rem;
        font-size: 0.9rem;
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

    .btn-secondary.release {
        background: rgba(245, 158, 11, 0.1);
        border-color: rgba(245, 158, 11, 0.32);
        color: #b56a08;
    }

    .btn-secondary.release:hover {
        background: rgba(245, 158, 11, 0.16);
        border-color: rgba(245, 158, 11, 0.45);
    }

    .btn-secondary.release:disabled {
        cursor: wait;
        opacity: 0.65;
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
            flex: 0 0 auto;
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
            padding: 0.55rem;
            margin: 0.45rem;
            border-radius: 14px;
            min-height: 70vh;
        }

        :global(.card) {
            padding: 0.75rem;
        }

        .tab-content {
            padding: 0.45rem;
            margin-top: 0.3rem;
        }

        .session-management-section {
            margin-top: 0.6rem;
            padding: 0.55rem 0.6rem;
            border-radius: 12px;
        }

        .session-info h3 {
            display: none;
        }

        .btn-secondary {
            padding: 0.45rem 0.9rem;
            font-size: 0.8rem;
            border-radius: 8px;
        }
    }

    @media (max-width: 480px) {
        .clipboard-container {
            margin: 0.35rem;
            padding: 0.42rem;
            max-height: none;
            overflow: visible;
        }

        .clipboard-header h1 {
            font-size: 1.35rem;
        }

        .tab-content {
            padding: 0.4rem;
        }

        .session-management-section {
            margin-top: 0.45rem;
            padding: 0.45rem 0.5rem;
        }

        :global(.drop-zone) {
            padding: 1.25rem 0.85rem;
        }
    }
</style>
