// WebRTC and WebSocket management composable
import { writable } from 'svelte/store';
import { currentApiURL } from '$lib/api/api-url';
import QRCode from 'qrcode';

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
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for file transfer
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB file size limit
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB buffer threshold
const BUFFER_CHECK_INTERVAL = 10; // 10ms buffer check interval
const RETRY_TIMEOUT = 3000; // 3秒后检查缺失的chunks
const MAX_RETRY_COUNT = 3; // 最大重传次数
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
        // 在移动端使用更频繁的状态检查以确保UI及时更新
        const isMobile = typeof window !== 'undefined' && 
            (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
        const checkInterval = isMobile ? 500 : 1000; // 移动端500ms，桌面端1秒
        
        this.statusInterval = setInterval(() => {
            const wsConnected = this.ws?.readyState === WebSocket.OPEN;
            const dataChannelOpen = this.dataChannel?.readyState === 'open';
            
            // 获取当前状态避免不必要的更新
            let currentState: any = {};
            const unsubscribe = clipboardState.subscribe(s => currentState = s);
            unsubscribe();
            
            // 如果正在选择文件，暂时保持连接状态不变，避免误报
            if (this.isSelectingFiles) {
                console.log('📱 文件选择中，跳过状态检查');
                return;
            }
            
            // 如果数据通道被强制设置为已连接，则不要覆盖这个状态
            const effectivePeerConnected = this.dataChannelForceConnected || dataChannelOpen;
            
            // 只在状态真正变化时更新
            if (currentState.isConnected !== wsConnected || currentState.peerConnected !== effectivePeerConnected) {
                console.log('📱 Status update:', { 
                    wsConnected, 
                    dataChannelOpen, 
                    dataChannelForceConnected: this.dataChannelForceConnected,
                    effectivePeerConnected,
                    isSelectingFiles: this.isSelectingFiles
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
                    console.log(`🔌 WebSocket disconnected: code=${event.code}, reason=${event.reason}`);
                    
                    // 如果正在选择文件，不要更新连接状态，避免触发UI重置
                    if (!this.isSelectingFiles) {
                        clipboardState.update(state => ({ ...state, isConnected: false }));
                    } else {
                        console.log('📱 文件选择中，暂停连接状态更新');
                    }
                    
                    // 如果正在选择文件，完全禁用自动重连
                    if (this.isSelectingFiles) {
                        console.log('📱 文件选择中，禁用自动重连');
                        return;
                    }
                    
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
                
                // Clear error message on successful reconnection
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: '',
                    showError: false
                }));
                
                console.log('✅ Successfully reconnected and rejoined session');
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
        
        // Generate new key pair for security
        await this.generateKeyPair();
        const publicKeyArray = Array.from(new Uint8Array(await this.exportPublicKey()));
        
        if (state.isCreator) {
            // Reconnect as creator
            this.ws.send(JSON.stringify({
                type: 'create_session',
                publicKey: publicKeyArray,
                existingSessionId: state.sessionId
            }));
        } else {
            // Reconnect as joiner
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

    private async encryptData(data: string): Promise<ArrayBuffer> {
        if (!this.sharedKey) throw new Error('Shared key not available');
        
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            this.sharedKey,
            dataBuffer
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
            data
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
        this.connectionStateBeforeFileSelect = false; // 重置连接状态
        this.fileSelectStartTime = 0; // 重置选择时间
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
        this.isSelectingFiles = true;
        this.fileSelectStartTime = Date.now();
        this.connectionStateBeforeFileSelect = this.dataChannel?.readyState === 'open';
        
        console.log('📱 准备文件选择，启动全面保护模式:', {
            isSelectingFiles: this.isSelectingFiles,
            connectionState: this.connectionStateBeforeFileSelect,
            wsState: this.ws?.readyState,
            timestamp: this.fileSelectStartTime
        });
        
        // 暂停自动重连机制，避免在文件选择期间的无效重连
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // 强制保持连接状态显示，防止UI状态闪烁
        this.dataChannelForceConnected = this.dataChannel?.readyState === 'open';
        
        // 发送文件选择开始信号给对端，让对端也进入等待模式
        if (this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    type: 'file_selection_start',
                    message: 'Mobile device starting file selection',
                    timestamp: this.fileSelectStartTime
                }));
                console.log('📱 已通知对端开始文件选择');
            } catch (error) {
                console.warn('📱 发送文件选择开始信号失败:', error);
            }
        }
        
        // 设置保护超时机制，防止无限期等待
        setTimeout(() => {
            if (this.isSelectingFiles) {
                console.log('📱 文件选择超时（30秒），自动结束保护模式');
                this.completeFileSelection();
            }
        }, 30000);
        
        console.log('📱 文件选择保护模式已启动，禁用自动重连和状态更新');
    }

    // 文件选择完成后的连接恢复
    async completeFileSelection(): Promise<void> {
        const selectDuration = Date.now() - this.fileSelectStartTime;
        console.log('📱 文件选择完成，耗时:', selectDuration, 'ms');
        
        this.isSelectingFiles = false;
        
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
        
        // 检查连接状态是否发生变化
        const currentWsState = this.ws?.readyState === WebSocket.OPEN;
        const currentConnectionState = this.dataChannel?.readyState === 'open';
        const connectionLost = this.connectionStateBeforeFileSelect && !currentConnectionState;
        const wsLost = !currentWsState;
        
        console.log('📱 连接状态检查:', {
            selectDuration,
            beforeSelection: this.connectionStateBeforeFileSelect,
            afterSelection: currentConnectionState,
            wsState: currentWsState,
            connectionLost,
            wsLost
        });
        
        // 如果WebSocket断开或DataChannel断开，或文件选择时间过长，尝试恢复
        if (wsLost || connectionLost || selectDuration > 8000) { // 超过8秒视为需要恢复
            console.log('📱 检测到连接问题，尝试恢复连接...');
            
            clipboardState.update(state => ({
                ...state,
                errorMessage: '正在恢复连接，请稍候...',
                showError: true
            }));
            
            await this.recoverConnectionAfterFileSelect();
        } else {
            console.log('📱 连接状态正常，可以继续传输');
            // 确保UI状态正确
            clipboardState.update(state => ({
                ...state,
                isConnected: currentWsState,
                peerConnected: currentConnectionState,
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
                            errorMessage: '连接已恢复',
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
                    errorMessage: '文件选择期间连接中断，正在重新连接...',
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
                            errorMessage: '连接已恢复',
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
                // 不显示提示信息，静默处理
                break;
                
            case 'file_selection_complete':
                console.log('📱 对端文件选择完成，耗时:', message.duration, 'ms');
                // 清除等待提示
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: '',
                    showError: false
                }));
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
                            errorMessage = '会话已过期或不存在，请创建新会话';
                            this.clearStoredSession(); // 清理本地存储的过期会话
                            break;
                        case '会话已满':
                            errorMessage = '会话已满，无法加入';
                            break;
                        case '未知消息类型':
                            errorMessage = '通信协议错误';
                            break;
                        case '消息格式错误':
                            errorMessage = '数据格式错误';
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
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }  // 添加备用STUN服务器
                ],
                iceCandidatePoolSize: 10  // 增加ICE候选池大小
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
                
                // 检测移动设备
                const isMobile = typeof window !== 'undefined' && 
                    (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
                
                if (state === 'connected') {
                    console.log('🎉 Peer connected!');
                    clipboardState.update(state => ({ ...state, peerConnected: true }));
                    
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
                    maxRetransmits: 3  // 增加重传次数
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
        };

        this.dataChannel.onclose = () => {
            console.log('❌ Data channel closed');
            clipboardState.update(state => ({ ...state, peerConnected: false }));
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
                errorMessage: `文件过大！${data.name} (${fileSizeMB}MB) 超过 ${maxSizeMB}MB 限制`,
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
            
            // 检查缺失chunks并启动重传机制
            if (actualReceivedChunks > totalChunks * 0.8) {
                const missingChunks = [];
                for (let i = 0; i < totalChunks; i++) {
                    if (!receivingFile.chunks.has(i)) {
                        missingChunks.push(i);
                    }
                }
                
                if (missingChunks.length === 0) {
                    // 所有chunks已接收
                } else if (missingChunks.length <= 5) {
                    // 启动重传机制
                    this.scheduleRetryMissingChunks(receivingFile, missingChunks);
                }
            }
            
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
        // 这里需要发送方重新发送指定的chunks
        // 实际的重传逻辑需要在发送方实现
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
            // 如果缺失chunks不多，启动重传机制
            if (missingChunks.length <= 10 && receivingFile.retryCount < MAX_RETRY_COUNT) {
                console.log(`🔄 启动重传机制，缺失${missingChunks.length}个chunks: [${missingChunks.slice(0, 5).join(', ')}${missingChunks.length > 5 ? '...' : ''}]`);
                this.scheduleRetryMissingChunks(receivingFile, missingChunks);
            } else {
                console.log(`⚠️ 缺失chunks过多(${missingChunks.length})或重试次数超限，强制组装文件`);
                await this.assembleReceivedFileWithMissingChunks(missingChunks);
            }
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
            // 强制组装现有chunks
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
        
        try {
            // 计算当前接收的数据总大小
            let actualSize = 0;
            const sortedChunks: { index: number; data: Uint8Array }[] = [];
            
            // 收集所有已接收的chunks并排序
            for (let i = 0; i < receivingFile.totalChunks; i++) {
                const chunk = receivingFile.chunks.get(i);
                if (chunk) {
                    sortedChunks.push({ index: i, data: chunk });
                    actualSize += chunk.length;
                }
            }
            
            // 按索引排序
            sortedChunks.sort((a, b) => a.index - b.index);
            
            // 组装文件
            const combinedArray = new Uint8Array(actualSize);
            let offset = 0;
            
            for (const { data } of sortedChunks) {
                combinedArray.set(data, offset);
                offset += data.length;
            }
            
            const blob = new Blob([combinedArray], { type: receivingFile.type });
            const fileItem: FileItem = {
                name: `${receivingFile.name}`,
                size: actualSize,
                type: receivingFile.type,
                blob: blob
            };
            
            // Add to received files
            clipboardState.update(state => ({
                ...state,
                receivedFiles: [...state.receivedFiles, fileItem],
                receivingFiles: false,
                transferProgress: 100,
                isTransferring: false, // 清除传输状态
                errorMessage: `部分接收文件: ${receivingFile.name} (缺失${missingChunks.length}个片段)`,
                showError: true
            }));
            
            console.log(`⚠️ 部分文件组装完成: ${receivingFile.name} (缺失 ${missingChunks.length} 个片段)`);
            
            // 5秒后清除消息
            setTimeout(() => {
                clipboardState.update(state => ({
                    ...state,
                    errorMessage: '',
                    showError: false
                }));
            }, 5000);
            
            console.log(`🧹 清理接收文件状态: ${receivingFile.name} (ID: ${receivingFile.id})`);
            this.currentReceivingFile = null;
        } catch (error) {
            console.error('Error assembling received file with missing chunks:', error);
        }
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
            this.showError('连接未准备就绪，请等待连接建立');
            return;
        }
        
        // 检查是否已经在发送文件，防止并发发送
        if (this.isSendingFiles) {
            console.warn('⚠️ 文件发送正在进行中，请等待当前发送完成');
            this.showError('文件发送正在进行中，请等待当前发送完成');
            
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
            this.showError('正在接收文件，请等待接收完成后再发送');
            
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
            this.showError(`文件过大！以下文件超过${maxSizeMB}MB限制：${oversizedFiles.map(f => f.name).join(', ')}`);
            return;
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
                    errorMessage: `成功发送 ${currentFiles.length} 个文件`,
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
            const errorMessage = error instanceof Error ? error.message : '发送文件时发生未知错误';
            clipboardState.update(state => ({ 
                ...state, 
                sendingFiles: false, 
                transferProgress: 0,
                files: [], // 出错时也清空文件列表
                isTransferring: false, // 清除传输状态
                errorMessage: `发送失败: ${errorMessage}`,
                showError: true
            }));
            
            // 释放发送锁
            this.isSendingFiles = false;
            console.log('🔓 发送失败，释放文件发送锁');
        }
    }

    private async sendSingleFile(file: File): Promise<void> {
        // 生成唯一的文件ID
        const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`📤 开始发送文件: ${file.name} (ID: ${fileId}, 大小: ${file.size} bytes)`);
        
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
        await this.sendFileInBinaryChunks(file, fileId);
        
        // Send file end message
        const fileEndMessage = {
            type: 'file_end',
            fileId: fileId,
            name: file.name
        };
        
        this.dataChannel!.send(JSON.stringify(fileEndMessage));
        console.log(`📤 已发送 file_end: ${file.name} (ID: ${fileId})`);

    }

    private async sendFileInBinaryChunks(file: File, fileId: string): Promise<void> {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const fileSizeMB = Math.round(file.size / (1024 * 1024) * 100) / 100;
        console.log(`开始发送文件: ${file.name} (${fileSizeMB}MB, ${totalChunks} 个分块)`);
        
        let consecutiveSends = 0;
        const sentChunks = new Set<number>(); // 记录已发送的chunks
        
        for (let i = 0; i < totalChunks; i++) {
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
            const binaryMessage = this.createBinaryChunkMessage(fileId, i, totalChunks, encryptedChunk);
            
            // 发送二进制数据
            this.dataChannel!.send(binaryMessage);
            consecutiveSends++;
            sentChunks.add(i); // 记录已发送
            
            // 在最后几个chunks时添加额外日志
            if (i >= totalChunks - 5) {
                console.log(`📤 发送chunk ${i}/${totalChunks - 1}, 文件: ${file.name}`);
            }
            
            // 更新进度（减少频率以提高性能）
            if (i % 5 === 0 || i === totalChunks - 1) {
                const progress = Math.round(((i + 1) / totalChunks) * 100);
                console.log(`${file.name} 发送进度: ${progress}%`);
                
                // 更新UI状态
                clipboardState.update(state => ({
                    ...state,
                    transferProgress: progress
                }));
            }
        }
        
        // 验证所有chunks都已发送
        console.log(`📤 文件发送完成验证: ${file.name}, 发送了 ${sentChunks.size}/${totalChunks} 个chunks`);
        if (sentChunks.size !== totalChunks) {
            const missingChunks = [];
            for (let i = 0; i < totalChunks; i++) {
                if (!sentChunks.has(i)) {
                    missingChunks.push(i);
                }
            }
            console.error(`❌ 发送端缺失chunks: [${missingChunks.join(', ')}]`);
        }
    }

    private async smartFlowControl(consecutiveSends: number): Promise<void> {
        const bufferAmount = this.dataChannel!.bufferedAmount;
        const maxBuffer = MAX_BUFFER_SIZE; // 1MB
        const targetBuffer = MAX_BUFFER_SIZE / 2; // 512KB
        
        // 如果缓冲区过满，等待
        if (bufferAmount > maxBuffer) {
            
            
            while (this.dataChannel!.bufferedAmount > targetBuffer) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }
        
        // 每发送20个chunk给浏览器喘息机会
        if (consecutiveSends % 20 === 0 && consecutiveSends > 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
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
