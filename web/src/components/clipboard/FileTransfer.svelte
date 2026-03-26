<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { t } from '$lib/i18n/translations';
    import SettingsCategory from '$components/settings/SettingsCategory.svelte';
    import ActionButton from '$components/buttons/ActionButton.svelte';
    
    const dispatch = createEventDispatcher();
    
    export let files: File[];
    export let receivedFiles: any[];
    export let sendingFiles: boolean;
    export let receivingFiles: boolean;
    export let transferProgress: number;
    export let dragover: boolean;
    export let peerConnected: boolean;
    export let isTransferring: boolean = false; // 新增：传输状态
    
    let fileInput: HTMLInputElement;
    let showReceivedNotification = false; // 新文件接收通知
    let isMobile = false; // 检测是否为移动端
    
    // 检测屏幕尺寸
    function checkScreenSize() {
        if (typeof window !== 'undefined') {
            isMobile = window.innerWidth < 1024; // 1024px以下认为是移动端/平板
        }
    }
    
    // 检测是否有新接收的文件
    let previousReceivedCount = receivedFiles.length;
    $: {
        if (receivedFiles.length > previousReceivedCount) {
            // 只在移动端显示通知
            checkScreenSize();
            if (isMobile) {
                showReceivedNotification = true;
                setTimeout(() => {
                    showReceivedNotification = false;
                }, 3000); // 3秒后自动隐藏
            }
        }
        previousReceivedCount = receivedFiles.length;
    }
    
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB file size limit
    const RECEIVED_FILES_SCROLL_GUARD_COUNT = 200; // Desktop-only safety cap for very large lists

    function addSelectedFiles(candidateFiles: File[]): void {
        const oversizedFiles = candidateFiles.filter(file => file.size > MAX_FILE_SIZE);
        if (oversizedFiles.length > 0) {
            const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
            const oversizedNames = oversizedFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
            alert(`Some files exceed ${maxSizeMB}MB and cannot be sent:\\n${oversizedNames}`);
        }

        const validFiles = candidateFiles.filter(file => file.size <= MAX_FILE_SIZE);
        if (validFiles.length === 0) {
            return;
        }

        // Keep selected files visible and let user manually confirm sending.
        dispatch('filesSelected', { files: validFiles });
    }

    function handleFileSelect(event: Event): void {
        if (isTransferring) {
            return;
        }

        const target = event.target as HTMLInputElement;
        if (target.files) {
            dispatch('fileSelectionComplete');
            addSelectedFiles(Array.from(target.files));
        }
    }

    function handleFileInputClick() {
        if (!isTransferring) {
            dispatch('prepareFileSelection');
            fileInput?.click();
        }
    }

    function handleFileInputFocus() {
        dispatch('prepareFileSelection');
    }

    function handleDragOver(event: DragEvent): void {
        if (isTransferring) {
            return;
        }

        event.preventDefault();
        dragover = true;
    }

    function handleDragLeave(): void {
        if (isTransferring) {
            return;
        }

        dragover = false;
    }

    function handleDrop(event: DragEvent): void {
        if (isTransferring) {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        dragover = false;

        if (event.dataTransfer?.files) {
            addSelectedFiles(Array.from(event.dataTransfer.files));
        }
    }

    function removeFile(index: number): void {
        dispatch('removeFile', { index });
    }

    function sendFiles(): void {
        dispatch('sendFiles');
    }

    function cancelSending(): void {
        dispatch('cancelSending');
    }

    function cancelReceiving(): void {
        dispatch('cancelReceiving');
    }

    function downloadReceivedFile(file: any): void {
        dispatch('downloadFile', { file });
    }

    function removeReceivedFile(index: number): void {
        dispatch('removeReceivedFile', { index });
    }

    function formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Lifecycle: detect viewport for mobile-specific notification behavior
    import { onMount, onDestroy } from 'svelte';
    
    let resizeHandler: () => void;
    
    onMount(() => {
        checkScreenSize();
        resizeHandler = () => checkScreenSize();
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', resizeHandler);
        }
    });
    
    onDestroy(() => {
        if (typeof window !== 'undefined' && resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
        }
    });
</script>

<SettingsCategory title={$t("clipboard.file_transfer.title")} sectionId="file-transfer">
    <!-- 新文件接收通知 -->
    {#if showReceivedNotification}
        <div class="received-notification">
            <div class="notification-content">
                <span class="notification-icon">📥</span>
                <span class="notification-text">{$t("clipboard.file_transfer.new_file_received")}</span>
            </div>
        </div>
    {/if}
    
    <div class="file-transfer-section" class:has-received-files={receivedFiles.length > 0}>
        <div class="send-files">
            <h4>{$t("clipboard.file_transfer.send_files")}</h4>
            
            <div
                class="file-drop-zone"
                class:dragover
                class:disabled={isTransferring}
                on:dragover={handleDragOver}
                on:dragleave={handleDragLeave}
                on:drop={handleDrop}
                role="button"
                tabindex={isTransferring ? -1 : 0}
                on:click={handleFileInputClick}
                on:keydown={(e) => !isTransferring && e.key === 'Enter' && handleFileInputClick()}
            >
                {#if isTransferring}
                    <p>🚫 {$t("clipboard.file_transfer.transfer_in_progress")}</p>
                {:else}
                    <p>{$t("clipboard.file_transfer.drop_zone_text")}</p>
                {/if}
                <input
                    bind:this={fileInput}
                    type="file"
                    multiple
                    disabled={isTransferring}
                    on:change={handleFileSelect}
                    on:focus={handleFileInputFocus}
                    style="display: none;"
                />
            </div>

            {#if files.length > 0 && !sendingFiles}
                <div class="selected-files-panel">
                    <div class="file-list selected-files-list">
                        <h5>{$t("clipboard.file_transfer.send_files")}</h5>
                        {#each files as file, index (file.name + index)}
                            <div class="file-item">
                                <span class="file-name">{file.name}</span>
                                <span class="file-size">({formatFileSize(file.size)})</span>
                                <button
                                    class="remove-file"
                                    on:click={() => removeFile(index)}
                                    aria-label={$t("clipboard.file_transfer.remove")}
                                >
                                    ×
                                </button>
                            </div>
                        {/each}
                    </div>

                    <div class="selected-files-footer">
                        {#if !peerConnected}
                            <div class="connection-warning">
                                {$t("clipboard.waiting_peer")}
                            </div>
                        {:else}
                            <ActionButton
                                id="confirm-send-files"
                                disabled={files.length === 0 || isTransferring || sendingFiles}
                                click={sendFiles}
                            >
                                {$t("clipboard.send")}
                            </ActionButton>
                        {/if}
                    </div>
                </div>
            {/if}

            {#if sendingFiles}
                <div class="progress-section">
                    <div class="progress-header">
                        <h4>{$t("clipboard.file_transfer.sending_progress")}: {Math.round(transferProgress)}%</h4>
                        <ActionButton
                            id="cancel-sending"
                            disabled={false}
                            click={cancelSending}
                        >
                            {$t("clipboard.file_transfer.cancel_sending")}
                        </ActionButton>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: {transferProgress}%"></div>
                    </div>
                    {#if files.length > 0}
                        <div class="sending-files">
                            <h5>{$t("clipboard.file_transfer.sending_files")}</h5>
                            {#each files as file, index (file.name + index)}
                                <div class="file-item sending">
                                    <span class="file-name">{file.name}</span>
                                    <span class="file-size">({formatFileSize(file.size)})</span>
                                    <span class="sending-indicator">📤</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>

        <div class="received-files">
            <h4>{$t("clipboard.received_files")}</h4>
            
            {#if receivingFiles}
                <div class="progress-section">
                    <div class="progress-header">
                        <h4>{$t("clipboard.file_transfer.receiving_progress")}: {Math.round(transferProgress)}%</h4>
                        <ActionButton
                            id="cancel-receiving"
                            disabled={false}
                            click={cancelReceiving}
                        >
                            {$t("clipboard.file_transfer.cancel_receiving")}
                        </ActionButton>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: {transferProgress}%"></div>
                    </div>
                </div>
            {/if}
            
            {#if receivedFiles.length > 0}
                <div
                    class="file-list"
                    class:desktop-scroll-guard={receivedFiles.length > RECEIVED_FILES_SCROLL_GUARD_COUNT}
                >
                    {#each receivedFiles as file, index (file.name + index)}
                        <div class="file-item">
                            <span class="file-name">{file.name}</span>
                            <span class="file-size">({formatFileSize(file.size)})</span>
                            <div class="file-actions">
                                <button
                                    class="download-btn"
                                    on:click={() => downloadReceivedFile(file)}
                                >
                                    {$t("clipboard.file_transfer.download")}
                                </button>
                                <button
                                    class="remove-file"
                                    on:click={() => removeReceivedFile(index)}
                                    aria-label={$t("clipboard.file_transfer.remove")}
                                >
                                    ❌
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {:else if !receivingFiles}
                <div class="empty-state">
                    {$t("clipboard.file_transfer.no_received_files")}
                </div>
            {/if}
        </div>
    </div>
</SettingsCategory>

<style>
    .file-transfer-section {
        display: flex;
        flex-direction: column;
        gap: 2.5rem;
        padding: 1rem;
    }

    .send-files, .received-files {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        padding: 2rem;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(8px);
        transition: all 0.3s ease;
    }

    .send-files:hover, .received-files:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .send-files h4, .received-files h4 {
        margin: 0 0 1rem 0;
        font-size: 1.1rem;
        font-weight: 600;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .file-drop-zone {
        border: 2px dashed rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        padding: 3rem 2rem;
        text-align: center;
        transition: all 0.3s ease;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.005) 100%);
        cursor: pointer;
        position: relative;
        overflow: hidden;
    }

    .file-drop-zone::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.1), transparent);
        transition: left 0.5s ease;
    }

    .file-drop-zone:hover {
        border-color: rgba(102, 126, 234, 0.4);
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(102, 126, 234, 0.15);
    }

    .file-drop-zone:hover::before {
        left: 100%;
    }

    .file-drop-zone.dragover {
        border-color: rgba(102, 126, 234, 0.6);
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
        transform: scale(1.02);
        box-shadow: 0 12px 35px rgba(102, 126, 234, 0.25);
    }

    .file-drop-zone.disabled {
        border-color: rgba(255, 255, 255, 0.1);
        background: linear-gradient(135deg, rgba(128, 128, 128, 0.02) 0%, rgba(128, 128, 128, 0.005) 100%);
        cursor: not-allowed;
        opacity: 0.6;
        pointer-events: none;
    }

    .file-drop-zone.disabled p {
        color: rgba(255, 255, 255, 0.5);
    }

    .file-drop-zone.disabled:hover {
        border-color: rgba(255, 255, 255, 0.1);
        background: linear-gradient(135deg, rgba(128, 128, 128, 0.02) 0%, rgba(128, 128, 128, 0.005) 100%);
        transform: none;
        box-shadow: none;
    }

    .file-drop-zone.disabled::before {
        display: none;
    }

    .file-drop-zone p {
        margin-bottom: 1rem;
        color: var(--secondary);
        font-size: 1.1rem;
        font-weight: 500;
        position: relative;
        z-index: 1;
    }

    /* 新文件接收通知样式 */
    .received-notification {
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(34, 197, 94, 0.3);
        animation: slideDown 0.3s ease-out;
    }

    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 500;
        font-size: 0.9rem;
    }

    .notification-icon {
        font-size: 1.1rem;
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }

    .file-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 1rem;
    }

    .selected-files-panel {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-height: 0;
    }

    .selected-files-footer {
        display: flex;
        justify-content: center;
    }

    .file-list h5 {
        margin: 0 0 1rem 0;
        font-weight: 600;
        color: var(--text);
        font-size: 0.95rem;
    }

    .file-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: all 0.3s ease;
        backdrop-filter: blur(4px);
    }

    .file-item:hover {
        transform: translateY(-1px);
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .file-name {
        flex: 1;
        font-weight: 500;
        color: var(--text);
        word-break: break-all;
    }

    .file-size {
        color: var(--secondary);
        font-size: 0.9rem;
        font-weight: 400;
    }

    .file-actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
    }

    .download-btn {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
        border: 1px solid rgba(102, 126, 234, 0.2);
        color: #667eea;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 500;
        transition: all 0.3s ease;
        backdrop-filter: blur(4px);
    }

    .download-btn:hover {
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
        border-color: rgba(102, 126, 234, 0.4);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    }

    .remove-file {
        background: rgba(244, 67, 54, 0.1);
        border: 1px solid rgba(244, 67, 54, 0.2);
        color: #f44336;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 8px;
        transition: all 0.3s ease;
        font-size: 0.9rem;
        backdrop-filter: blur(4px);
    }

    .remove-file:hover {
        background: rgba(244, 67, 54, 0.2);
        border-color: rgba(244, 67, 54, 0.4);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(244, 67, 54, 0.2);
    }

    .progress-section {
        margin-top: 1.5rem;
        padding: 1.5rem;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(4px);
    }

    .progress-section h4 {
        margin: 0 0 1rem 0;
        color: var(--text);
        font-size: 1rem;
        font-weight: 600;
    }

    .progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .progress-header h4 {
        margin: 0;
        flex: 1;
    }

    .connection-warning {
        text-align: center;
        color: #ff9800;
        background: rgba(255, 152, 0, 0.1);
        border: 1px solid rgba(255, 152, 0, 0.2);
        border-radius: 8px;
        padding: 0.75rem;
        font-size: 0.9rem;
        font-weight: 500;
        margin-top: 1rem;
    }

    .sending-files {
        margin-top: 1rem;
    }

    .sending-files h5 {
        margin: 0 0 0.75rem 0;
        font-weight: 600;
        color: var(--text);
        font-size: 0.95rem;
    }

    .file-item.sending {
        background: rgba(102, 126, 234, 0.1);
        border-color: rgba(102, 126, 234, 0.2);
    }

    .sending-indicator {
        color: #667eea;
        font-size: 1rem;
        animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    .progress-bar {
        width: 100%;
        height: 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        overflow: hidden;
        position: relative;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        transition: width 0.3s ease;
        border-radius: 6px;
        position: relative;
    }

    .progress-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(45deg, 
            transparent 25%, 
            rgba(255, 255, 255, 0.2) 25%, 
            rgba(255, 255, 255, 0.2) 50%, 
            transparent 50%, 
            transparent 75%, 
            rgba(255, 255, 255, 0.2) 75%);
        background-size: 20px 20px;
        animation: progress-stripes 1s linear infinite;
    }

    @keyframes progress-stripes {
        0% { background-position: 0 0; }
        100% { background-position: 20px 0; }
    }

    .empty-state {
        text-align: center;
        color: var(--secondary);
        font-style: italic;
        padding: 3rem 2rem;
        border: 2px dashed rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.005) 100%);
        transition: all 0.3s ease;
    }

    .empty-state:hover {
        border-color: rgba(255, 255, 255, 0.2);
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
    }    @media (max-width: 768px) {
        .file-transfer-section {
            gap: 1.5rem;
        }
        
        /* 确保移动端保持纵向布局 */
        .file-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            margin-top: 1rem;
        }
        
        /* 当有接收文件时，压缩发送区域 */
        .file-transfer-section.has-received-files .send-files {
            flex: 0 0 auto;
        }
        
        .file-transfer-section.has-received-files .send-files .file-drop-zone {
            padding: 1rem 0.75rem;
            min-height: 80px;
        }
        
        .file-transfer-section.has-received-files .send-files .file-drop-zone p {
            font-size: 0.9rem;
            margin-bottom: 0.5rem;
        }
        
        /* 突出显示接收文件区域 */
        .file-transfer-section.has-received-files .received-files {
            flex: 1;
            border: 2px solid rgba(34, 197, 94, 0.3);
            border-radius: 12px;
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(34, 197, 94, 0.02) 100%);
        }
        
        .file-drop-zone {
            padding: 1.5rem 1rem;
        }

        .file-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
        }

        .file-actions {
            align-self: flex-end;
        }
        
        /* 移动端通知位置调整 */
        .received-notification {
            top: 60px;
            left: 1rem;
            right: 1rem;
            transform: none;
            font-size: 0.85rem;
            padding: 0.6rem 1rem;
        }
    }    /* PC/Desktop 优化 - 1024px 及以上 - 横向布局 */
    @media (min-width: 1024px) {
        .file-transfer-section {
            flex-direction: row;
            gap: 2rem;
            padding: 0.5rem;
            align-items: stretch;
        }
        
        .send-files, .received-files {
            padding: 1.5rem;
            flex: 1;
            max-width: calc(50% - 1rem);
        }
        
        /* 调整发送文件区域 */
        .send-files {
            order: 1;
        }
        
        /* 调整接收文件区域 */
        .received-files {
            order: 2;
        }
        
        .file-list {
            max-height: none;
            overflow-y: visible;
        }
        
        /* PC端接收文件列表优化 - 网格布局 */
        .received-files .file-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 0.75rem;
            margin-top: 1rem;
        }

        .received-files .file-list.desktop-scroll-guard {
            max-height: min(70vh, 920px);
            overflow-y: auto;
            align-content: start;
            padding-right: 0.3rem;
        }
        
        /* PC端接收文件项优化 */
        .received-files .file-item {
            flex-direction: column;
            align-items: flex-start;
            padding: 1rem;
            min-height: 100px;
            justify-content: space-between;
        }
        
        .received-files .file-name {
            font-size: 0.9rem;
            line-height: 1.3;
            margin-bottom: 0.5rem;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
        }
        
        .received-files .file-size {
            font-size: 0.8rem;
            margin-bottom: 0.75rem;
        }
        
        .received-files .file-actions {
            width: 100%;
            justify-content: space-between;
            margin-top: auto;
        }
        
        .file-drop-zone {
            min-height: 140px;
            padding: 2rem 1.5rem;
        }
        
        /* PC端不显示通知（因为右侧接收区域很明显） */
        .received-notification {
            display: none;
        }
        
        /* 优化PC端文件列表滚动条 */
        .file-list::-webkit-scrollbar {
            width: 6px;
        }
        
        .file-list::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 3px;
        }
        
        .file-list::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }
        
        .file-list::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    }

    /* 超大桌面屏幕优化 - 1440px 及以上 */
    @media (min-width: 1440px) {
        .file-transfer-section {
            gap: 2.5rem;
            padding: 1rem;
        }
        
        .send-files, .received-files {
            padding: 2rem;
        }
        
        .file-list {
            max-height: none;
        }
        
        /* 超大屏幕的网格布局优化 */
        .received-files .file-list {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1rem;
        }
        
        .received-files .file-item {
            min-height: 110px;
            padding: 1.2rem;
        }
        
        .received-files .file-name {
            font-size: 0.95rem;
            -webkit-line-clamp: 3;
            line-clamp: 3;
        }
        
        .file-drop-zone {
            min-height: 160px;
            padding: 2.5rem 2rem;
        }
        
        /* 超大屏幕也不显示通知 */
        .received-notification {
            display: none;
        }
    }/* 平板优化 - 768px 到 1023px */
    @media (min-width: 768px) and (max-width: 1023px) {
        .file-transfer-section {
            gap: 1.8rem;
            padding: 0.75rem;
            overflow-y: visible;
        }
        
        .send-files, .received-files {
            padding: 1.75rem;
        }
        
        .file-list {
            max-height: none;
            overflow-y: visible;
        }
    }

    /* 超小屏幕优化 - 480px 以下 */
    @media (max-width: 480px) {
        .file-transfer-section {
            gap: 1rem;
        }
        
        /* 极度压缩发送区域当有接收文件时 */
        .file-transfer-section.has-received-files .send-files .file-drop-zone {
            padding: 0.75rem 0.5rem;
            min-height: 60px;
        }
        
        .file-transfer-section.has-received-files .send-files .file-drop-zone p {
            font-size: 0.8rem;
            margin-bottom: 0.25rem;
        }
        
        /* 接收文件区域突出显示 */
        .file-transfer-section.has-received-files .received-files {
            margin-top: 0.5rem;
            box-shadow: 0 4px 15px rgba(34, 197, 94, 0.15);
        }
        
        .received-notification {
            top: 50px;
            font-size: 0.8rem;
            padding: 0.5rem 0.75rem;
        }
        
        .notification-content {
            gap: 0.25rem;
        }
        
        .notification-icon {
            font-size: 1rem;
        }
    }

    /* Mobile first-screen fit overrides for file transfer tab */
    @media (max-width: 768px) {
        :global(#file-transfer .heading-container) {
            display: none;
        }

        .file-transfer-section {
            height: calc(100vh - 250px);
            height: calc(100dvh - 250px);
            min-height: 0;
            gap: 0.6rem;
            padding: 0.2rem;
        }

        .send-files,
        .received-files {
            min-height: 0;
            padding: 0.75rem;
            gap: 0.55rem;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
        }

        .send-files {
            flex: 0 0 auto;
        }

        .received-files {
            flex: 1 1 auto;
        }

        .send-files h4,
        .received-files h4 {
            margin: 0;
            font-size: 0.88rem;
            line-height: 1.15;
        }

        .file-drop-zone {
            min-height: 72px;
            padding: 0.75rem 0.6rem;
            border-radius: 10px;
        }

        .file-drop-zone p {
            margin: 0;
            font-size: 0.82rem;
            line-height: 1.25;
        }

        .file-list {
            margin-top: 0.35rem;
            gap: 0.4rem;
            min-height: 0;
        }

        .received-files .file-list {
            flex: 1;
            min-height: 0;
            max-height: none;
            overflow: auto;
        }

        .file-item {
            padding: 0.5rem 0.55rem;
            gap: 0.35rem;
            border-radius: 10px;
        }

        .file-name {
            font-size: 0.82rem;
            line-height: 1.25;
        }

        .file-size {
            font-size: 0.74rem;
        }

        .file-actions {
            gap: 0.35rem;
            align-self: stretch;
            justify-content: flex-end;
        }

        .download-btn,
        .remove-file {
            min-height: 30px;
            padding: 0.35rem 0.55rem;
            font-size: 0.76rem;
        }

        .remove-file {
            padding: 0.3rem 0.45rem;
        }

        .empty-state {
            min-height: 64px;
            padding: 0.7rem 0.6rem;
            font-size: 0.8rem;
        }

        .progress-section {
            margin-top: 0.45rem;
            padding: 0.6rem;
        }

        .progress-header {
            margin-bottom: 0.45rem;
            gap: 0.35rem;
        }

        .progress-header h4 {
            font-size: 0.8rem;
            line-height: 1.2;
        }

        .progress-bar {
            height: 8px;
        }

        .progress-header :global(.action-button) {
            min-height: 30px;
            padding: 0.3rem 0.55rem;
            font-size: 0.74rem;
        }

        .connection-warning {
            margin-top: 0.45rem;
            padding: 0.45rem;
            font-size: 0.78rem;
        }
    }

    @media (max-width: 480px) {
        .file-transfer-section {
            height: calc(100vh - 220px);
            height: calc(100dvh - 220px);
            gap: 0.5rem;
        }

        .send-files,
        .received-files {
            padding: 0.62rem;
            border-radius: 10px;
        }

        .send-files {
            flex: 0 0 auto;
        }

        .file-drop-zone {
            min-height: 62px;
            padding: 0.62rem 0.45rem;
        }

        .file-drop-zone p {
            font-size: 0.78rem;
        }

        .file-item {
            padding: 0.42rem 0.45rem;
        }

        .download-btn,
        .remove-file {
            font-size: 0.72rem;
        }
    }

    .selected-files-list {
        max-height: 230px;
        overflow-y: auto;
    }

    .selected-files-footer :global(#confirm-send-files) {
        width: 100%;
    }

    @media (max-width: 768px) {
        .selected-files-list {
            max-height: clamp(120px, 26dvh, 240px);
        }
    }

    @media (max-width: 480px) {
        .selected-files-list {
            max-height: clamp(100px, 22dvh, 200px);
        }
    }

</style>
