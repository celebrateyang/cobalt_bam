<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { t } from '$lib/i18n/translations';
    import SettingsCategory from '$components/settings/SettingsCategory.svelte';
    import ActionButton from '$components/buttons/ActionButton.svelte';
    
    const dispatch = createEventDispatcher();
    
    export let isConnected: boolean;
    export let isCreating: boolean;
    export let isJoining: boolean;
    export let joinCode: string;
    export let sessionId: string;
    export let isCreator: boolean;
    export let peerConnected: boolean;
    export let qrCodeUrl: string;
    
    // Copy states
    let showSessionIdCopied = false;
    let showLinkCopied = false;
    
    function handleCreateSession() {
        dispatch('createSession');
    }
    
    function handleJoinSession() {
        dispatch('joinSession');
    }
    
    function handleCleanup() {
        dispatch('cleanup');
    }
    
    // Copy session ID
    function handleCopySessionId() {
        if (sessionId) {
            navigator.clipboard.writeText(sessionId).then(() => {
                showSessionIdCopied = true;
                setTimeout(() => {
                    showSessionIdCopied = false;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy session ID:', err);
            });
        }
    }
    
    // Copy session link
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
</script>

{#if !isConnected}
    <SettingsCategory title="" sectionId="connection-setup">
        <div class="connection-setup">
            <div class="setup-option">
                <h3>{$t("clipboard.create_session")}</h3>
                <p>{$t("clipboard.create_description")}</p>                <ActionButton
                    id="create-session"
                    disabled={isCreating}
                    click={handleCreateSession}
                >
                    {isCreating ? $t("clipboard.creating") : $t("clipboard.create")}
                </ActionButton>
            </div>
            
            <div class="divider">
                <span>{$t("general.or")}</span>
            </div>
              <div class="setup-option">
                <h3>{$t("clipboard.join_session")}</h3>
                <p>{$t("clipboard.join_description")}</p>
                <div class="join-form">
                    <input
                        type="text"
                        bind:value={joinCode}
                        placeholder={$t("clipboard.enter_code")}
                        disabled={isJoining}
                    />                    <ActionButton
                        id="join-session"
                        disabled={isJoining || !joinCode.trim()}
                        click={handleJoinSession}
                    >
                        {isJoining ? $t("clipboard.joining") : $t("clipboard.join")}
                    </ActionButton>
                </div>
            </div>
        </div>
    </SettingsCategory>
{:else}
    <!-- Session Info -->
    <SettingsCategory title={$t("clipboard.session_active")} sectionId="session-info">
        <div class="session-info">
            <div class="session-details">                
                {#if isCreator && sessionId}
                    <!-- Session ID Display -->
                    <div class="session-copy-section">
                        <h4>会话信息</h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">会话ID</span>
                                <div class="info-content">
                                    <code class="session-code">{sessionId}</code>
                                    <button 
                                        class="copy-button" 
                                        class:copied={showSessionIdCopied}
                                        on:click={handleCopySessionId}
                                        title="复制会话ID"
                                        aria-label="复制会话ID"
                                    >
                                        {#if showSessionIdCopied}
                                            <span class="copy-icon">✓</span>
                                            <span class="copy-text">已复制</span>
                                        {:else}
                                            <span class="copy-icon">📋</span>
                                            <span class="copy-text">复制</span>
                                        {/if}
                                    </button>
                                </div>
                            </div>
                            <div class="info-item">
                                <span class="info-label">分享链接</span>
                                <div class="info-content">
                                    <div class="link-display">
                                        <span class="link-text">{window?.location?.origin}{window?.location?.pathname}?session={sessionId}</span>
                                    </div>
                                    <button 
                                        class="copy-button" 
                                        class:copied={showLinkCopied}
                                        on:click={handleCopySessionLink}
                                        title="复制分享链接"
                                        aria-label="复制分享链接"
                                    >
                                        {#if showLinkCopied}
                                            <span class="copy-icon">✓</span>
                                            <span class="copy-text">已复制</span>
                                        {:else}
                                            <span class="copy-icon">🔗</span>
                                            <span class="copy-text">复制</span>
                                        {/if}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}
                
                {#if isCreator && sessionId && qrCodeUrl && !peerConnected}
                    <div class="qr-code">
                        <h4>{$t("clipboard.scan_qr")}</h4>
                        <img src={qrCodeUrl} alt="QR Code" />
                    </div>
                {/if}
                
                <div class="connection-status">
                    <div class="status-indicator" class:connected={peerConnected}></div>
                    <span>{peerConnected ? $t("clipboard.peer_connected") : $t("clipboard.waiting_peer")}</span>
                </div>
                
            </div>
        </div>
    </SettingsCategory>
    
    <!-- Disconnect Section -->
    <div class="disconnect-section">
        <ActionButton id="cleanup" click={handleCleanup}>
            {$t("clipboard.disconnect")}
        </ActionButton>
    </div>
{/if}

<style>    .connection-setup {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        max-width: 800px;
        margin: 0 auto;
        width: 100%;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
    }.setup-option {
        text-align: center;
        padding: 1rem;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.05) 100%);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 160px;
    }

    .setup-option::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
        transition: left 0.5s;
    }

    .setup-option:hover {
        transform: translateY(-4px);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        border-color: rgba(102, 126, 234, 0.3);
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
    }

    .setup-option:hover::before {
        left: 100%;
    }    .setup-option h3 {
        margin-bottom: 0.6rem;
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--text);
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .setup-option p {
        margin-bottom: 1rem;
        color: var(--secondary);
        line-height: 1.4;
        font-size: 0.85rem;
    }    .divider {
        text-align: center;
        position: relative;
        margin: 0.5rem 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .divider::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.3), transparent);
        border-radius: 1px;
    }    .divider span {
        background: linear-gradient(135deg, var(--background), rgba(255, 255, 255, 0.02));
        padding: 0.5rem 1.2rem;
        color: var(--secondary);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        font-weight: 500;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        z-index: 1;
        position: relative;
    }.join-form {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        max-width: 380px;
        margin: 0 auto;
        align-items: center;
        width: 100%;
    }    .join-form input {
        padding: 0.8rem 1rem;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.05) 100%);
        color: var(--text);
        font-size: 1rem;
        transition: all 0.3s ease;
        backdrop-filter: blur(8px);
        width: 100%;
        min-height: 48px;
        box-sizing: border-box;
    }

    .join-form input:focus {
        outline: none;
        border-color: rgba(102, 126, 234, 0.5);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
    }

    .join-form input::placeholder {
        color: var(--secondary);
        opacity: 0.7;
    }    /* Ensure ActionButton is properly sized on mobile */
    .join-form :global(.action-button) {
        width: 100%;
        min-height: 48px;
        font-size: 1rem;
        font-weight: 600;
    }

    /* ActionButton optimization for desktop */
    @media (min-width: 768px) {
        :global(.action-button) {
            min-height: 44px;
            font-size: 0.9rem;
            padding: 0.7rem 1.5rem;
        }
        
        .join-form :global(.action-button) {
            min-height: 42px;
        }
    }.session-info {
        text-align: center;
        padding: 0.75rem 1.25rem;
        max-width: 900px;
        margin: 0 auto;
        box-sizing: border-box;
    }    .session-details {
        display: grid;
        gap: 0.75rem;
        align-items: center;
        justify-items: center;
        grid-template-columns: 1fr;
        max-width: 800px;
        margin: 0 auto;
    }
    
    .qr-code {
        text-align: center;
        padding: 1rem;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.05) 100%);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
        max-width: 280px;
        width: 100%;
        margin: 0 auto;
        justify-self: center;
        align-self: center;
    }.qr-code:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
        border-color: rgba(102, 126, 234, 0.3);
    }    .qr-code h4 {
        margin: 0 0 0.5rem 0;
        font-weight: 600;
        color: var(--text);
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .qr-code img {
        max-width: 180px;
        width: 100%;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
    }

    .qr-code img:hover {
        transform: scale(1.05);
        box-shadow: 0 12px 35px rgba(0, 0, 0, 0.2);
    }    .connection-status {
        display: flex;
        align-items: center;        gap: 1rem;
        padding: 1rem 1.5rem;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.05) 100%);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
        max-width: 300px;
        width: 100%;
        justify-content: center;
    }

    .connection-status:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
    }

    .status-indicator {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background-color: #f44336;
        position: relative;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(244, 67, 54, 0.3);
    }

    .status-indicator::before {
        content: '';
        position: absolute;
        top: -6px;
        left: -6px;
        right: -6px;
        bottom: -6px;
        border-radius: 50%;
        background-color: inherit;
        opacity: 0.2;
        animation: pulse 2s infinite;
    }

    .status-indicator.connected {
        background-color: #4caf50;
        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
    }

    @keyframes pulse {
        0% {
            transform: scale(1);
            opacity: 0.2;
        }
        50% {
            transform: scale(1.3);
            opacity: 0.05;
        }
        100% {
            transform: scale(1);
            opacity: 0.2;
        }
    }

    .connection-status span {
        font-weight: 600;
        color: var(--text);
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }    .disconnect-section {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 2px solid rgba(255, 255, 255, 0.05);
        position: relative;
        width: 100%;
    }

    .disconnect-section::before {
        content: '';
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 60px;
        height: 2px;
        background: linear-gradient(90deg, transparent, rgba(244, 67, 54, 0.5), transparent);
        border-radius: 1px;
    }    @media (min-width: 768px) {
        .connection-setup {
            flex-direction: row;
            align-items: stretch;
            gap: 1.5rem;
            max-width: 700px;
            padding: 1.2rem;
            max-height: 280px;
            justify-content: center;
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;
        }        .setup-option {
            max-width: 300px;
            min-height: 120px;
            max-height: 200px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 1rem;
            flex-shrink: 0;
            text-align: center;
        }.divider {
            flex-shrink: 0;
            margin: 0;
            width: auto;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            writing-mode: vertical-lr;
            text-orientation: mixed;
            min-width: 60px;
            max-width: 80px;
            position: relative;
        }

        .divider::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 2px;
            height: 60%;
            background: linear-gradient(180deg, transparent, rgba(102, 126, 234, 0.3), transparent);
            border-radius: 1px;
            transform: translate(-50%, -50%);
        }

        .divider span {
            transform: rotate(0deg);
            white-space: nowrap;
            writing-mode: horizontal-tb;
            text-orientation: mixed;
            position: relative;
            z-index: 2;
        }.session-details {
            grid-template-columns: 1fr;
            gap: 1.5rem;
            align-items: center;
            justify-items: center;
        }

        .qr-code {
            justify-self: center;
        }

        .connection-status {
            justify-self: center;
        }
    }    @media (min-width: 1024px) {
        .connection-setup {
            gap: 2rem;
            padding: 1.5rem;
            max-width: 750px;
            max-height: 300px;
            justify-content: center;
            margin: 0 auto;
            width: 100%;
        }        .setup-option {
            padding: 1.2rem;
            min-height: 140px;
            max-height: 220px;
            max-width: 280px;
            flex-shrink: 0;
            align-items: center;
            text-align: center;
        }

        .setup-option h3 {
            font-size: 1.3rem;
            margin-bottom: 0.5rem;
        }

        .setup-option p {
            font-size: 0.85rem;
            margin-bottom: 0.8rem;
        }        .join-form {
            max-width: 320px;
        }

        .join-form input {
            padding: 0.8rem 1rem;
            font-size: 0.9rem;
        }.session-details {
            gap: 2.5rem;
        }
    }    /* Extra large desktop screens */
    @media (min-width: 1440px) {
        .connection-setup {
            max-width: 850px;
            padding: 1.8rem;
            max-height: 320px;
            justify-content: center;
            margin: 0 auto;
            width: 100%;
        }          .setup-option {
            max-width: 320px;
            min-height: 160px;
            max-height: 240px;
            flex-shrink: 0;
            align-items: center;
            text-align: center;
        }.divider {
            min-width: 70px;
            max-width: 90px;
        }
    }/* Tablet and small desktop adjustment */
    @media (min-width: 768px) and (max-width: 1023px) {
        .connection-setup {
            flex-direction: column;
            align-items: center;
            max-width: 650px;
            max-height: 400px;
        }
          .setup-option {
            width: 100%;
            max-width: 550px;
            min-height: 130px;
            max-height: 180px;
            align-items: center;
            text-align: center;
        }
        
        .divider {
            writing-mode: horizontal-tb;
            height: auto;
            width: 100%;
            min-width: auto;
            margin: 1rem 0;
        }
        
        .divider::before {
            top: 50%;
            left: 0;
            right: 0;
            bottom: auto;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.3), transparent);
            transform: translateY(-50%);
        }
    }/* Enhanced mobile styles */
    @media (max-width: 639px) {
        .connection-setup {
            padding: 0.5rem;
            gap: 0.75rem;
        }

        .setup-option {
            padding: 0.75rem;
        }

        .setup-option h3 {
            font-size: 1.15rem;
            margin-bottom: 0.25rem;
        }

        .setup-option p {
            margin-bottom: 0.75rem;
            font-size: 0.85rem;
        }

        .divider {
            margin: 0.5rem 0;
        }

        .session-info {
            padding: 0.75rem 1rem;
        }        .session-details {
            gap: 0.75rem;
        }

        .qr-code {
            max-width: 220px;
            padding: 0.75rem;
        }

        .qr-code img {
            max-width: 160px;
        }

        .connection-status {            max-width: 260px;
            padding: 0.75rem;
        }

        .disconnect-section {
            margin-top: 0.4rem;
            padding-top: 0.4rem;
        }
    }

    /* Session Copy Section Styles */
    .session-copy-section {
        width: calc(100% - 2rem);
        max-width: 580px;
        margin: 0 auto 1rem auto;
        padding: 1.25rem;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.06) 100%);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(12px);
        transition: all 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        box-sizing: border-box;
    }

    .session-copy-section:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
        border-color: rgba(102, 126, 234, 0.25);
    }

    .session-copy-section h4 {
        margin: 0 0 1.25rem 0;
        font-weight: 700;
        color: var(--text);
        font-size: 1.1rem;
        text-align: center;
        letter-spacing: 0.3px;
    }

    .info-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .info-item {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%);
        border-radius: 12px;
        padding: 1rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
        transition: all 0.3s ease;
        backdrop-filter: blur(8px);
    }

    .info-item:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.04) 100%);
        border-color: rgba(102, 126, 234, 0.2);
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    }

    .info-label {
        display: block;
        font-size: 0.85rem;
        color: var(--accent);
        font-weight: 600;
        margin-bottom: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .info-content {
        display: flex;
        gap: 0.75rem;
        align-items: center;
    }

    .session-code {
        flex: 1;
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Courier New', monospace;
        font-size: 0.9rem;
        color: var(--text);
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(22, 163, 74, 0.08) 100%);
        padding: 0.6rem 0.8rem;
        border-radius: 8px;
        border: 1px solid rgba(34, 197, 94, 0.15);
        letter-spacing: 1px;
        font-weight: 500;
        word-break: break-all;
    }

    .link-display {
        flex: 1;
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(22, 163, 74, 0.08) 100%);
        padding: 0.6rem 0.8rem;
        border-radius: 8px;
        border: 1px solid rgba(34, 197, 94, 0.15);
    }

    .link-text {
        font-size: 0.75rem;
        color: var(--text);
        word-break: break-all;
        opacity: 0.9;
        line-height: 1.3;
        display: block;
    }

    .copy-button {
        background: linear-gradient(135deg, var(--accent), var(--accent-hover));
        border: none;
        border-radius: 10px;
        padding: 0.6rem 1rem;
        color: white;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        box-shadow: 0 3px 12px rgba(var(--accent-rgb), 0.3);
        min-width: 80px;
        justify-content: center;
    }

    .copy-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 5px 20px rgba(var(--accent-rgb), 0.4);
    }

    .copy-button:active {
        transform: translateY(0);
    }

    .copy-button.copied {
        background: linear-gradient(135deg, #22c55e, #16a34a);
        box-shadow: 0 3px 12px rgba(34, 197, 94, 0.3);
    }

    .copy-button.copied:hover {
        box-shadow: 0 5px 20px rgba(34, 197, 94, 0.4);
    }

    .copy-icon {
        font-size: 0.9rem;
        line-height: 1;
    }

    .copy-text {
        font-size: 0.75rem;
        font-weight: 600;
    }

    /* Mobile responsive styles for copy sections */
    @media (max-width: 768px) {
        .session-copy-section {
            width: calc(100% - 1rem);
            padding: 1rem;
            max-width: 100%;
            margin: 0 auto 1rem auto;
        }

        .info-grid {
            gap: 0.75rem;
        }

        .info-item {
            padding: 0.8rem;
        }

        .info-content {
            flex-direction: column;
            gap: 0.5rem;
            align-items: stretch;
        }

        .session-code, .link-display {
            padding: 0.7rem;
        }

        .session-code {
            font-size: 0.8rem;
        }

        .link-text {
            font-size: 0.7rem;
        }

        .copy-button {
            width: 100%;
            padding: 0.8rem;
            font-size: 0.85rem;
        }

        .copy-text {
            font-size: 0.8rem;
        }
    }

    /* Tablet styles */
    @media (min-width: 768px) and (max-width: 1023px) {
        .session-copy-section {
            max-width: 550px;
        }

        .copy-button {
            min-width: 90px;
        }
    }
</style>
