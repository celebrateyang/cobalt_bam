<script lang="ts">
    import { onMount } from "svelte";
    import { page } from "$app/stores";
    import { t } from "$lib/i18n/translations";
    import { getOrderAttribution } from "$lib/analytics/attribution";
    import {
        getAcceptLanguage,
        isSupportedLanguage,
    } from "$lib/seo/language-routing";

    export let currentLang: string;

    let suggestedLang: string | null = null;
    let visible = false;

    const isChatGptSource = (value: string | undefined) =>
        /(^|\.)chatgpt\.com$|chat\.openai\.com|^chatgpt$/i.test(value || "");

    const dismissKey = (language: string) =>
        `fsv-language-suggestion:${currentLang}:${language}`;

    onMount(() => {
        if (document.cookie.match(/(?:^|;)\s*preferred-language=/i)) return;

        const params = new URLSearchParams(window.location.search);
        const attribution = getOrderAttribution();
        const source = params.get("utm_source") || attribution?.firstTouch?.source;
        if (!isChatGptSource(source || undefined)) return;

        const browserLanguages = navigator.languages?.length
            ? navigator.languages.join(",")
            : navigator.language;
        const browserLanguage = getAcceptLanguage(browserLanguages);
        if (!browserLanguage || browserLanguage === currentLang) return;
        if (sessionStorage.getItem(dismissKey(browserLanguage))) return;

        suggestedLang = browserLanguage;
        visible = true;
    });

    function switchLanguage() {
        if (!suggestedLang || !isSupportedLanguage(suggestedLang)) return;
        document.cookie = `preferred-language=${suggestedLang}; path=/; max-age=31536000; SameSite=Lax`;
        const targetPath = $page.url.pathname.replace(/^\/[a-z]{2}(?=\/|$)/, `/${suggestedLang}`);
        window.location.assign(`${targetPath}${$page.url.search}${$page.url.hash}`);
    }

    function dismiss() {
        if (suggestedLang) sessionStorage.setItem(dismissKey(suggestedLang), "1");
        visible = false;
    }
</script>

{#if visible && suggestedLang}
    <aside class="language-suggestion" aria-live="polite">
        <span>
            {$t("general.language_suggestion.prompt")}
            <strong>{$t(`languages.${suggestedLang}`)}</strong>?
        </span>
        <button type="button" class="switch" on:click={switchLanguage}>
            {$t("general.language_suggestion.switch")}
        </button>
        <button
            type="button"
            class="dismiss"
            aria-label={$t("general.language_suggestion.dismiss")}
            on:click={dismiss}
        >×</button>
    </aside>
{/if}

<style>
    .language-suggestion {
        width: min(100%, 720px);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.7rem;
        padding: 0.65rem 0.8rem;
        border: 1px solid var(--accent);
        border-radius: 0.8rem;
        background: var(--background);
        color: var(--text);
        box-shadow: 0 0.3rem 1rem rgba(0, 0, 0, 0.12);
        font-size: 0.9rem;
    }

    button {
        cursor: pointer;
    }

    .switch {
        border: 0;
        border-radius: 0.55rem;
        padding: 0.45rem 0.7rem;
        background: var(--accent);
        color: var(--background);
        font: inherit;
        font-weight: 600;
        white-space: nowrap;
    }

    .dismiss {
        border: 0;
        background: transparent;
        color: var(--secondary);
        font-size: 1.3rem;
        line-height: 1;
        padding: 0.2rem;
    }

    @media screen and (max-width: 535px) {
        .language-suggestion {
            flex-wrap: wrap;
        }
    }
</style>
