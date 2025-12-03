<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';

    const supportedLanguages = ['en', 'zh', 'th', 'ru'];
    const defaultLanguage = 'en';

    function getCookie(name: string): string | null {
        if (typeof document === 'undefined') return null;
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
        return null;
    }

    function detectLanguage(): string {
        // 1. Check cookie preference
        const cookieLang = getCookie('preferred-language');
        if (cookieLang && supportedLanguages.includes(cookieLang)) {
            return cookieLang;
        }

        // 2. Check browser languages
        if (typeof navigator !== 'undefined') {
            const browserLangs = navigator.languages || [navigator.language];
            for (const lang of browserLangs) {
                const langCode = lang.split('-')[0].toLowerCase();
                if (supportedLanguages.includes(langCode)) {
                    return langCode;
                }
            }
        }

        // 3. Default language
        return defaultLanguage;
    }

    onMount(() => {
        const targetLang = detectLanguage();
        goto(`/${targetLang}`, { replaceState: true });
    });
</script>

<svelte:head>
    <title>Redirecting...</title>
</svelte:head>

<div class="loading">
    <div class="spinner"></div>
    <p>Loading...</p>
</div>

<style>
    .loading {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-family: system-ui, -apple-system, sans-serif;
    }

    .spinner {
        width: 50px;
        height: 50px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 20px;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    p {
        font-size: 18px;
        margin: 0;
    }
</style>
