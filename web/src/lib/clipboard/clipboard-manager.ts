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
    name: string;
    size: number;
    type: string;
    chunks: Uint8Array[];
    receivedSize: number;
}

// Constants
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for file transfer

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

    constructor() {
        this.loadStoredSession();
        this.startStatusCheck();
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
        const checkInterval = isMobile ? 300 : 1000; // 移动端300ms，桌面端1秒
        
        this.statusInterval = setInterval(() => {
            const wsConnected = this.ws?.readyState === WebSocket.OPEN;
            const peerConnected = this.dataChannel?.readyState === 'open';
            
            // 获取当前状态避免不必要的更新
            let currentState: any = {};
            const unsubscribe = clipboardState.subscribe(s => currentState = s);
            unsubscribe();
            
            // 只在状态真正变化时更新
            if (currentState.isConnected !== wsConnected || currentState.peerConnected !== peerConnected) {
                console.log('📱 Status update:', { wsConnected, peerConnected, isMobile });
                clipboardState.update(state => ({
                    ...state,
                    isConnected: wsConnected,
                    peerConnected: peerConnected
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
        
        clipboardState.update(state => ({
            ...state,
            sessionId: '',
            isConnected: false,
            peerConnected: false,
            qrCodeUrl: '',
            errorMessage: '',
            showError: false,
            waitingForCreator: false
        }));
        
        this.sharedKey = null;
        this.remotePublicKey = null;
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
                
            case 'error':
                console.error('Server error:', message);
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
                    console.warn('❌ Peer connection failed, retrying...');
                    clipboardState.update(state => ({ ...state, peerConnected: false }));
                    
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
            // 立即更新状态，不等待状态检查间隔
            clipboardState.update(state => ({ ...state, peerConnected: true }));
            
            // 移动端额外的状态确认延迟，确保UI有足够时间响应
            const isMobile = typeof window !== 'undefined' && 
                (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
            if (isMobile) {
                setTimeout(() => {
                    console.log('📱 Mobile connection confirmation');
                    clipboardState.update(state => ({ ...state, peerConnected: true }));
                }, 200);
            }
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
            console.log('📨 Data channel message received:', event.data);
            try {
                const data = JSON.parse(event.data);
                console.log('📦 Parsed data:', data.type, data);
                await this.handleDataChannelMessage(data);
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
        console.log('🔍 Handling data channel message type:', data.type);
        // Handle different types of data channel messages
        switch (data.type) {            case 'text':
                // Convert array back to ArrayBuffer for decryption
                const encryptedBuffer = new Uint8Array(data.content).buffer;
                const decryptedText = await this.decryptData(encryptedBuffer);
                clipboardState.update(state => ({
                    ...state,
                    receivedText: decryptedText,
                    activeTab: 'text' // 自动切换到文本分享标签
                }));
                console.log('Text received successfully, switched to text tab');
                break;
                  case 'file_start':
                // Start receiving a new file
                this.currentReceivingFile = {
                    name: data.name,
                    size: data.size,
                    type: data.mimeType || data.type,
                    chunks: [],
                    receivedSize: 0
                };
                clipboardState.update(state => ({ 
                    ...state, 
                    receivingFiles: true, 
                    transferProgress: 0,
                    activeTab: 'files' // 自动切换到文件传输标签
                }));
                console.log('Started receiving file:', data.name, ', switched to files tab');
                break;
                
            case 'file_chunk':
                if (this.currentReceivingFile) {
                    // Decrypt and store chunk
                    const encryptedData = new Uint8Array(data.data).buffer;
                    const decryptedChunk = await this.decryptBinaryData(encryptedData);
                    
                    this.currentReceivingFile.chunks.push(decryptedChunk);
                    this.currentReceivingFile.receivedSize += decryptedChunk.length;
                    
                    // Update progress
                    const progress = (this.currentReceivingFile.receivedSize / this.currentReceivingFile.size) * 100;
                    clipboardState.update(state => ({ 
                        ...state, 
                        transferProgress: Math.min(progress, 100) 
                    }));
                }
                break;
                
            case 'file_end':
                if (this.currentReceivingFile && this.currentReceivingFile.name === data.name) {
                    // Combine all chunks into a single file
                    const totalSize = this.currentReceivingFile.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
                    const combinedArray = new Uint8Array(totalSize);
                    let offset = 0;
                    
                    for (const chunk of this.currentReceivingFile.chunks) {
                        combinedArray.set(chunk, offset);
                        offset += chunk.length;
                    }
                    
                    const blob = new Blob([combinedArray], { type: this.currentReceivingFile.type });
                    const fileItem: FileItem = {
                        name: this.currentReceivingFile.name,
                        size: this.currentReceivingFile.size,
                        type: this.currentReceivingFile.type,
                        blob: blob
                    };
                    
                    // Add to received files
                    clipboardState.update(state => ({
                        ...state,
                        receivedFiles: [...state.receivedFiles, fileItem],
                        receivingFiles: false,
                        transferProgress: 0
                    }));
                    
                    console.log('File received successfully:', data.name);
                    this.currentReceivingFile = null;
                }
                break;
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
            console.log('Switched to text tab for sending');
            
            console.log('🔐 Encrypting text:', text.substring(0, 20) + '...');
            const encryptedText = await this.encryptData(text);
            // Convert ArrayBuffer to Array for JSON serialization
            const encryptedArray = Array.from(new Uint8Array(encryptedText));
            const message = {
                type: 'text',
                content: encryptedArray
            };
            
            console.log('📤 Sending message:', message.type, 'with content length:', message.content.length);
            this.dataChannel.send(JSON.stringify(message));
            console.log('Text sent successfully');
        } catch (error) {
            console.error('Error sending text:', error);
        }
    }
    
    async sendFiles(): Promise<void> {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.error('Data channel not ready');
            return;
        }
        
        let currentFiles: File[] = [];
        const unsubscribe = clipboardState.subscribe(state => {
            currentFiles = state.files;
        });
        unsubscribe();
        
        if (currentFiles.length === 0) {
            console.log('No files to send');
            return;
        }
          try {
            // 自动切换到文件传输标签
            clipboardState.update(state => ({ 
                ...state, 
                sendingFiles: true, 
                transferProgress: 0,
                activeTab: 'files'
            }));
            console.log('Switched to files tab for sending');
            
            for (let i = 0; i < currentFiles.length; i++) {
                const file = currentFiles[i];
                await this.sendSingleFile(file);
                
                // Update progress
                const progress = ((i + 1) / currentFiles.length) * 100;
                clipboardState.update(state => ({ ...state, transferProgress: progress }));
            }
            
            clipboardState.update(state => ({ ...state, sendingFiles: false, transferProgress: 0 }));
            console.log('All files sent successfully');
        } catch (error) {
            console.error('Error sending files:', error);
            clipboardState.update(state => ({ ...state, sendingFiles: false, transferProgress: 0 }));
        }
    }

    private async sendSingleFile(file: File): Promise<void> {
        // Send file start message
        const fileStartMessage = {
            type: 'file_start',
            name: file.name,
            size: file.size,
            mimeType: file.type
        };
        
        this.dataChannel!.send(JSON.stringify(fileStartMessage));
        
        // Send file in chunks
        const arrayBuffer = await file.arrayBuffer();
        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
        
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
            const chunk = arrayBuffer.slice(start, end);
            const encryptedChunk = await this.encryptBinaryData(new Uint8Array(chunk));
            
            const chunkMessage = {
                type: 'file_chunk',
                index: i,
                data: Array.from(new Uint8Array(encryptedChunk))
            };
            
            this.dataChannel!.send(JSON.stringify(chunkMessage));
        }
        
        // Send file end message
        const fileEndMessage = {
            type: 'file_end',
            name: file.name
        };
        
        this.dataChannel!.send(JSON.stringify(fileEndMessage));
    }

    // Expose peer connection and data channel for debug panel
    get debugInfo() {
        return {
            peerConnection: this.peerConnection,
            dataChannel: this.dataChannel,
            sharedKey: this.sharedKey ? 'Present' : 'Not available'
        };
    }
}
