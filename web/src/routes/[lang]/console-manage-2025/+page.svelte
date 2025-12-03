<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { auth } from "$lib/api/social";

    let username = "";
    let password = "";
    let error = "";
    let loading = false;

    onMount(() => {
        // 如果已登录，跳转到管理页面
        if (auth.isLoggedIn()) {
            goto("/console-manage-2025/accounts");
        }
    });

    async function handleLogin() {
        if (!username || !password) {
            error = "请输入用户名和密码";
            return;
        }

        loading = true;
        error = "";

        const response = await auth.login(username, password);

        loading = false;

        if (response.status === "success") {
            goto("/console-manage-2025/accounts");
        } else {
            error = response.error?.message || "登录失败";
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Enter") {
            handleLogin();
        }
    }
</script>

<svelte:head>
    <title>管理员登录 - 竹子下载</title>
</svelte:head>

<div class="admin-container">
    <div class="login-box">
        <div class="logo-section">
            <div class="logo-icon">🎬</div>
            <h1 class="title">管理后台</h1>
            <p class="subtitle">竹子下载 管理后台</p>
        </div>

        <form on:submit|preventDefault={handleLogin}>
            <div class="form-group">
                <label for="username">用户名</label>
                <input
                    id="username"
                    type="text"
                    bind:value={username}
                    on:keydown={handleKeydown}
                    placeholder="请输入用户名"
                    disabled={loading}
                    autocomplete="username"
                />
            </div>

            <div class="form-group">
                <label for="password">密码</label>
                <input
                    id="password"
                    type="password"
                    bind:value={password}
                    on:keydown={handleKeydown}
                    placeholder="请输入密码"
                    disabled={loading}
                    autocomplete="current-password"
                />
            </div>

            {#if error}
                <div class="error-message">
                    ⚠️ {error}
                </div>
            {/if}

            <button type="submit" class="login-button" disabled={loading}>
                {loading ? "登录中..." : "登录"}
            </button>
        </form>
    </div>
</div>

<style>
    :global(#cobalt) {
        display: contents;
    }

    :global(#content) {
        width: 100vw;
        max-width: 100vw;
    }

    .admin-container {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--background);
        padding: calc(var(--padding) * 2);
        z-index: 1000;
    }

    .login-box {
        background: var(--popup-bg);
        border-radius: calc(var(--border-radius) * 1.5);
        padding: calc(var(--padding) * 4);
        width: 100%;
        max-width: 440px;
        box-shadow:
            0 0 0 1.5px var(--popup-stroke) inset,
            0 8px 24px rgba(0, 0, 0, 0.12);
    }

    .logo-section {
        text-align: center;
        margin-bottom: calc(var(--padding) * 3);
    }

    .logo-icon {
        font-size: 3.5rem;
        margin-bottom: calc(var(--padding) * 1.5);
        line-height: 1;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    }

    .title {
        font-size: 2rem;
        font-weight: 700;
        margin: 0 0 calc(var(--padding) / 2) 0;
        color: var(--secondary);
        letter-spacing: -0.5px;
    }

    .subtitle {
        color: var(--gray);
        margin: 0;
        font-size: 0.95rem;
        font-weight: 500;
    }

    .form-group {
        margin-bottom: calc(var(--padding) * 1.5);
    }

    label {
        display: block;
        margin-bottom: 8px;
        color: var(--secondary);
        font-weight: 600;
        font-size: 0.9rem;
    }

    input {
        width: 100%;
        padding: 13px 16px;
        border: none;
        border-radius: var(--border-radius);
        font-size: 0.95rem;
        background: var(--button);
        color: var(--button-text);
        box-sizing: border-box;
        box-shadow: var(--button-box-shadow);
        transition: all 0.2s;
        font-family: "IBM Plex Mono", monospace;
    }

    input:focus {
        outline: none;
        background: var(--button-hover);
        box-shadow: 0 0 0 2px var(--blue) inset;
    }

    input::placeholder {
        color: var(--gray);
        opacity: 0.6;
    }

    input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .error-message {
        background: var(--red);
        color: var(--white);
        padding: calc(var(--padding) - 2px);
        border-radius: var(--border-radius);
        margin-bottom: calc(var(--padding) * 1.5);
        font-size: 0.85rem;
        text-align: center;
        font-weight: 500;
        animation: shake 0.4s ease-in-out;
    }

    @keyframes shake {
        0%,
        100% {
            transform: translateX(0);
        }
        25% {
            transform: translateX(-8px);
        }
        75% {
            transform: translateX(8px);
        }
    }

    .login-button {
        width: 100%;
        padding: 15px;
        background: var(--secondary);
        color: var(--primary);
        border: none;
        border-radius: var(--border-radius);
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: none;
        margin-top: calc(var(--padding) / 2);
    }

    .login-button:hover:not(:disabled) {
        background: var(--button-active-hover);
        color: var(--secondary);
        transform: translateY(-1px);
    }

    .login-button:active:not(:disabled) {
        transform: translateY(0);
    }

    .login-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .hint {
        margin-top: calc(var(--padding) * 2.5);
        padding-top: calc(var(--padding) * 2);
        border-top: 1px solid var(--popup-stroke);
        text-align: center;
        color: var(--gray);
        font-size: 0.85rem;
        line-height: 1.8;
    }

    .hint p {
        margin: 0 0 6px 0;
    }

    .hint code {
        background: var(--button);
        padding: 3px 8px;
        border-radius: 4px;
        font-family: "IBM Plex Mono", monospace;
        font-size: 0.85rem;
        color: var(--secondary);
        font-weight: 600;
    }

    .hint small {
        font-size: 0.75rem;
        color: var(--gray);
        opacity: 0.8;
        display: block;
        margin-top: 4px;
    }

    @media screen and (max-width: 768px) {
        .admin-container {
            padding: var(--padding);
        }

        .login-box {
            padding: calc(var(--padding) * 2.5);
            max-width: 100%;
        }

        .logo-icon {
            font-size: 3rem;
        }

        .title {
            font-size: 1.6rem;
        }

        .subtitle {
            font-size: 0.85rem;
        }

        .logo-section {
            margin-bottom: calc(var(--padding) * 2);
        }
    }

    @media screen and (max-width: 535px) {
        .admin-container {
            padding: calc(var(--padding) / 2);
        }

        .login-box {
            padding: calc(var(--padding) * 2);
        }

        .logo-icon {
            font-size: 2.5rem;
            margin-bottom: calc(var(--padding) / 2);
        }

        .title {
            font-size: 1.4rem;
        }

        .subtitle {
            font-size: 0.8rem;
        }

        .logo-section {
            margin-bottom: calc(var(--padding) * 1.5);
        }

        input {
            padding: 11px 12px;
            font-size: 0.9rem;
        }

        .login-button {
            padding: 12px;
            font-size: 0.9rem;
        }

        .hint {
            margin-top: calc(var(--padding) * 1.5);
            padding-top: var(--padding);
            font-size: 0.8rem;
        }

        .hint code {
            font-size: 0.8rem;
            padding: 2px 6px;
        }
    }
</style>
