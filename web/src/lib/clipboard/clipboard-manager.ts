// WebRTC and WebSocket management composable
import { writable } from 'svelte/store';
import { currentApiURL } from '$lib/api/api-url';
import QRCode from 'qrcode';
import { t } from '$lib/i18n/translations';

// Types
export interface FileItem {
    name: string;
    size: number;
    type: string;
    blob: Blob;
}

interface ReceivingFile {
    id: string;
    name: string;
    size: number;
    type: string;
    chunks: Map<number, Uint8Array>; // 使用Map存储chunks，支持乱序接收
    receivedChunks: number;
    totalChunks: number;
    receivedSize: number;
    retryCount: number;
    lastRetryTime: number;
    retryTimer?: ReturnType<typeof setTimeout>; // 重传定时器
    missingChunks: Set<number>; // 跟踪缺失的chunks
    lastActivity: number; // 最后活动时间
}

// Constants
const CHUNK_SIZE = 32 * 1024; // 32KB chunks for file transfer (smaller chunks improve reliability)
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB file size limit
const MAX_BUFFER_SIZE = 512 * 1024; // 512KB buffer threshold to reduce congestion
const BUFFERED_AMOUNT_LOW_THRESHOLD = 256 * 1024; // Resume sending once buffered amount drops below 256KB
const BUFFER_CHECK_INTERVAL = 10; // 10ms buffer check interval
const RETRY_TIMEOUT = 3000; // 3秒后检查缺失的chunks
const MAX_RETRY_COUNT = 5; // 最大重传次数
const RETRY_DELAY = 1000; // 重传延迟

// Store for reactive state
export const clipboardState = writable({
    sessionId: '',
    isConnected: false,
    isCreating: false,
    isJoining: false,
    isCreator: false,
    peerConnected: false,
    qrCodeUrl: '',
    activeTab: 'files' as 'files' | 'text',
    files: [] as File[],
    receivedFiles: [] as FileItem[],
    textContent: '',
    receivedText: '',
    dragover: false,
    sendingFiles: false,
    receivingFiles: false,
    transferProgress: 0,
    isTransferring: false, // 新增：标记是否有文件正在传输（发送或接收）
    isLAN: false, // 新增：标记是否为局域网直连
    dataChannel: null as RTCDataChannel | null,
    peerConnection: null as RTCPeerConnection | null,
    errorMessage: '' as string,
    showError: false as boolean,
    waitingForCreator: false as boolean
});

export class ClipboardManager {
    private ws: WebSocket | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private keyPair: CryptoKeyPair | null = null;
    private remotePublicKey: CryptoKey | null = null;
    private sharedKey: CryptoKey | null = null;
    private currentReceivingFile: ReceivingFile | null = null;
    private statusInterval: ReturnType<typeof setInterval> | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isReconnecting = false;
    private dataChannelForceConnected = false; // 新增：标记数据通道强制连接状态
    private isSendingFiles = false; // 新增：发送文件锁，防止并发发送
    private isSelectingFiles = false; // 新增：文件选择状态
    private connectionStateBeforeFileSelect: boolean = false; // 新增：文件选择前的连接状态
    private fileSelectStartTime: number = 0; // 新增：文件选择开始时间
    private peerIsSelectingFiles = false; // 新增：对端文件选择状态
    private peerFileSelectStartTime: number = 0; // 新增：对端文件选择开始时间
    private cancelTransmission = false; // 新增：取消传输标志
    private currentSendingFileId: string | null = null; // 新增：当前发送文件ID
    private bufferedAmountLowPromise: Promise<void> | null = null; // DataChannel缓冲区恢复通知
    private bufferedAmountLowResolver: (() => void) | null = null;
    private outgoingFileTransfers = new Map<string, {
        file: File;
        totalChunks: number;
        cleanupTimer?: ReturnType<typeof setTimeout>;
    }>();

    constructor() {
        this.loadStoredSession();
        this.startStatusCheck();
        this.setupVisibilityChangeHandler(); // 新增：设置页面可见性变化处理
        
        // 清除任何现有的错误状态
        clipboardState.update(state => ({
            ...state,
            errorMessage: '',
            showError: false
        }));
    }

    // Session persistence
    private loadStoredSession(): void {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('clipboard_session');
            if (stored) {
                try {
                    const session = JSON.parse(stored);
                    clipboardState.update(state => ({
                        ...state,
                        sessionId: session.sessionId,
                        isCreator: session.isCreator
                    }));
                } catch (e) {
                    this.clearStoredSession();
                }
            }
        }
    }
    
    private saveSession(sessionId: string, isCreator: boolean): void {
        if (typeof window !== 'undefined' && sessionId) {
            localStorage.setItem('clipboard_session', JSON.stringify({
                sessionId,
                isCreator,
                timestamp: Date.now()
            }));
        }
    }
    
    private clearStoredSession(): void {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('clipboard_session');
        }
    }    private startStatusCheck(): void {
        // 统一使用5秒间隔进行状态检查，平衡性能和及时性
        const checkInterval = 5000; // 5秒间隔
        
        this.statusInterval = setInterval(() => {
            // 文件选择期间完全暂停状态检查（本端或对端任一方在选择文件）
            if (this.isSelectingFiles || this.peerIsSelectingFiles) {
                console.log('📱 文件选择中（本端或对端），完全暂停状态检查', {
                    localSelecting: this.isSelectingFiles,
                    peerSelecting: this.peerIsSelectingFiles
                });
                return;
            }
            
            const wsConnected = this.ws?.readyState === WebSocket.OPEN;
            const dataChannelOpen = this.dataChannel?.readyState === 'open';
            
            // 获取当前状态避免不必要的更新
            let currentState: any = {};
            const unsubscribe = clipboardState.subscribe(s => currentState = s);
            unsubscribe();
            
            // 如果数据通道被强制设置为已连接，则不要覆盖这个状态
            const effectivePeerConnected = this.dataChannelForceConnected || dataChannelOpen;
            
            // 只在状态真正变化时更新
            if (currentState.isConnected !== wsConnected || currentState.peerConnected !== effectivePeerConnected) {
                console.log('🔄 Status update (5s check):', { 
                    wsConnected, 
                    dataChannelOpen, 
                    dataChannelForceConnected: this.dataChannelForceConnected,
                    effectivePeerConnected,
                    isSelectingFiles: this.isSelectingFiles,
                    peerIsSelectingFiles: this.peerIsSelectingFiles
                });
                clipboardState.update(state => ({
                    ...state,
                    isConnected: wsConnected,
                    peerConnected: effectivePeerConnected
                }));
            }
        }, checkInterval);
    }    // WebSocket management
    private getWebSocketURL(): string {
        if (typeof window === 'undefined') return 'ws://localhost:9000/ws';
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let host = window.location.host;
        
        // 生产环境使用API域名进行WebSocket连接
        if (window.location.hostname === 'freesavevideo.online') {
            host = 'api.freesavevideo.online';
        }
        // 开发环境处理
        else if (host.includes('localhost') || host.includes('127.0.0.1')) {
            host = '192.168.1.12:5173';
        }
        
        const wsUrl = `${protocol}//${host}/ws`;
        console.log('Constructed WebSocket URL:', wsUrl);
        return wsUrl;
    }    private async connectWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = this.getWebSocketURL();
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {
                    console.log('🔗 WebSocket connected');
                    this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                    this.reconnectDelay = 1000; // Reset delay
                    clipboardState.update(state => ({ ...state, isConnected: true }));
                    resolve();
                };
                
                this.ws.onmessage = async (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        await this.handleWebSocketMessage(message);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };
                
                this.ws.onclose = (event) => {
                    console.log(`🔌 WebSocket disconnected: code=${event.code}, reason=${event.reason}`, {
                        isSelectingFiles: this.isSelectingFiles,
                        peerIsSelectingFiles: this.peerIsSelectingFiles,
                        fileSelectDuration: this.fileSelectStartTime ? Date.now() - this.fileSelectStartTime : 0
                    });
                    
                    // 文件选择期间完全忽略 WebSocket 关闭事件（本端或对端任一方在选择文件）
                    if (this.isSelectingFiles || this.peerIsSelectingFiles) {
                        console.log('📱 文件选择中（本端或对端），完全忽略WebSocket关闭事件，保持连接状态', {
                            localSelecting: this.isSelectingFiles,
                            peerSelecting: this.peerIsSelectingFiles
                        });
                        // 强制保持连接状态显示
                        clipboardState.update(currentState => ({ 
                            ...currentState, 
                            isConnected: true 
                        }));
                        return;
                    }
                    
                    clipboardState.update(state => ({ ...state, isConnected: false }));
                    
                    // Only attempt reconnection if we have a session and we're not manually disconnecting
                    if (!this.isReconnecting && this.shouldReconnect(event.code)) {
                        this.handleReconnection();
                    }
                };
                
                this.ws.onerror = (error) => {
                    console.error('❌ WebSocket error:', error);
                    reject(error);
                };
            } catch (error) {
                console.error('Error creating WebSocket:', error);
                reject(error);
            }
        });
    }

    // Reconnection logic
    private shouldReconnect(closeCode: number): boolean {
        // 如果正在选择文件，禁用重连
        if (this.isSelectingFiles) {
            console.log('📱 文件选择中，禁用重连检查');
            return false;
        }
        
        // Get current session state
        const state = this.getCurrentState();
        
        // Don't reconnect if we don't have a session
        if (!state.sessionId) {
            return false;
        }
        
        // Don't reconnect on normal closure (user initiated)
        if (closeCode === 1000) {
            return false;
        }
        
        // Reconnect on abnormal closures (network issues)
        return closeCode === 1005 || closeCode === 1006 || closeCode === 1001;
    }
    
    private async handleReconnection(): Promise<void> {
        if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`Max reconnection attempts reached (${this.maxReconnectAttempts})`);
            this.showError('Connection lost. Please refresh the page to reconnect.');
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        // Show reconnecting status to user
        clipboardState.update(state => ({
            ...state,
            errorMessage: `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
            showError: true
        }));
        
        // Wait before reconnecting (exponential backoff)
        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connectWebSocket();
                await this.rejoinSession();
                
                // 等待 WebRTC 连接完全建立
                console.log('🔄 等待 WebRTC 连接建立...');
                const maxWaitTime = 15000; // 15秒超时
                const startTime = Date.now();
                
                while (Date.now() - startTime < maxWaitTime) {
                    // 检查 DataChannel 是否已经连接
                    if (this.dataChannel?.readyState === 'open') {
                        console.log('✅ WebRTC DataChannel 重连成功！');
                        
                        // Clear error message on successful reconnection
                        clipboardState.update(state => ({
                            ...state,
                            isConnected: true,
                            peerConnected: true,
                            errorMessage: t.get('clipboard.messages.connection_restored'),
                            showError: true
                        }));
                        
                        // 3秒后清除提示
                        setTimeout(() => {
                            clipboardState.update(state => ({
                                ...state,
                                errorMessage: '',
                                showError: false
                            }));
                        }, 3000);
                        
                        console.log('✅ Successfully reconnected with full WebRTC support');
                        return;
                    }
                    
                    // 等待100ms后再检查
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // 如果超时，显示警告但不阻止用户使用
                console.warn('⚠️ WebRTC重连超时，但WebSocket已连接');
                clipboardState.update(state => ({
                    ...state,
                    isConnected: true,
                    peerConnected: false,
                    errorMessage: t.get('clipboard.messages.websocket_connected_partial'),
                    showError: true
                }));
                
            } catch (error) {
                console.error('❌ Reconnection failed:', error);
                // Exponential backoff: increase delay for next attempt
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
                
                // Try again
                this.handleReconnection();
            } finally {
                this.isReconnecting = false;
            }
        }, this.reconnectDelay);
    }
    
    private async rejoinSession(): Promise<void> {
        const state = this.getCurrentState();
        
        if (!state.sessionId || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Cannot rejoin: no session or WebSocket not ready');
        }
        
        console.log('🔄 开始重新加入会话，完整重建连接链路...');
        
        // 完全清理旧的 WebRTC 连接
        if (this.dataChannel) {
            console.log('🔄 清理旧的 DataChannel');
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        if (this.peerConnection) {
            console.log('🔄 清理旧的 PeerConnection');
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // 重置连接状态
        this.dataChannelForceConnected = false;
        
        // 更新UI状态为重连中
        clipboardState.update(state => ({
            ...state,
            peerConnected: false,
            errorMessage: t.get('clipboard.messages.rebuilding_connection'),
            showError: true
        }));
        
        // Generate new key pair for security
        await this.generateKeyPair();
        const publicKeyArray = Array.from(new Uint8Array(await this.exportPublicKey()));
        
        if (state.isCreator) {
            // Reconnect as creator
            console.log('🔄 作为创建者重新加入会话');
            this.ws.send(JSON.stringify({
                type: 'create_session',
                publicKey: publicKeyArray,
                existingSessionId: state.sessionId
            }));
        } else {
            // Reconnect as joiner
            console.log('🔄 作为加入者重新加入会话');
            this.ws.send(JSON.stringify({
                type: 'join_session',
                sessionId: state.sessionId,
                publicKey: publicKeyArray
            }));
        }
    }
      private getCurrentState() {
        let state: any;
        const unsubscribe = clipboardState.subscribe(s => state = s);
        unsubscribe();
        return state;
    }
    
    private showError(message: string): void {
        clipboardState.update(state => ({
            ...state,
            errorMessage: message,
            showError: true
        }));
    }

    // Encryption
    private async generateKeyPair(): Promise<void> {
        this.keyPair = await window.crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveKey']
        );
    }

    private async exportPublicKey(): Promise<ArrayBuffer> {
        if (!this.keyPair) throw new Error('Key pair not generated');
        return await window.crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    }

    private async importRemotePublicKey(publicKeyArray: number[]): Promise<void> {
        const publicKeyBuffer = new Uint8Array(publicKeyArray).buffer;
        this.remotePublicKey = await window.crypto.subtle.importKey(
            'raw',
            publicKeyBuffer,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );
    }

    private async deriveSharedKey(): Promise<void> {
        if (!this.keyPair || !this.remotePublicKey) throw new Error('Keys not available');
        
        this.sharedKey = await window.crypto.subtle.deriveKey(
            { name: 'ECDH', public: this.remotePublicKey },
            this.keyPair.privateKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    private toCryptoArrayBuffer(view: Uint8Array): ArrayBuffer {
        if (view.buffer instanceof ArrayBuffer && view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
            return view.buffer;
        }

        const copy = new Uint8Array(view.byteLength);
        copy.set(view);
        return copy.buffer;
    }

    private async encryptData(data: string): Promise<ArrayBuffer> {
        if (!this.sharedKey) throw new Error('Shared key not available');
        
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            this.sharedKey,
            this.toCryptoArrayBuffer(dataBuffer)
        );
        
        // Combine IV and encrypted data
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv);
        result.set(new Uint8Array(encrypted), iv.length);
        
        return result.buffer;
    }

    private async encryptBinaryData(data: Uint8Array): Promise<ArrayBuffer> {
        if (!this.sharedKey) throw new Error('Shared key not available');
        
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            this.sharedKey,
            this.toCryptoArrayBuffer(data)
        );
        
        // Combine IV and encrypted data
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv);
        result.set(new Uint8Array(encrypted), iv.length);
        
        return result.buffer;
    }

    private async decryptData(encryptedBuffer: ArrayBuffer): Promise<string> {
        if (!this.sharedKey) throw new Error('Shared key not available');
        
        const encryptedArray = new Uint8Array(encryptedBuffer);
        const iv = encryptedArray.slice(0, 12);
        const encrypted = encryptedArray.slice(12);
        
        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            this.sharedKey,
            encrypted
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    private async decryptBinaryData(encryptedBuffer: ArrayBuffer): Promise<Uint8Array> {
        if (!this.sharedKey) throw new Error('Shared key not available');
        
        const encryptedArray = new Uint8Array(encryptedBuffer);
        const iv = encryptedArray.slice(0, 12);
        const encrypted = encryptedArray.slice(12);
        
        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            this.sharedKey,
            encrypted
        );
        
        return new Uint8Array(decrypted);
    }

    // 文件传输取消功能
    
    // 取消发送文件
    async cancelSending(): Promise<void> {
        if (!this.isSendingFiles && !this.currentSendingFileId) {
            console.log('🚫 没有正在发送的文件，无需取消');
            return;
        }
        
        console.log('🚫 用户取消文件发送', {
            isSendingFiles: this.isSendingFiles,
            currentFileId: this.currentSendingFileId
        });
        
        this.cancelTransmission = true;
        
        // 发送取消信号给接收端
        if (this.dataChannel?.readyState === 'open') {
            try {
                this.dataChannel.send(JSON.stringify({
                    type: 'file_cancel',
                    reason: 'user_cancelled',
                    fileId: this.currentSendingFileId,
                    timestamp: Date.now()
                }));
                console.log('🚫 已发送取消信号给接收端');
            } catch (error) {
                console.warn('🚫 发送取消信号失败:', error);
            }
        }
        
        // 重置发送状态
        this.resetSendingState(t.get('clipboard.messages.file_sending_cancelled'));
    }
    
    // 取消接收文件
    async cancelReceiving(): Promise<void> {
        if (!this.currentReceivingFile) {
            console.log('🚫 没有正在接收的文件，无需取消');
            return;
        }
        
        console.log('🚫 用户取消文件接收', {
            fileId: this.currentReceivingFile.id,
            fileName: this.currentReceivingFile.name
        });
        
        // 清理接收状态
        this.cleanupReceivingState(t.get('clipboard.messages.file_receiving_cancelled'));
        
        // 发送取消确认给发送端
        if (this.dataChannel?.readyState === 'open') {
            try {
                this.dataChannel.send(JSON.stringify({
                    type: 'file_cancel_ack',
                    reason: 'receiver_cancelled',
                    fileId: this.currentReceivingFile?.id,
                    timestamp: Date.now()
                }));
                console.log('🚫 已发送取消确认给发送端');
            } catch (error) {
                console.warn('🚫 发送取消确认失败:', error);
            }
        }
    }
    
    // 处理对端取消信号
    private handleFileCancellation(message: any): void {
        console.log('🚫 处理对端取消信号:', message);
        
        // 如果正在接收文件，清理状态
        if (this.currentReceivingFile) {
            this.cleanupReceivingState(t.get('clipboard.messages.peer_cancelled_transmission'));
            
            // 发送确认
            if (this.dataChannel?.readyState === 'open') {
                try {
                    this.dataChannel.send(JSON.stringify({
                        type: 'file_cancel_ack',
                        reason: 'acknowledged',
                        fileId: message.fileId
                    }));
                } catch (error) {
                    console.warn('🚫 发送取消确认失败:', error);
                }
            }
        }
        
        // 如果正在发送文件，也要停止
        if (this.isSendingFiles) {
            this.cancelTransmission = true;
            this.resetSendingState(t.get('clipboard.messages.acknowledge_peer_cancel'));
        }
    }
    
    // 处理取消确认
    private handleCancelAcknowledgment(message: any): void {
        console.log('🚫 处理取消确认:', message);
        
        // 发送端收到取消确认，确保状态已清理
        if (this.isSendingFiles || this.cancelTransmission) {
            this.resetSendingState(t.get('clipboard.messages.transmission_cancelled'));
        }
    }
    
    // 重置发送状态
    private resetSendingState(errorMessage: string = t.get('clipboard.messages.transmission_cancelled')): void {
        this.isSendingFiles = false;
        this.cancelTransmission = false;
        this.currentSendingFileId = null;

        this.releaseMobilePowerProtection('sending');
        
        // 结束文件选择保护（如果还在选择状态）
        if (this.isSelectingFiles) {
            this.completeFileSelection();
        }
        
        clipboardState.update(state => ({
            ...state,
            sendingFiles: false,
            transferProgress: 0,
            isTransferring: false,
            files: [], // 清空文件列表
            errorMessage,
            showError: true
        }));
        
        // 3秒后清除错误消息
        setTimeout(() => {
            clipboardState.update(state => ({
                ...state,
                errorMessage: '',
                showError: false
            }));
        }, 3000);
    }
    
    // 清理接收状态
    private cleanupReceivingState(errorMessage: string = t.get('clipboard.messages.file_receiving_cancelled')): void {
        if (this.currentReceivingFile?.retryTimer) {
            clearTimeout(this.currentReceivingFile.retryTimer);
        }
        
        this.currentReceivingFile = null;
        this.cancelTransmission = false; // 🚫 重置取消传输标志

        this.releaseMobilePowerProtection('receiving');
        
        clipboardState.update(state => ({
            ...state,
            receivingFiles: false,
            transferProgress: 0,
            isTransferring: false,
            errorMessage,
            showError: true
        }));
        
        // 3秒后清除错误消息
        setTimeout(() => {
            clipboardState.update(state => ({
                ...state,
                errorMessage: '',
                showError: false
            }));
        }, 3000);
    }

    // Public API methods
    async createSession(): Promise<void> {
        try {
            clipboardState.update(state => ({ ...state, isCreating: true }));
            await this.generateKeyPair();
            await this.connectWebSocket();
            
            const publicKeyBuffer = await this.exportPublicKey();
            const publicKeyArray = Array.from(new Uint8Array(publicKeyBuffer));
            
            if (this.ws) {
                this.ws.send(JSON.stringify({
                    type: 'create_session',
                    publicKey: publicKeyArray
                }));
            }
        } catch (error) {
            console.error('Error creating session:', error);
            clipboardState.update(state => ({ ...state, isCreating: false }));
        }
    }

    async joinSession(joinCode: string): Promise<void> {
        try {
            console.log('Starting join session process...');
            clipboardState.update(state => ({ ...state, isJoining: true }));
            
            await this.generateKeyPair();
            await this.connectWebSocket();
            
            const publicKeyBuffer = await this.exportPublicKey();
            const publicKeyArray = Array.from(new Uint8Array(publicKeyBuffer));
            
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const message = {
                    type: 'join_session',
                    sessionId: joinCode,
                    publicKey: publicKeyArray
                };
                console.log('Sending join message:', message);
                this.ws.send(JSON.stringify(message));
            } else {
                console.error('WebSocket not ready');
                clipboardState.update(state => ({ ...state, isJoining: false }));
            }
        } catch (error) {
            console.error('Error joining session:', error);
            clipboardState.update(state => ({ ...state, isJoining: false }));
        }
    }

    async generateQRCode(sessionId: string): Promise<void> {
        try {
            if (typeof window !== 'undefined' && sessionId) {
                let origin = window.location.origin;
                if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                    origin = origin.replace(/localhost:\d+|127\.0\.0\.1:\d+/, '192.168.1.12:5173');
                }
                
                const url = `${origin}/clipboard?session=${sessionId}`;
                const qrCodeUrl = await QRCode.toDataURL(url, {
                    color: { dark: '#000000', light: '#ffffff' }
                });
                
                clipboardState.update(state => ({ ...state, qrCodeUrl }));
                console.log('QR Code generated');
            }
        } catch (error) {
            console.error('QR Code generation failed:', error);
        }
    }

    shareSession(sessionId: string): void {
        if (typeof window !== 'undefined' && sessionId) {
            let origin = window.location.origin;
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                origin = origin.replace(/localhost:\d+|127\.0\.0\.1:\d+/, '192.168.1.12:5173');
            }
            
            const url = `${origin}/clipboard?session=${sessionId}`;
            navigator.clipboard.writeText(url);
        }
    }    cleanup(): void {
        // Clear reconnection timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        
        // 清理文件重传定时器
        if (this.currentReceivingFile?.retryTimer) {
            clearTimeout(this.currentReceivingFile.retryTimer);
            this.currentReceivingFile.retryTimer = undefined;
        }
        
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        this.resetBufferedAmountWaiters();
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        
        // 移除页面可见性监听器
        if (typeof window !== 'undefined') {
            document.removeEventListener('visibilitychange', this.checkConnectionAfterVisibilityChange);
        }
        
        // 停止文件选择保活机制
        this.stopFileSelectionKeepAlive();
        
    // 禁用移动端电源保护
    this.clearMobilePowerProtection();
        
        clipboardState.update(state => ({
            ...state,
            sessionId: '',
            isConnected: false,
            peerConnected: false,
            qrCodeUrl: '',
            errorMessage: '',
            showError: false,
            waitingForCreator: false,
            files: [], // 清空文件列表
            sendingFiles: false,
            receivingFiles: false,
            transferProgress: 0,
            isTransferring: false // 重置传输状态
        }));
        
        this.sharedKey = null;
        this.remotePublicKey = null;
        this.currentReceivingFile = null;
        this.isSendingFiles = false; // 重置发送锁
        this.isSelectingFiles = false; // 重置文件选择状态
        this.outgoingFileTransfers.forEach(record => {
            if (record.cleanupTimer) {
                clearTimeout(record.cleanupTimer);
            }
        });
        this.outgoingFileTransfers.clear();
        this.connectionStateBeforeFileSelect = false; // 重置连接状态
        this.fileSelectStartTime = 0; // 重置选择时间
        this.peerIsSelectingFiles = false; // 重置对端文件选择状态
        this.cancelTransmission = false; // 重置取消传输标志
        this.currentSendingFileId = null; // 重置当前发送文件ID
        this.clearStoredSession();
    }

    // 清除错误消息
    clearError(): void {
        clipboardState.update(state => ({
            ...state,
            errorMessage: '',
            showError: false,
            waitingForCreator: false
        }));
    }

    // 文件选择前的连接保护
    prepareForFileSelection(): void {
        // 如果已经在选择文件状态，避免重复启动
        if (this.isSelectingFiles) {
            console.log('📱 已在文件选择状态，忽略重复调用');
            return;
        }
        
        this.isSelectingFiles = true;
        this.fileSelectStartTime = Date.now();
        this.connectionStateBeforeFileSelect = this.dataChannel?.readyState === 'open';
        
        console.log('📱 准备文件选择，启动全面保护模式:', {
            isSelectingFiles: this.isSelectingFiles,
            connectionState: this.connectionStateBeforeFileSelect,
            wsState: this.ws?.readyState,
            timestamp: this.fileSelectStartTime
        });
        
        void this.acquireMobilePowerProtection('file-selection');
        
        // 暂停自动重连机制，避免在文件选择期间的无效重连
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // 强制保持连接状态显示，防止UI状态闪烁
        this.dataChannelForceConnected = this.dataChannel?.readyState === 'open';
        
        // 立即强制更新UI状态为连接状态
        clipboardState.update(state => ({
            ...state,
            isConnected: true,
            peerConnected: true
        }));
        
        // 发送文件选择开始信号给对端，让对端也进入等待模式
        if (this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    type: 'file_selection_start',
                    message: 'Mobile device starting file selection',
                    timestamp: this.fileSelectStartTime,
                    keepAlive: true // 要求服务器保持连接
                }));
                console.log('📱 已通知对端开始文件选择');
            } catch (error) {
                console.warn('📱 发送文件选择开始信号失败:', error);
            }
        }
        
        // 启动定期保活机制
        this.startFileSelectionKeepAlive();
        
        // 设置保护超时机制，防止无限期等待（60秒，比之前的30秒更长）
        setTimeout(() => {
            if (this.isSelectingFiles) {
                console.log('📱 文件选择超时（60秒），自动结束保护模式');
                this.completeFileSelection();
            }
        }, 60000);
        
        console.log('📱 文件选择保护模式已启动，禁用自动重连和状态更新');
    }

    // 文件选择完成后的连接恢复
    async completeFileSelection(): Promise<void> {
        const selectDuration = Date.now() - this.fileSelectStartTime;
        console.log('📱 文件选择完成，耗时:', selectDuration, 'ms');
        
        // 先设置状态为非选择状态
        this.isSelectingFiles = false;
        console.log('📱 已设置 isSelectingFiles = false');
        
        // 停止保活机制
        this.stopFileSelectionKeepAlive();
        
    // 禁用移动端电源保护
    this.releaseMobilePowerProtection('file-selection');
        
        // 重置强制连接状态，允许正常的状态检查
        this.dataChannelForceConnected = false;
        
        // 通知对端文件选择完成
        if (this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    type: 'file_selection_complete',
                    message: 'File selection completed',
                    duration: selectDuration
                }));
                console.log('📱 已通知对端文件选择完成');
            } catch (error) {
                console.warn('📱 发送文件选择完成信号失败:', error);
            }
        }
        
        // 立即更新连接状态，基于实际的连接情况
        const currentWsState = this.ws?.readyState === WebSocket.OPEN;
        const currentDataChannelState = this.dataChannel?.readyState === 'open';
        
        console.log('📱 文件选择完成后的实际连接状态:', {
            websocket: currentWsState,
            dataChannel: currentDataChannelState,
            peerConnectionState: this.peerConnection?.connectionState,
            iceConnectionState: this.peerConnection?.iceConnectionState,
            selectDuration
        });
        
        // 检查连接状态是否发生变化
        const connectionLost = this.connectionStateBeforeFileSelect && !currentDataChannelState;
        const wsLost = !currentWsState;
        
        // 如果选择时间超过15秒，或者连接确实断开了，尝试恢复
        if (wsLost || connectionLost || selectDuration > 15000) {
            console.log('📱 检测到连接问题或选择时间过长，尝试恢复连接...');
            
            clipboardState.update(state => ({
                ...state,
                errorMessage: t.get('clipboard.messages.recovering_connection'),
                showError: true
            }));
            
            await this.recoverConnectionAfterFileSelect();
        } else {
            console.log('📱 连接状态正常，可以继续传输');
            // 确保UI状态正确
            clipboardState.update(state => ({
                ...state,
                isConnected: currentWsState,
                peerConnected: currentDataChannelState,
                errorMessage: '',
                showError: false
            }));
        }
    }

    // 文件选择后的连接恢复机制
    private async recoverConnectionAfterFileSelect(): Promise<void> {
        try {
            console.log('📱 开始连接恢复流程...');
            
            // 先尝试简单的状态检查，避免不必要的重连
            const wsConnected = this.ws?.readyState === WebSocket.OPEN;
            const dataChannelConnected = this.dataChannel?.readyState === 'open';
            
            console.log('📱 当前连接状态:', { wsConnected, dataChannelConnected });
            
            // 如果WebSocket还在但DataChannel断了，尝试重新建立DataChannel
            if (wsConnected && !dataChannelConnected) {
                console.log('📱 WebSocket正常，尝试恢复DataChannel...');
                
                try {
                    // 发送恢复信号
                    this.ws?.send(JSON.stringify({
                        type: 'recovery',
                        message: 'Reconnecting DataChannel after file selection'
                    }));
                    
                    // 等待DataChannel自动恢复
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    if (this.dataChannel?.readyState === 'open') {
                        console.log('📱 DataChannel恢复成功');
                        clipboardState.update(state => ({
                            ...state,
                            isConnected: true,
                            peerConnected: true,
                            errorMessage: t.get('clipboard.messages.connection_recovered'),
                            showError: true
                        }));
                        
                        // 3秒后清除提示
                        setTimeout(() => {
                            clipboardState.update(state => ({
                                ...state,
                                errorMessage: '',
                                showError: false
                            }));
                        }, 3000);
                        return;
                    }
                } catch (error) {
                    console.warn('📱 发送恢复信号失败:', error);
                }
            }
            
            // 如果WebSocket也断了，进行完整重连
            if (!wsConnected) {
                console.log('📱 WebSocket断开，需要完整重连...');
                
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: t.get('clipboard.messages.file_selection_interrupted'),
                    showError: true
                }));
                
                await this.connectWebSocket();
                await this.rejoinSession();
                
                // 等待连接建立
                const maxWaitTime = 10000;
                const startTime = Date.now();
                
                while (Date.now() - startTime < maxWaitTime) {
                    if (this.ws?.readyState === WebSocket.OPEN && this.dataChannel?.readyState === 'open') {
                        console.log('📱 完整重连成功');
                        clipboardState.update(state => ({
                            ...state,
                            isConnected: true,
                            peerConnected: true,
                            errorMessage: t.get('clipboard.messages.connection_recovered'),
                            showError: true
                        }));
                        
                        setTimeout(() => {
                            clipboardState.update(state => ({
                                ...state,
                                errorMessage: '',
                                showError: false
                            }));
                        }, 3000);
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            // 如果所有自动恢复都失败，提示用户但不强制断开
            console.log('📱 自动恢复失败，保持当前状态并提示用户');
            
            clipboardState.update(state => ({
                ...state,
                errorMessage: '文件选择过程中连接不稳定，建议重新建立连接以确保传输质量',
                showError: true,
                isConnected: wsConnected,
                peerConnected: dataChannelConnected
            }));
            
        } catch (error) {
            console.error('📱 连接恢复过程出错:', error);
            
            clipboardState.update(state => ({
                ...state,
                errorMessage: '连接状态检查失败，建议刷新页面重新连接',
                showError: true
            }));
        }
    }

    // 文件选择期间的保活机制
    private fileSelectionKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
    
    private startFileSelectionKeepAlive(): void {
        // 先清理可能存在的旧定时器，防止重复启动
        if (this.fileSelectionKeepAliveTimer) {
            console.log('📱 清理已存在的保活定时器');
            clearInterval(this.fileSelectionKeepAliveTimer);
            this.fileSelectionKeepAliveTimer = null;
        }
        
        // 每5秒发送一次保活信号
        this.fileSelectionKeepAliveTimer = setInterval(() => {
            // 双重检查：确保仍在文件选择状态且WebSocket连接正常
            if (this.isSelectingFiles && this.ws?.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({
                        type: 'keep_alive',
                        message: 'File selection keep alive - CRITICAL',
                        timestamp: Date.now(),
                        duration: Date.now() - this.fileSelectStartTime,
                        priority: 'high',
                        mobile: true,
                        fileSelection: true
                    }));
                    
                    console.log('📱 发送保活信号');
                } catch (error) {
                    console.warn('📱 保活信号发送失败:', error);
                }
            } else {
                // 如果不再需要保活，自动停止定时器
                console.log('📱 检测到文件选择已结束，自动停止保活机制');
                this.stopFileSelectionKeepAlive();
            }
        }, 5000); // 5秒间隔
        
        console.log('📱 文件选择保活机制已启动（5秒间隔）');
    }
    
    private stopFileSelectionKeepAlive(): void {
        if (this.fileSelectionKeepAliveTimer) {
            clearInterval(this.fileSelectionKeepAliveTimer);
            this.fileSelectionKeepAliveTimer = null;
            console.log('📱 停止文件选择保活机制 - 定时器已清理');
        } else {
            console.log('📱 停止文件选择保活机制 - 无需清理（定时器为空）');
        }
    }

    // 移动端电源保护机制
    private wakeLock: any = null;
    private audioContext: AudioContext | null = null;
    private oscillator: OscillatorNode | null = null;
    private mobilePowerProtectionReasons = new Set<string>();

    private isMobileDevice(): boolean {
        return typeof window !== 'undefined' &&
            (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    }

    private async acquireMobilePowerProtection(reason: string): Promise<void> {
        if (!this.isMobileDevice()) {
            return;
        }

        if (!this.mobilePowerProtectionReasons.has(reason)) {
            this.mobilePowerProtectionReasons.add(reason);
        }

        if (this.mobilePowerProtectionReasons.size === 1) {
            try {
                await this.enableMobilePowerProtection();
            } catch (error) {
                console.warn('📱 启用移动端电源保护失败:', error);
            }
        }
    }

    private releaseMobilePowerProtection(reason: string): void {
        if (!this.isMobileDevice()) {
            return;
        }

        if (this.mobilePowerProtectionReasons.delete(reason) && this.mobilePowerProtectionReasons.size === 0) {
            this.disableMobilePowerProtection();
        }
    }

    private clearMobilePowerProtection(): void {
        if (!this.isMobileDevice()) {
            return;
        }

        if (this.mobilePowerProtectionReasons.size > 0) {
            this.mobilePowerProtectionReasons.clear();
            this.disableMobilePowerProtection();
        }
    }
    
    private async enableMobilePowerProtection(): Promise<void> {
        console.log('📱 启用移动端电源保护机制');

        if (this.wakeLock || this.audioContext || this.oscillator) {
            console.log('📱 移动端电源保护已处于启用状态');
            return;
        }
        
        try {
            // 1. 尝试使用 Wake Lock API（Chrome 84+）
            if ('wakeLock' in navigator) {
                this.wakeLock = await (navigator as any).wakeLock.request('screen');
                console.log('📱 Wake Lock 已启用');
                
                this.wakeLock.addEventListener('release', () => {
                    console.log('📱 Wake Lock 已释放');
                });
            }
        } catch (err) {
            console.warn('📱 Wake Lock API 不可用:', err);
        }
        
        try {
            // 2. 创建静默音频上下文保持连接活跃
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            // 设置极低音量的静音
            gainNode.gain.setValueAtTime(0.001, this.audioContext.currentTime);
            
            this.oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // 播放极低频的声音
            this.oscillator.frequency.setValueAtTime(1, this.audioContext.currentTime);
            this.oscillator.start();
            
            console.log('📱 静默音频保活已启用');
        } catch (err) {
            console.warn('📱 音频保活启用失败:', err);
        }
    }
    
    private disableMobilePowerProtection(): void {
        console.log('📱 禁用移动端电源保护机制');
        
        // 释放 Wake Lock
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
        
        // 停止音频上下文
        if (this.oscillator) {
            this.oscillator.stop();
            this.oscillator = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    // 页面可见性变化处理（移动端优化）
    private setupVisibilityChangeHandler(): void {
        if (typeof window === 'undefined') return;
        
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) return; // 只在移动端启用
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('📱 页面变为隐藏状态');
                // 页面隐藏时不做任何操作，避免误断连接
            } else {
                console.log('📱 页面变为可见状态');
                // 页面恢复可见时，检查连接状态
                setTimeout(() => {
                    this.checkConnectionAfterVisibilityChange();
                }, 100);
            }
        });
    }

    // 页面可见性恢复后的连接检查
    private async checkConnectionAfterVisibilityChange(): Promise<void> {
        if (this.isSelectingFiles) {
            console.log('📱 正在选择文件，跳过可见性检查');
            return;
        }
        
        const wsConnected = this.ws?.readyState === WebSocket.OPEN;
        const dataChannelConnected = this.dataChannel?.readyState === 'open';
        
        console.log('📱 可见性恢复连接检查:', {
            websocket: wsConnected,
            dataChannel: dataChannelConnected
        });
        
        // 如果连接断开，尝试恢复
        if (!wsConnected || !dataChannelConnected) {
            console.log('📱 检测到连接断开，尝试恢复...');
            await this.recoverConnectionAfterFileSelect();
        }
    }// WebSocket message handler
    private async handleWebSocketMessage(message: any): Promise<void> {
        console.log('Handling WebSocket message:', message.type);
        
        switch (message.type) {
            case 'session_created':
                clipboardState.update(state => ({
                    ...state,
                    sessionId: message.sessionId,
                    isCreating: false,
                    isCreator: true,
                    errorMessage: '',
                    showError: false
                }));
                await this.generateQRCode(message.sessionId);
                this.saveSession(message.sessionId, true);
                break;
                
            case 'session_joined':
                console.log('Session joined successfully, setting up WebRTC...');
                await this.importRemotePublicKey(message.publicKey);
                await this.deriveSharedKey();
                clipboardState.update(state => ({ 
                    ...state, 
                    isJoining: false,
                    waitingForCreator: false,
                    errorMessage: '',
                    showError: false
                }));
                await this.setupWebRTC(false);
                break;
                  
            case 'peer_joined':
                console.log('Peer joined, setting up WebRTC...');
                await this.importRemotePublicKey(message.publicKey);
                await this.deriveSharedKey();
                
                // Get current state to check if this is the creator
                let currentState: any = {};
                const unsubscribe = clipboardState.subscribe(s => currentState = s);
                unsubscribe();
                
                if (currentState.isCreator) {
                    await this.setupWebRTC(true);
                } else {
                    await this.setupWebRTC(false);
                }
                break;
                
            case 'waiting_for_creator':
                console.log('Waiting for creator to reconnect...');
                clipboardState.update(state => ({
                    ...state,
                    isJoining: false,
                    waitingForCreator: true,
                    errorMessage: message.message || '等待创建者重新连接',
                    showError: true
                }));
                break;
                
            case 'peer_disconnected':
                console.log('Peer disconnected');
                clipboardState.update(state => ({
                    ...state,
                    peerConnected: false,
                    errorMessage: '对端已断开连接',
                    showError: true
                }));
                // 清理 WebRTC 连接但保持 WebSocket 连接
                if (this.peerConnection) {
                    this.peerConnection.close();
                    this.peerConnection = null;
                }
                if (this.dataChannel) {
                    this.dataChannel.close();
                    this.dataChannel = null;
                }
                break;
                
            case 'offer':
                await this.handleOffer(message.offer);
                break;
                
            case 'answer':
                await this.handleAnswer(message.answer);
                break;
                
            case 'ice_candidate':
                await this.handleIceCandidate(message.candidate);
                break;
                
            case 'file_selection_start':
                console.log('📱 对端开始文件选择，进入等待模式');
                this.peerIsSelectingFiles = true;
                // 不显示提示信息，静默处理
                break;
                
            case 'file_selection_complete':
                console.log('📱 对端文件选择完成，耗时:', message.duration, 'ms');
                this.peerIsSelectingFiles = false;
                // 清除等待提示
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: '',
                    showError: false
                }));
                break;
                
            case 'file_cancel':
                console.log('🚫 收到对端取消文件传输信号');
                this.handleFileCancellation(message);
                break;
                
            case 'file_cancel_ack':
                console.log('🚫 收到取消确认响应');
                this.handleCancelAcknowledgment(message);
                break;
                
            case 'keep_alive':
                console.log('📱 收到保活信号:', message.message);
                // 回应保活信号，确保连接活跃
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    try {
                        this.ws.send(JSON.stringify({
                            type: 'keep_alive_ack',
                            message: 'Keep alive acknowledged',
                            timestamp: Date.now()
                        }));
                    } catch (error) {
                        console.warn('📱 保活响应发送失败:', error);
                    }
                }
                break;
                
            case 'keep_alive_ack':
                console.log('📱 收到保活响应');
                break;
                
            case 'recovery':
                console.log('📱 收到对端恢复信号:', message.message);
                // 可以在这里处理连接恢复逻辑
                break;
                
            case 'heartbeat':
                // 处理心跳消息，通常不需要特殊处理
                console.log('💓 收到心跳消息');
                break;
                
            case 'ping':
                // 处理ping消息，通常返回pong
                console.log('🏓 收到ping消息');
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'pong' }));
                }
                break;
                
            case 'pong':
                // 处理pong响应
                console.log('🏓 收到pong响应');
                break;
                
            case 'error':
                console.error('Server error:', message);
                
                // 忽略"Unknown message type"错误，不显示给用户
                if (message.message === 'Unknown message type') {
                    console.warn('⚠️ 忽略服务器"Unknown message type"错误');
                    return; // 直接返回，不更新UI状态
                }
                
                let errorMessage = '连接错误';
                
                // 处理特定的错误消息
                if (message.message) {
                    switch (message.message) {
                        case '会话不存在或已过期':
                            errorMessage = t.get('clipboard.messages.session_expired');
                            this.clearStoredSession(); // 清理本地存储的过期会话
                            break;
                        case '会话已满':
                            errorMessage = t.get('clipboard.messages.session_full');
                            break;
                        case '未知消息类型':
                            errorMessage = t.get('clipboard.messages.protocol_error');
                            break;
                        case '消息格式错误':
                            errorMessage = t.get('clipboard.messages.data_format_error');
                            break;
                        default:
                            errorMessage = message.message;
                    }
                }
                
                clipboardState.update(state => ({
                    ...state,
                    isCreating: false,
                    isJoining: false,
                    waitingForCreator: false,
                    errorMessage,
                    showError: true
                }));
                break;
                
            default:
                // 处理未知消息类型，避免显示错误
                console.warn(`⚠️ 收到未知消息类型: ${message.type}`, message);
                
                // 不显示错误提示，只在控制台记录
                // 这避免了用户看到"Unknown message type"的错误
                break;
        }
    }    // WebRTC setup and handlers
    private async setupWebRTC(isInitiator: boolean): Promise<void> {
        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    // Google (全球通用，国内部分可用)
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    
                    // 小米 (国内速度快，推荐)
                    { urls: 'stun:stun.miwifi.com' },
                    
                    // QQ (腾讯，国内稳定)
                    { urls: 'stun:stun.qq.com' },
                    
                    // 3CX (备用)
                    { urls: 'stun:stun.3cx.com' }
                ],
                iceCandidatePoolSize: 10,
                iceTransportPolicy: 'all' // 明确允许所有传输方式，包括局域网
            });

            // Update state with peer connection
            clipboardState.update(state => ({ 
                ...state, 
                peerConnection: this.peerConnection 
            }));

            // 添加ICE连接状态监听
            this.peerConnection.oniceconnectionstatechange = () => {
                const iceState = this.peerConnection?.iceConnectionState;
                console.log('🧊 ICE connection state changed:', iceState);
                
                // 文件选择期间忽略ICE状态变化（本端或对端任一方在选择文件）
                if (this.isSelectingFiles || this.peerIsSelectingFiles) {
                    console.log('📱 文件选择中（本端或对端），忽略ICE状态变化', {
                        localSelecting: this.isSelectingFiles,
                        peerSelecting: this.peerIsSelectingFiles,
                        iceState
                    });
                    return;
                }
                
                if (iceState === 'failed') {
                    console.warn('❌ ICE connection failed, attempting restart...');
                    this.restartIce();
                }
            };

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.ws) {
                    console.log('📡 Sending ICE candidate:', event.candidate.type);
                    this.ws.send(JSON.stringify({
                        type: 'ice_candidate',
                        candidate: event.candidate
                    }));
                }
            };            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection?.connectionState;
                console.log('🔗 Peer connection state changed:', state);
                
                // 文件选择期间忽略连接状态变化（本端或对端任一方在选择文件）
                if (this.isSelectingFiles || this.peerIsSelectingFiles) {
                    console.log('📱 文件选择中（本端或对端），忽略连接状态变化', {
                        localSelecting: this.isSelectingFiles,
                        peerSelecting: this.peerIsSelectingFiles,
                        connectionState: state
                    });
                    return;
                }
                
                // 检测移动设备
                const isMobile = typeof window !== 'undefined' && 
                    (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
                
                if (state === 'connected') {
                    console.log('🎉 Peer connected!');
                    clipboardState.update(state => ({ ...state, peerConnected: true }));

                    // Check for LAN connection
                    this.peerConnection?.getStats().then(stats => {
                        stats.forEach(report => {
                            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                const localCandidate = stats.get(report.localCandidateId);
                                const remoteCandidate = stats.get(report.remoteCandidateId);
                                
                                if (localCandidate && remoteCandidate) {
                                    console.log('📡 Connection candidates:', {
                                        local: localCandidate.candidateType,
                                        remote: remoteCandidate.candidateType,
                                        protocol: localCandidate.protocol
                                    });
                                    
                                    // If both are host candidates, it's likely a LAN connection
                                    const isLocalHost = localCandidate.candidateType === 'host';
                                    const isRemoteHost = remoteCandidate.candidateType === 'host';
                                    
                                    if (isLocalHost && isRemoteHost) {
                                        console.log('🏠 LAN Direct Connection detected!');
                                        clipboardState.update(s => ({ ...s, isLAN: true }));
                                    } else {
                                        clipboardState.update(s => ({ ...s, isLAN: false }));
                                    }
                                }
                            }
                        });
                    });
                    
                    // 移动端额外确认连接状态
                    if (isMobile) {
                        setTimeout(() => {
                            console.log('📱 Mobile peer connection confirmation');
                            clipboardState.update(state => ({ ...state, peerConnected: true }));
                        }, 150);
                    }
                } else if (state === 'failed') {
                    console.warn('❌ Peer connection failed');
                    clipboardState.update(state => ({ ...state, peerConnected: false }));
                    
                    // 暂时禁用自动重启来调试问题
                    //console.log('🚫 Auto-restart disabled for debugging');
                    
                    
                    // 移动端使用更短的重试间隔
                    const retryDelay = isMobile ? 1000 : 2000;
                    setTimeout(() => {
                        if (this.peerConnection?.connectionState === 'failed') {
                            console.log(`🔄 Attempting to restart peer connection (${isMobile ? 'mobile' : 'desktop'})...`);
                            this.restartWebRTC();
                        }
                    }, retryDelay);
                    
                } else if (state === 'disconnected') {
                    console.warn('⚠️ Peer connection disconnected');
                    clipboardState.update(state => ({ ...state, peerConnected: false }));
                    
                    // 暂时禁用移动端快速恢复来调试问题
                    //console.log('🚫 Mobile reconnection disabled for debugging');
                    
                    
                    // 移动端快速恢复尝试
                    if (isMobile) {
                        setTimeout(() => {
                            if (this.peerConnection?.connectionState === 'disconnected') {
                                console.log('📱 Mobile reconnection attempt...');
                                this.restartWebRTC();
                            }
                        }, 800);
                    }
                    
                }
            };if (isInitiator) {
                this.dataChannel = this.peerConnection.createDataChannel('files', {
                    ordered: true,
                    maxPacketLifeTime: 4000 // 允许最长 4 秒重传窗口
                });
                this.setupDataChannel();

                // 为移动端增加延迟，确保ICE candidates收集完成
                await new Promise(resolve => setTimeout(resolve, 500));

                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                console.log('📤 Sending offer to peer...');
                if (this.ws) {
                    this.ws.send(JSON.stringify({
                        type: 'offer',
                        offer
                    }));
                }
            } else {
                this.peerConnection.ondatachannel = (event) => {
                    console.log('📥 Data channel received');
                    this.dataChannel = event.channel;
                    this.setupDataChannel();
                };
            }
        } catch (error) {
            console.error('Error setting up WebRTC:', error);
            // 添加错误恢复
            setTimeout(() => {
                console.log('🔄 Retrying WebRTC setup...');
                this.setupWebRTC(isInitiator);
            }, 3000);
        }
    }

    // 添加ICE重启方法
    private async restartIce(): Promise<void> {
        try {
            if (this.peerConnection && this.peerConnection.connectionState !== 'closed') {
                console.log('🔄 Restarting ICE...');
                await this.peerConnection.restartIce();
            }
        } catch (error) {
            console.error('Error restarting ICE:', error);
        }
    }

    // 添加WebRTC重启方法
    private async restartWebRTC(): Promise<void> {
        try {
            console.log('🔄 Restarting WebRTC connection...');
            
            // 清理现有连接
            if (this.dataChannel) {
                this.dataChannel.close();
                this.dataChannel = null;
            }
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            // 获取当前状态以确定是否为发起者
            let currentState: any = {};
            const unsubscribe = clipboardState.subscribe(s => currentState = s);
            unsubscribe();

            // 重新建立连接
            await this.setupWebRTC(currentState.isCreator);
        } catch (error) {
            console.error('Error restarting WebRTC:', error);
        }
    }    private setupDataChannel(): void {
        if (!this.dataChannel) return;

        this.resetBufferedAmountWaiters();

        this.dataChannel.binaryType = 'arraybuffer';
        this.dataChannel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
        this.dataChannel.onbufferedamountlow = () => {
            this.resolveBufferedAmountLow();
        };

        // Update state with data channel
        clipboardState.update(state => ({ 
            ...state, 
            dataChannel: this.dataChannel 
        }));

        this.dataChannel.onopen = () => {
            console.log('🎉 Data channel opened!');
            console.log('📊 Data channel state:', this.dataChannel?.readyState);
            
            // 设置强制连接标记，防止状态检查器覆盖
            this.dataChannelForceConnected = true;
            
            // 强制设置 peerConnected 为 true 并保持
            console.log('🔄 Force setting peerConnected to true');
            clipboardState.update(state => ({ ...state, peerConnected: true }));
            
            // 额外的确认机制
            setTimeout(() => {
                console.log('🔄 Second confirmation: peerConnected = true');
                clipboardState.update(state => ({ ...state, peerConnected: true }));
            }, 100);
            
            setTimeout(() => {
                if (this.dataChannel?.readyState === 'open') {
                    console.log('� Third confirmation: peerConnected = true');
                    clipboardState.update(state => ({ ...state, peerConnected: true }));
                }
            }, 1000);

            this.resolveBufferedAmountLow();
        };

        this.dataChannel.onclose = () => {
            console.log('❌ Data channel closed', {
                isSelectingFiles: this.isSelectingFiles,
                peerIsSelectingFiles: this.peerIsSelectingFiles,
                fileSelectDuration: this.fileSelectStartTime ? Date.now() - this.fileSelectStartTime : 0
            });
            
            // 文件选择期间完全阻止DataChannel关闭事件处理（本端或对端任一方在选择文件）
            if (this.isSelectingFiles || this.peerIsSelectingFiles) {
                console.log('📱 文件选择中（本端或对端），完全忽略DataChannel关闭事件，保持连接状态', {
                    localSelecting: this.isSelectingFiles,
                    peerSelecting: this.peerIsSelectingFiles
                });
                // 强制保持连接状态
                clipboardState.update(currentState => ({ 
                    ...currentState, 
                    peerConnected: true 
                }));
                return;
            }
            
            clipboardState.update(state => ({ ...state, peerConnected: false }));

            this.resolveBufferedAmountLow();
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
            // 移动端错误恢复机制
            const isMobile = typeof window !== 'undefined' && 
                (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
            if (isMobile) {
                console.log('📱 Mobile data channel error, attempting recovery...');
                setTimeout(() => {
                    if (this.dataChannel?.readyState === 'open') {
                        clipboardState.update(state => ({ ...state, peerConnected: true }));
                    }
                }, 500);
            }
        };        this.dataChannel.onmessage = async (event) => {
            try {
                await this.handleDataChannelMessage(event.data);
            } catch (error) {
                console.error('Error handling data channel message:', error);
            }
        };
    }

    private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(offer);
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                if (this.ws) {
                    this.ws.send(JSON.stringify({
                        type: 'answer',
                        answer
                    }));
                }
            }
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        try {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(answer);
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }    private async handleDataChannelMessage(data: any): Promise<void> {
        // 检查是否为二进制数据
        if (data instanceof ArrayBuffer) {
            await this.handleBinaryMessage(data);
            return;
        }
        
        // 处理JSON消息（file_start, file_end, text等）
        try {
            const message = typeof data === 'string' ? JSON.parse(data) : data;
            
            switch (message.type) {
                case 'text':
                    // Convert array back to ArrayBuffer for decryption
                    const encryptedBuffer = new Uint8Array(message.content).buffer;
                    const decryptedText = await this.decryptData(encryptedBuffer);
                    clipboardState.update(state => ({
                        ...state,
                        receivedText: decryptedText,
                        activeTab: 'text'
                    }));
                    break;
                    
                case 'file_start':
                    await this.handleFileStart(message);
                    break;
                    
                case 'file_end':
                    await this.handleFileEnd(message);
                    break;
                    
                case 'retry_chunks':
                    await this.handleRetryChunksRequest(message);
                    break;
                    
                case 'file_cancel':
                    console.log('🚫 收到DataChannel取消信号');
                    this.handleFileCancellation(message);
                    break;
                    
                case 'file_cancel_ack':
                    console.log('🚫 收到DataChannel取消确认');
                    this.handleCancelAcknowledgment(message);
                    break;
            }
        } catch (error) {
            console.error('Error parsing JSON message:', error);
        }
    }

    private async handleBinaryMessage(data: ArrayBuffer): Promise<void> {
        try {
            const view = new DataView(data);
            const uint8View = new Uint8Array(data);
            
            let offset = 0;
            
            // 读取消息类型
            const messageType = view.getUint8(offset);
            offset += 1;
            
            if (messageType === 0x01) { // file_chunk
                // 读取fileId长度
                const fileIdLength = view.getUint8(offset);
                offset += 1;
                
                // 读取fileId
                const fileIdBytes = uint8View.slice(offset, offset + fileIdLength);
                const fileId = new TextDecoder().decode(fileIdBytes);
                offset += fileIdLength;
                
                // 读取chunkIndex
                const chunkIndex = view.getUint32(offset, true);
                offset += 4;
                
                // 读取totalChunks
                const totalChunks = view.getUint32(offset, true);
                offset += 4;
                
                // 剩余的就是加密的chunk数据
                const encryptedChunkData = uint8View.slice(offset);
                
                await this.handleFileChunkOptimized(fileId, chunkIndex, totalChunks, encryptedChunkData);
            }
        } catch (error) {
            console.error('Error handling binary message:', error);
        }
    }

    private async handleFileStart(data: any): Promise<void> {
        console.log(`📁 开始接收新文件: ${data.name}, ID: ${data.fileId}`);
        
        // 🚫 检查传输是否已被取消
        if (this.cancelTransmission) {
            console.log('🚫', t.get('clipboard.messages.refuse_new_file_cancelled').replace('{fileName}', data.name));
            return;
        }

        await this.acquireMobilePowerProtection('receiving');
        
        // 检查是否已经在接收同一个文件
        if (this.currentReceivingFile && this.currentReceivingFile.id === data.fileId) {
            console.log(`⚠️ 文件 ${data.fileId} 已在接收中，忽略重复的 file_start`);
            return;
        }
        
        // 如果有其他文件正在接收，强制清理并开始新文件
        if (this.currentReceivingFile) {
            console.log(`🧹 清理之前的接收文件: ${this.currentReceivingFile.name} (ID: ${this.currentReceivingFile.id})`);
            
            // 清理重传定时器
            if (this.currentReceivingFile.retryTimer) {
                clearTimeout(this.currentReceivingFile.retryTimer);
                this.currentReceivingFile.retryTimer = undefined;
            }
            
            // 重置接收状态
            this.currentReceivingFile = null;
        }
        
        // 检查文件大小是否超出限制
        if (data.size > MAX_FILE_SIZE) {
            const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
            const fileSizeMB = Math.round(data.size / (1024 * 1024) * 100) / 100;
            
            clipboardState.update(state => ({
                ...state,
                errorMessage: t.get('clipboard.messages.file_too_large')
                    .replace('{fileName}', data.name)
                    .replace('{fileSize}', fileSizeMB.toString())
                    .replace('{maxSize}', maxSizeMB.toString()),
                showError: true
            }));
            return;
        }
        
        // Start receiving a new file
        this.currentReceivingFile = {
            id: data.fileId,
            name: data.name,
            size: data.size,
            type: data.mimeType || data.type,
            chunks: new Map<number, Uint8Array>(),
            receivedChunks: 0,
            totalChunks: 0,
            receivedSize: 0,
            retryCount: 0,
            lastRetryTime: 0,
            missingChunks: new Set<number>(),
            lastActivity: Date.now()
        };
        
        clipboardState.update(state => ({ 
            ...state, 
            receivingFiles: true, 
            transferProgress: 0,
            activeTab: 'files',
            errorMessage: '',
            showError: false,
            isTransferring: true // 设置传输状态
        }));
    }

    private async handleFileChunkOptimized(fileId: string, chunkIndex: number, totalChunks: number, encryptedChunkData: Uint8Array): Promise<void> {
        const receivingFile = this.currentReceivingFile;
        
        if (!receivingFile) {
            console.warn(`⚠️ 收到chunk但没有当前接收文件: fileId=${fileId}, chunk=${chunkIndex}`);
            return;
        }
        
        if (receivingFile.id !== fileId) {
            console.warn(`⚠️ FileID不匹配: 期望=${receivingFile.id}, 收到=${fileId}, chunk=${chunkIndex}`);
            console.log(`🔄 当前接收文件: ${receivingFile.name}, 新FileID: ${fileId}`);
            return;
        }
        
        // 🚫 检查传输是否已被取消
        if (this.cancelTransmission) {
            console.log('🚫', t.get('clipboard.messages.discard_chunk_cancelled').replace('{fileId}', fileId).replace('{chunkIndex}', chunkIndex.toString()));
            return;
        }
        
        // 更新最后活动时间
        receivingFile.lastActivity = Date.now();
        
        try {
            // 解密chunk数据
            const decryptedChunk = await this.decryptBinaryData(encryptedChunkData.buffer as ArrayBuffer);
            
            // 检查是否为重复chunk
            const isNewChunk = !receivingFile.chunks.has(chunkIndex);
            
            // 存储chunk数据
            receivingFile.chunks.set(chunkIndex, decryptedChunk);
            
            // 从缺失列表中移除这个chunk
            if (receivingFile.missingChunks.has(chunkIndex)) {
                receivingFile.missingChunks.delete(chunkIndex);
            }
            
            // 只有新chunk才增加计数和大小
            if (isNewChunk) {
                receivingFile.receivedChunks++;
                receivingFile.receivedSize += decryptedChunk.length;
            }
            
            receivingFile.totalChunks = totalChunks;
            
            // 更新接收进度
            const progress = Math.round((receivingFile.receivedChunks / totalChunks) * 100);
            
            clipboardState.update(state => ({ 
                ...state, 
                transferProgress: Math.min(progress, 100) 
            }));
            
            // 检查是否接收完成
            const actualReceivedChunks = receivingFile.chunks.size;
            this.maybeScheduleChunkRecovery(receivingFile, chunkIndex);
            
            if (actualReceivedChunks === totalChunks) {
                // 清除重传定时器
                if (receivingFile.retryTimer) {
                    clearTimeout(receivingFile.retryTimer);
                    receivingFile.retryTimer = undefined;
                }
                
                await this.assembleReceivedFile();
            }
        } catch (error) {
            console.error('Error processing file chunk:', error);
        }
    }

    private async handleRetryChunksRequest(message: any): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }

        const { fileId, missingChunks } = message;
        if (!fileId || !Array.isArray(missingChunks) || missingChunks.length === 0) {
            return;
        }

        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.warn('⚠️ 无法处理重传请求，DataChannel 未就绪');
            return;
        }

        const transfer = this.outgoingFileTransfers.get(fileId);
        if (!transfer) {
            console.warn(`⚠️ 未找到文件 ${fileId} 的发送记录，无法重传`);
            return;
        }

        console.log(`🔁 收到文件 ${fileId} 的重传请求，缺失 chunks: ${missingChunks.join(', ')}`);

        const uniqueSortedChunks = Array.from(new Set(missingChunks.map((idx: any) => Number(idx)))).filter(idx => Number.isFinite(idx) && idx >= 0 && idx < transfer.totalChunks).sort((a, b) => a - b);

        for (const chunkIndex of uniqueSortedChunks) {
            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                console.warn('⚠️ DataChannel 在重传过程中关闭');
                break;
            }

            if (this.cancelTransmission) {
                console.warn('⚠️ 重传过程中传输被取消');
                break;
            }

            if (this.dataChannel.bufferedAmount >= MAX_BUFFER_SIZE) {
                await this.waitForBufferedAmountLow();
            }

            try {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, transfer.file.size);
                const chunkBuffer = await transfer.file.slice(start, end).arrayBuffer();
                const encryptedChunk = await this.encryptBinaryData(new Uint8Array(chunkBuffer));
                const binaryMessage = this.createBinaryChunkMessage(fileId, chunkIndex, transfer.totalChunks, encryptedChunk);
                this.dataChannel.send(binaryMessage);
                console.log(`🔁 已重传 chunk ${chunkIndex} / ${transfer.totalChunks - 1} (fileId=${fileId})`);
            } catch (error) {
                console.error(`❌ 重传 chunk ${chunkIndex} 失败:`, error);
            }
        }

        // 重置清理计时器，确保在进一步重传请求时仍保留文件引用
        this.scheduleOutgoingTransferCleanup(fileId);
    }

    private async handleFileEnd(data: any): Promise<void> {
        const receivingFile = this.currentReceivingFile;
        
        if (!receivingFile) {
            console.warn(`⚠️ 收到file_end但没有当前接收文件: fileId=${data.fileId}`);
            return;
        }
        
        if (receivingFile.id !== data.fileId) {
            console.warn(`⚠️ file_end FileID不匹配: 期望=${receivingFile.id}, 收到=${data.fileId}`);
            return;
        }
        
        // 🚫 检查传输是否已被取消
        if (this.cancelTransmission) {
            console.log('🚫', t.get('clipboard.messages.ignore_end_signal_cancelled').replace('{fileName}', receivingFile.name));
            return;
        }
        
        console.log(`📁 文件传输结束: ${receivingFile.name} (ID: ${receivingFile.id})`);
        
        // 检查哪些chunks缺失
        const missingChunks: number[] = [];
        for (let i = 0; i < receivingFile.totalChunks; i++) {
            if (!receivingFile.chunks.has(i)) {
                missingChunks.push(i);
            }
        }
        
        if (missingChunks.length === 0) {
            console.log(`✅ 文件 ${receivingFile.name} 接收完整，开始组装`);
            
            // 清除重传定时器
            if (receivingFile.retryTimer) {
                clearTimeout(receivingFile.retryTimer);
                receivingFile.retryTimer = undefined;
            }
            
            await this.assembleReceivedFile();
        } else {
            console.log(`🔄 文件 ${receivingFile.name} 缺失 ${missingChunks.length} 个chunks，启动重传: [${missingChunks.slice(0, 10).join(', ')}${missingChunks.length > 10 ? '...' : ''}]`);
            this.scheduleRetryMissingChunks(receivingFile, missingChunks);

            clipboardState.update(state => ({
                ...state,
                receivingFiles: true,
                errorMessage: `正在请求重传缺失的 ${missingChunks.length} 个分块…`,
                showError: true
            }));
        }
    }

    private async assembleReceivedFile(): Promise<void> {
        const receivingFile = this.currentReceivingFile;
        if (!receivingFile) {
            return;
        }
        
        try {
            // 检查chunk完整性
            const missingChunks = [];
            let totalActualSize = 0;
            
            for (let i = 0; i < receivingFile.totalChunks; i++) {
                const chunk = receivingFile.chunks.get(i);
                if (chunk) {
                    totalActualSize += chunk.length;
                } else {
                    missingChunks.push(i);
                }
            }
            
            if (missingChunks.length > 0) {
                await this.assembleReceivedFileWithMissingChunks(missingChunks);
                return;
            }
            
            // 按顺序组装所有chunks
            const totalSize = receivingFile.receivedSize;
            const combinedArray = new Uint8Array(totalSize);
            let offset = 0;
            
            // 按chunk索引顺序组装
            for (let i = 0; i < receivingFile.totalChunks; i++) {
                const chunk = receivingFile.chunks.get(i);
                if (chunk) {
                    combinedArray.set(chunk, offset);
                    offset += chunk.length;
                } else {
                    console.error(`Missing chunk ${i} for file ${receivingFile.name}`);
                    return;
                }
            }
            
            const blob = new Blob([combinedArray], { type: receivingFile.type });
            const fileItem: FileItem = {
                name: receivingFile.name,
                size: receivingFile.size,
                type: receivingFile.type,
                blob: blob
            };
            
            console.log(`✅ 文件组装完成: ${receivingFile.name} (${receivingFile.size} bytes)`);
            
            // Add to received files
            clipboardState.update(state => ({
                ...state,
                receivedFiles: [...state.receivedFiles, fileItem],
                receivingFiles: false,
                transferProgress: 0,
                isTransferring: false, // 清除传输状态
                errorMessage: `成功接收文件: ${receivingFile.name}`,
                showError: true
            }));
            
            // 3秒后清除成功消息
            setTimeout(() => {
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: '',
                    showError: false
                }));
            }, 3000);
            
            console.log(`🧹 清理接收文件状态: ${receivingFile.name} (ID: ${receivingFile.id})`);
            this.currentReceivingFile = null;
            this.releaseMobilePowerProtection('receiving');
        } catch (error) {
            console.error('Error assembling received file:', error);
        }
    }

    // 重传机制相关方法
    private scheduleRetryMissingChunks(receivingFile: ReceivingFile, missingChunks: number[]): void {
        // 如果已经有重传定时器在运行，先清除
        if (receivingFile.retryTimer) {
            clearTimeout(receivingFile.retryTimer);
        }
        
        // 更新缺失的chunks列表
        missingChunks.forEach(chunkIndex => {
            receivingFile.missingChunks.add(chunkIndex);
        });
        
        // 设置重传定时器
        receivingFile.retryTimer = setTimeout(() => {
            this.requestMissingChunks(receivingFile);
        }, RETRY_TIMEOUT);
    }
    
    private async requestMissingChunks(receivingFile: ReceivingFile): Promise<void> {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }
        
        if (receivingFile.retryCount >= MAX_RETRY_COUNT) {
            const currentMissingChunks = Array.from(receivingFile.missingChunks);
            await this.assembleReceivedFileWithMissingChunks(currentMissingChunks);
            return;
        }
        
        const currentMissingChunks = Array.from(receivingFile.missingChunks);
        if (currentMissingChunks.length === 0) {
            return;
        }
        
        receivingFile.retryCount++;
        receivingFile.lastRetryTime = Date.now();
        
        try {
            // 发送重传请求
            const retryMessage = {
                type: 'retry_chunks',
                fileId: receivingFile.id,
                missingChunks: currentMissingChunks,
                retryCount: receivingFile.retryCount
            };
            
            this.dataChannel.send(JSON.stringify(retryMessage));
            
            // 设置下次重传定时器
            receivingFile.retryTimer = setTimeout(() => {
                this.requestMissingChunks(receivingFile);
            }, RETRY_DELAY * receivingFile.retryCount); // 指数退避
            
        } catch (error) {
            console.error('发送重传请求失败:', error);
        }
    }

    private async assembleReceivedFileWithMissingChunks(missingChunks: number[]): Promise<void> {
        const receivingFile = this.currentReceivingFile;
        if (!receivingFile) {
            return;
        }

        console.error(`❌ 文件 ${receivingFile.name} 无法完成接收，缺失 ${missingChunks.length} 个分块: [${missingChunks.slice(0, 10).join(', ')}${missingChunks.length > 10 ? '...' : ''}]`);

        if (receivingFile.retryTimer) {
            clearTimeout(receivingFile.retryTimer);
            receivingFile.retryTimer = undefined;
        }

        clipboardState.update(state => ({
            ...state,
            receivingFiles: false,
            transferProgress: 0,
            isTransferring: false,
            errorMessage: `文件 ${receivingFile.name} 传输失败，缺失 ${missingChunks.length} 个分块`,
            showError: true
        }));

        setTimeout(() => {
            clipboardState.update(state => ({
                ...state,
                errorMessage: '',
                showError: false
            }));
        }, 5000);

        this.currentReceivingFile = null;
        this.releaseMobilePowerProtection('receiving');
    }

    // Public methods for sending data
    async sendText(text: string): Promise<void> {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.error('Data channel not ready');
            return;
        }        try {
            // 自动切换到文本分享标签
            clipboardState.update(state => ({ ...state, activeTab: 'text' }));
            
            const encryptedText = await this.encryptData(text);
            // Convert ArrayBuffer to Array for JSON serialization
            const encryptedArray = Array.from(new Uint8Array(encryptedText));
            const message = {
                type: 'text',
                content: encryptedArray
            };
            
            this.dataChannel.send(JSON.stringify(message));
        } catch (error) {
            console.error('Error sending text:', error);
        }
    }
    
    async sendFiles(): Promise<void> {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.error('Data channel not ready');
            this.showError(t.get('clipboard.messages.connection_not_ready'));
            return;
        }
        
        // 检查是否已经在发送文件，防止并发发送
        if (this.isSendingFiles) {
            console.warn('⚠️ 文件发送正在进行中，请等待当前发送完成');
            this.showError(t.get('clipboard.messages.file_sending_in_progress'));
            
            // 3秒后自动清除警告消息
            setTimeout(() => {
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: '',
                    showError: false
                }));
            }, 3000);
            return;
        }
        
        // 检查是否正在接收文件，防止并发传输
        if (this.currentReceivingFile) {
            console.warn('⚠️ 正在接收文件，无法同时发送文件');
            this.showError(t.get('clipboard.messages.receiving_files_wait'));
            
            // 3秒后自动清除警告消息
            setTimeout(() => {
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: '',
                    showError: false
                }));
            }, 3000);
            return;
        }
        
        let currentFiles: File[] = [];
        const unsubscribe = clipboardState.subscribe(state => {
            currentFiles = state.files;
        });
        unsubscribe();
        
        console.log(`📤 准备发送文件，当前文件列表:`, currentFiles.map(f => `${f.name} (${f.size} bytes)`));
        
        if (currentFiles.length === 0) {
            console.log('No files to send');
            return;
        }
        
        // 检查文件大小限制
        const oversizedFiles = currentFiles.filter(file => file.size > MAX_FILE_SIZE);
        if (oversizedFiles.length > 0) {
            const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
            this.showError(t.get('clipboard.messages.files_too_large')
                .replace('{maxSize}', maxSizeMB.toString())
                .replace('{fileNames}', oversizedFiles.map(f => f.name).join(', ')));
            return;
        }
        
        const shouldProtectMobilePower = this.isMobileDevice();
        if (shouldProtectMobilePower) {
            await this.acquireMobilePowerProtection('sending');
        }

        // 设置发送锁
        this.isSendingFiles = true;
        console.log('🔒 设置文件发送锁');
        
        // 计算总大小
        const totalSize = currentFiles.reduce((sum, file) => sum + file.size, 0);
        
        try {
            // 自动切换到文件传输标签
            clipboardState.update(state => ({ 
                ...state, 
                sendingFiles: true, 
                transferProgress: 0,
                activeTab: 'files',
                errorMessage: '',
                showError: false,
                isTransferring: true // 设置传输状态
            }));
            console.log('Switched to files tab for sending');
            
            for (let i = 0; i < currentFiles.length; i++) {
                // 🚫 检查传输是否已被取消
                if (this.cancelTransmission) {
                    console.log('🚫 多文件发送被取消，停止发送剩余文件', {
                        currentFile: i,
                        totalFiles: currentFiles.length,
                        fileName: currentFiles[i]?.name
                    });
                    throw new Error('传输被用户取消');
                }
                
                const file = currentFiles[i];
                
                await this.sendSingleFile(file);
                
                // Update progress for multiple files (individual file progress is handled in sendFileInBinaryChunks)
                if (currentFiles.length > 1) {
                    const progress = ((i + 1) / currentFiles.length) * 100;
                    clipboardState.update(state => ({ ...state, transferProgress: progress }));
                }
            }
            
            clipboardState.update(state => ({ 
                ...state, 
                sendingFiles: false, 
                transferProgress: 0,
                files: [], // 清空文件列表，防止重复发送
                isTransferring: false // 清除传输状态
            }));

            console.log('✅ 所有文件发送完成，已清空文件列表');
            
            // 释放发送锁
            this.isSendingFiles = false;
            console.log('🔓 释放文件发送锁');
            
            // 显示成功消息
            setTimeout(() => {
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: t.get('clipboard.messages.files_sent_successfully').replace('{count}', currentFiles.length.toString()),
                    showError: true
                }));
                
                // 3秒后自动清除成功消息
                setTimeout(() => {
                    clipboardState.update(state => ({
                        ...state,
                        errorMessage: '',
                        showError: false
                    }));
                }, 3000);
            }, 100);
            
        } catch (error) {
            console.error('❌ 发送文件时出错:', error);
            const errorMessage = error instanceof Error ? error.message : t.get('clipboard.messages.send_failed').replace('{error}', '未知错误');
            
            // 区分取消和真正的错误
            const isCancelled = this.cancelTransmission || errorMessage.includes('取消');
            const displayMessage = isCancelled ? t.get('clipboard.messages.transmission_cancelled') : t.get('clipboard.messages.send_failed').replace('{error}', errorMessage);
            
            clipboardState.update(state => ({ 
                ...state, 
                sendingFiles: false, 
                transferProgress: 0,
                files: [], // 出错时也清空文件列表
                isTransferring: false, // 清除传输状态
                errorMessage: displayMessage,
                showError: true
            }));
            
            // 释放发送锁和清理状态
            this.isSendingFiles = false;
            this.currentSendingFileId = null;
            this.cancelTransmission = false;
            console.log('🔓 发送失败/取消，释放文件发送锁');
        }
        finally {
            if (shouldProtectMobilePower) {
                this.releaseMobilePowerProtection('sending');
            }
        }
    }

    private async sendSingleFile(file: File): Promise<void> {
        // 🚫 检查传输是否已被取消
        if (this.cancelTransmission) {
            console.log('🚫 单文件发送被取消:', file.name);
            throw new Error('传输被用户取消');
        }
        
    // 生成唯一的文件ID
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    this.outgoingFileTransfers.set(fileId, { file, totalChunks });
        
        // 设置当前发送文件ID
        this.currentSendingFileId = fileId;
        
        console.log(`📤 开始发送文件: ${file.name} (ID: ${fileId}, 大小: ${file.size} bytes)`);
        
        try {
            // Send file start message (仍使用JSON，因为信息量小)
            const fileStartMessage = {
                type: 'file_start',
                fileId: fileId,
                name: file.name,
                size: file.size,
                mimeType: file.type
            };
            
            this.dataChannel!.send(JSON.stringify(fileStartMessage));
            console.log(`📤 已发送 file_start: ${file.name} (ID: ${fileId})`);
            
            // 使用流式处理避免大文件全部加载到内存
            await this.sendFileInBinaryChunks(file, fileId, totalChunks);
            
            // 🚫 检查传输是否已被取消（在发送结束信号前）
            if (this.cancelTransmission) {
                console.log('🚫 传输被取消，不发送 file_end 信号:', file.name);
                throw new Error('传输被用户取消');
            }
            
            // Send file end message
            const fileEndMessage = {
                type: 'file_end',
                fileId: fileId,
                name: file.name
            };
            
            this.dataChannel!.send(JSON.stringify(fileEndMessage));
            console.log(`📤 已发送 file_end: ${file.name} (ID: ${fileId})`);
            this.scheduleOutgoingTransferCleanup(fileId);
            
        } catch (error) {
            // 传输出错时清理文件ID
            this.currentSendingFileId = null;
            this.clearOutgoingFileTransfer(fileId);
            throw error; // 重新抛出错误
        } finally {
            // 成功完成时清理文件ID
            if (!this.cancelTransmission) {
                this.currentSendingFileId = null;
            }
        }
    }

    private async sendFileInBinaryChunks(file: File, fileId: string, totalChunks?: number): Promise<void> {
        const resolvedTotalChunks = totalChunks ?? Math.ceil(file.size / CHUNK_SIZE);
        const fileSizeMB = Math.round(file.size / (1024 * 1024) * 100) / 100;
        console.log(`开始发送文件: ${file.name} (${fileSizeMB}MB, ${resolvedTotalChunks} 个分块)`);
        
        let consecutiveSends = 0;
        const sentChunks = new Set<number>(); // 记录已发送的chunks
        
        for (let i = 0; i < resolvedTotalChunks; i++) {
            // 🔥 关键：检查取消标志
            if (this.cancelTransmission) {
                console.log('🚫 发送被取消，停止发送chunks', {
                    file: file.name,
                    chunkIndex: i,
                    totalChunks
                });
                throw new Error('传输被用户取消');
            }
            
            // 检查连接状态
            if (this.dataChannel?.readyState !== 'open') {
                console.log('🚫 DataChannel连接断开，停止发送', {
                    file: file.name,
                    readyState: this.dataChannel?.readyState
                });
                throw new Error(t.get('clipboard.messages.connection_disconnected'));
            }
            
            // 智能流控制
            await this.smartFlowControl(consecutiveSends);
            
            // 流式读取文件块，而不是全部加载到内存
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const fileSlice = file.slice(start, end);
            const chunkBuffer = await fileSlice.arrayBuffer();
            
            // 加密数据块
            const encryptedChunk = await this.encryptBinaryData(new Uint8Array(chunkBuffer));
            
            // 创建二进制消息
            const binaryMessage = this.createBinaryChunkMessage(fileId, i, resolvedTotalChunks, encryptedChunk);
            
            // 发送二进制数据
            this.dataChannel!.send(binaryMessage);
            consecutiveSends++;
            sentChunks.add(i); // 记录已发送
            
            // 在最后几个chunks时添加额外日志
            if (i >= resolvedTotalChunks - 5) {
                console.log(`📤 发送chunk ${i}/${resolvedTotalChunks - 1}, 文件: ${file.name}`);
            }
            
            // 更新进度（减少频率以提高性能）
            if (i % 5 === 0 || i === resolvedTotalChunks - 1) {
                const progress = Math.round(((i + 1) / resolvedTotalChunks) * 100);
                console.log(`${file.name} 发送进度: ${progress}%`);
                
                // 更新UI状态
                clipboardState.update(state => ({
                    ...state,
                    transferProgress: progress
                }));
            }
        }
        
        // 验证所有chunks都已发送
        console.log(`📤 文件发送完成验证: ${file.name}, 发送了 ${sentChunks.size}/${resolvedTotalChunks} 个chunks`);
        if (sentChunks.size !== resolvedTotalChunks) {
            const missingChunks = [];
            for (let i = 0; i < resolvedTotalChunks; i++) {
                if (!sentChunks.has(i)) {
                    missingChunks.push(i);
                }
            }
            console.error(`❌ 发送端缺失chunks: [${missingChunks.join(', ')}]`);
        }
    }

    private async smartFlowControl(consecutiveSends: number): Promise<void> {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }

        if (this.dataChannel.bufferedAmount >= MAX_BUFFER_SIZE) {
            await this.waitForBufferedAmountLow();

            if (this.cancelTransmission) {
                throw new Error('传输被用户取消');
            }
        }

        // 每发送20个chunk给浏览器喘息机会
        if (consecutiveSends % 20 === 0 && consecutiveSends > 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    }

    private async waitForBufferedAmountLow(): Promise<void> {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            return;
        }

        if (this.dataChannel.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
            return;
        }

        if (!this.bufferedAmountLowPromise) {
            this.bufferedAmountLowPromise = new Promise(resolve => {
                this.bufferedAmountLowResolver = () => {
                    this.bufferedAmountLowPromise = null;
                    this.bufferedAmountLowResolver = null;
                    resolve();
                };
            });

            const interval = setInterval(() => {
                if (!this.dataChannel || this.dataChannel.readyState !== 'open' || this.cancelTransmission || this.dataChannel.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
                    clearInterval(interval);
                    this.resolveBufferedAmountLow();
                }
            }, BUFFER_CHECK_INTERVAL);

            this.bufferedAmountLowPromise.then(
                () => clearInterval(interval),
                () => clearInterval(interval)
            );
        }

        await this.bufferedAmountLowPromise;
    }

    private resolveBufferedAmountLow(): void {
        if (this.bufferedAmountLowResolver) {
            const resolver = this.bufferedAmountLowResolver;
            this.bufferedAmountLowResolver = null;
            this.bufferedAmountLowPromise = null;
            resolver();
        }
    }

    private resetBufferedAmountWaiters(): void {
        this.resolveBufferedAmountLow();
        this.bufferedAmountLowPromise = null;
        this.bufferedAmountLowResolver = null;
    }

    private scheduleOutgoingTransferCleanup(fileId: string): void {
        const transfer = this.outgoingFileTransfers.get(fileId);
        if (!transfer) {
            return;
        }

        if (transfer.cleanupTimer) {
            clearTimeout(transfer.cleanupTimer);
        }

        transfer.cleanupTimer = setTimeout(() => {
            this.outgoingFileTransfers.delete(fileId);
        }, 60_000); // 保留1分钟用于可能的重传请求
    }

    private clearOutgoingFileTransfer(fileId: string): void {
        const transfer = this.outgoingFileTransfers.get(fileId);
        if (transfer?.cleanupTimer) {
            clearTimeout(transfer.cleanupTimer);
        }
        this.outgoingFileTransfers.delete(fileId);
    }

    private maybeScheduleChunkRecovery(receivingFile: ReceivingFile, latestChunkIndex: number): void {
        if (!receivingFile.totalChunks) {
            return;
        }

        const totalChunks = receivingFile.totalChunks;
        const receivedCount = receivingFile.chunks.size;

        if (receivedCount >= totalChunks) {
            return;
        }

        const shouldScan =
            latestChunkIndex === totalChunks - 1 ||
            receivedCount % 10 === 0 ||
            (receivingFile.retryCount > 0 && Date.now() - receivingFile.lastRetryTime > RETRY_DELAY);

        if (!shouldScan) {
            return;
        }

        const missingChunks: number[] = [];
        for (let i = 0; i < totalChunks; i++) {
            if (!receivingFile.chunks.has(i)) {
                missingChunks.push(i);
            }
        }

        if (missingChunks.length > 0) {
            this.scheduleRetryMissingChunks(receivingFile, missingChunks);
        }
    }

    private createBinaryChunkMessage(fileId: string, chunkIndex: number, totalChunks: number, encryptedData: ArrayBuffer): ArrayBuffer {
        // 创建紧凑的二进制头部
        const fileIdBytes = new TextEncoder().encode(fileId);
        const headerSize = 1 + 1 + fileIdBytes.length + 4 + 4; // type + fileIdLen + fileId + chunkIndex + totalChunks
        
        const totalSize = headerSize + encryptedData.byteLength;
        const message = new ArrayBuffer(totalSize);
        const view = new DataView(message);
        const uint8View = new Uint8Array(message);
        
        let offset = 0;
        
        // 消息类型标识 (1 byte) - 0x01 = file_chunk
        view.setUint8(offset, 0x01);
        offset += 1;
        
        // fileId长度 (1 byte)
        view.setUint8(offset, fileIdBytes.length);
        offset += 1;
        
        // fileId
        uint8View.set(fileIdBytes, offset);
        offset += fileIdBytes.length;
        
        // chunkIndex (4 bytes)
        view.setUint32(offset, chunkIndex, true);
        offset += 4;
        
        // totalChunks (4 bytes)
        view.setUint32(offset, totalChunks, true);
        offset += 4;
        
        // 加密的数据块
        uint8View.set(new Uint8Array(encryptedData), offset);
        
        return message;
    }

    // Expose peer connection and data channel for debug panel
    get debugInfo() {
        return {
            peerConnection: this.peerConnection,
            dataChannel: this.dataChannel,
            sharedKey: this.sharedKey ? 'Present' : 'Not available'
        };
    }
    
    // 文件大小验证
    validateFileSize(file: File): { valid: boolean; error?: string } {
        if (file.size > MAX_FILE_SIZE) {
            const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
            return {
                valid: false,
                error: `文件 "${file.name}" 大小超过 ${maxSizeMB}MB 限制`
            };
        }
        return { valid: true };
    }
    
    // 检查是否可以发送文件
    canSendFiles(): { canSend: boolean; reason?: string } {
        const state = this.getCurrentState();
        
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            return {
                canSend: false,
                reason: '连接未准备就绪'
            };
        }
        
        if (state.isTransferring) {
            return {
                canSend: false,
                reason: '有文件正在传输中'
            };
        }
        
        if (this.isSendingFiles) {
            return {
                canSend: false,
                reason: '正在发送文件'
            };
        }
        
        if (this.currentReceivingFile) {
            return {
                canSend: false,
                reason: '正在接收文件'
            };
        }
        
        return { canSend: true };
    }
    
    // 格式化文件大小显示
    formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = bytes / Math.pow(1024, i);
        
        return `${Math.round(size * 100) / 100} ${sizes[i]}`;
    }
    
    // 获取DataChannel缓冲区状态
    getBufferStatus(): { bufferedAmount: number; isOverloaded: boolean } {
        if (!this.dataChannel) {
            return { bufferedAmount: 0, isOverloaded: false };
        }
        
        return {
            bufferedAmount: this.dataChannel.bufferedAmount,
            isOverloaded: this.dataChannel.bufferedAmount > MAX_BUFFER_SIZE
        };
    }
}
