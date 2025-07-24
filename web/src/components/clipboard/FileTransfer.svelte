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
    let autoSendScheduled = false; // 防止重复自动发送的标志
    let pendingFiles: File[] = []; // 等待连接的文件
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
    
    function handleFileSelect(event: Event): void {
        // 如果正在传输文件，则不处理新的文件选择
        if (isTransferring) {
            return;
        }
        
        const target = event.target as HTMLInputElement;
        if (target.files) {
            const newFiles = Array.from(target.files);
            
            // 检查文件大小限制
            const oversizedFiles = newFiles.filter(file => file.size > MAX_FILE_SIZE);
            if (oversizedFiles.length > 0) {
                const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
                const oversizedNames = oversizedFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
                alert(`以下文件超过${maxSizeMB}MB限制，无法发送：\n${oversizedNames}`);
                
                // 只选择符合大小要求的文件
                const validFiles = newFiles.filter(file => file.size <= MAX_FILE_SIZE);
                if (validFiles.length === 0) {
                    return; // 如果没有有效文件，直接返回
                }
                dispatch('filesSelected', { files: validFiles });
                
                // 如果已连接且不在发送中，立即发送有效文件
                if (peerConnected && !sendingFiles) {
                    scheduleAutoSend();
                } else {
                    // 如果未连接，保存待发送文件
                    pendingFiles = validFiles;
                }
            } else {
                dispatch('filesSelected', { files: newFiles });
                
                // 如果已连接且不在发送中，立即发送
                if (peerConnected && !sendingFiles) {
                    scheduleAutoSend();
                } else {
                    // 如果未连接，保存待发送文件
                    pendingFiles = newFiles;
                }
            }
        }
    }

    function scheduleAutoSend(): void {
        if (!autoSendScheduled) {
            autoSendScheduled = true;
            setTimeout(() => {
                dispatch('sendFiles');
                autoSendScheduled = false;
                pendingFiles = []; // 清空待发送文件
            }, 100);
        }
    }

    function handleDragOver(event: DragEvent): void {
        // 如果正在传输文件，则不允许拖拽
        if (isTransferring) {
            return;
        }
        
        event.preventDefault();
        dragover = true;
    }

    function handleDragLeave(): void {
        // 如果正在传输文件，则不处理拖拽离开事件
        if (isTransferring) {
            return;
        }
        
        dragover = false;
    }

    function handleDrop(event: DragEvent): void {
        // 如果正在传输文件，则不处理拖拽放置
        if (isTransferring) {
            event.preventDefault();
            return;
        }
        
        event.preventDefault();
        dragover = false;
        if (event.dataTransfer?.files) {
            const droppedFiles = Array.from(event.dataTransfer.files);
            
            // 检查文件大小限制
            const oversizedFiles = droppedFiles.filter(file => file.size > MAX_FILE_SIZE);
            if (oversizedFiles.length > 0) {
                const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
                const oversizedNames = oversizedFiles.map(f => `${f.name} (${formatFileSize(f.size)})`).join(', ');
                alert(`以下文件超过${maxSizeMB}MB限制，无法发送：\n${oversizedNames}`);
                
                // 只处理符合大小要求的文件
                const validFiles = droppedFiles.filter(file => file.size <= MAX_FILE_SIZE);
                if (validFiles.length === 0) {
                    return; // 如果没有有效文件，直接返回
                }
                dispatch('filesSelected', { files: validFiles });
                
                // 如果已连接且不在发送中，立即发送有效文件
                if (peerConnected && !sendingFiles) {
                    scheduleAutoSend();
                } else {
                    // 如果未连接，保存待发送文件
                    pendingFiles = validFiles;
                }
            } else {
                dispatch('filesSelected', { files: droppedFiles });
                
                // 如果已连接且不在发送中，立即发送
                if (peerConnected && !sendingFiles) {
                    scheduleAutoSend();
                } else {
                    // 如果未连接，保存待发送文件
                    pendingFiles = droppedFiles;
                }
            }
        }
    }

    function removeFile(index: number): void {
        dispatch('removeFile', { index });
    }

    function sendFiles(): void {
        dispatch('sendFiles');
        pendingFiles = []; // 开始发送时清空待发送列表
    }

    function cancelSending(): void {
        dispatch('cancelSending');
        autoSendScheduled = false; // 取消时重置标志
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

    // 只监听连接状态变化，当从未连接变为连接时发送待发送文件
    let wasConnected = peerConnected;
    $: {
        // 连接状态从 false 变为 true
        if (peerConnected && !wasConnected && pendingFiles.length > 0 && !sendingFiles) {
            scheduleAutoSend();
        }
        wasConnected = peerConnected;
    }
    
    // 组件挂载时检测屏幕尺寸，并监听窗口大小变化
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
                on:click={() => !isTransferring && fileInput?.click()}
                on:keydown={(e) => !isTransferring && e.key === 'Enter' && fileInput?.click()}
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
                    style="display: none;"
                />
            </div>

            {#if files.length > 0 && !sendingFiles}
                <div class="file-list">
                    <h5>{$t("clipboard.file_transfer.selected_files")}</h5>
                    {#each files as file, index (file.name + index)}
                        <div class="file-item">
                            <span class="file-name">{file.name}</span>
                            <span class="file-size">({formatFileSize(file.size)})</span>
                            <button
                                class="remove-file"
                                on:click={() => removeFile(index)}
                                aria-label={$t("clipboard.file_transfer.remove")}
                            >
                                ❌
                            </button>
                        </div>
                    {/each}
                    {#if !peerConnected}
                        <div class="connection-warning">
                            {$t("clipboard.file_transfer.waiting_connection")}
                        </div>
                    {:else}
                        <div class="success-info">
                            {$t("clipboard.file_transfer.auto_sent")}
                        </div>
                    {/if}
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
                    <h4>{$t("clipboard.file_transfer.receiving_progress")}: {Math.round(transferProgress)}%</h4>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: {transferProgress}%"></div>
                    </div>
                </div>
            {/if}
            
            {#if receivedFiles.length > 0}
                <div class="file-list">
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

    .success-info {
        text-align: center;
        color: #4caf50;
        background: rgba(76, 175, 80, 0.1);
        border: 1px solid rgba(76, 175, 80, 0.2);
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
            max-height: 75vh;
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
            max-height: 400px;
            overflow-y: auto;
        }
        
        /* PC端接收文件列表优化 - 网格布局 */
        .received-files .file-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 0.75rem;
            margin-top: 1rem;
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
            max-height: 80vh;
            padding: 1rem;
        }
        
        .send-files, .received-files {
            padding: 2rem;
        }
        
        .file-list {
            max-height: 450px;
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
            max-height: 50vh;
            overflow-y: auto;
        }
        
        .send-files, .received-files {
            padding: 1.75rem;
        }
        
        .file-list {
            max-height: 280px;
            overflow-y: auto;
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
</style>
