<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from "$lib/i18n/translations";
    import IconX from "@tabler/icons-svelte/IconX.svelte";
    import IconDeviceDesktop from "@tabler/icons-svelte/IconDeviceDesktop.svelte";

    const INSTALLED_KEY = "pwa-installed";

    let deferredPrompt: any;
    let showBanner = false;

    const isInstalled = () =>
        window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari uses a different flag
        (navigator as any).standalone === true ||
        localStorage.getItem(INSTALLED_KEY) === "true";

    const markInstalled = () => {
        localStorage.setItem(INSTALLED_KEY, "true");
        deferredPrompt = null;
        (window as any).deferredPrompt = null;
        showBanner = false;
    };

    onMount(() => {
        // Hide the banner outright for users who already installed
        if (isInstalled()) {
            markInstalled();
            return;
        }

        // Check if the event was already fired and captured in app.html
        if ((window as any).deferredPrompt && !isInstalled()) {
            deferredPrompt = (window as any).deferredPrompt;
            showBanner = true;
        }

        const handleBeforeInstallPrompt = (e: any) => {
            if (isInstalled()) return;

            e.preventDefault();
            deferredPrompt = e;
            showBanner = true;
            (window as any).deferredPrompt = e;
        };

        const handleAppInstalled = () => markInstalled();

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    });

    async function installPwa() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') markInstalled();
        }
    }

    function closeBanner() {
        showBanner = false;
    }
</script>

{#if showBanner}
    <div class="pwa-banner">
        <div class="content">
            <div class="icon-wrapper">
                <IconDeviceDesktop size={20} />
            </div>
            <span>{$t("general.pwa.install_prompt")}</span>
        </div>
        <div class="actions">
            <button class="install-btn" on:click={installPwa}>
                {$t("general.pwa.install")}
            </button>
            <button class="close-btn" on:click={closeBanner} aria-label={$t("general.pwa.close")}>
                <IconX size={18} />
            </button>
        </div>
    </div>
{/if}

<style>
    .pwa-banner {
        background-color: var(--popup-bg);
        color: var(--text);
        padding: 8px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--popup-stroke);
        position: sticky;
        top: 0;
        z-index: 100;
        width: 100%;
        box-sizing: border-box;
    }

    .content {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 500;
        font-size: 14px;
    }

    .icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--accent);
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .install-btn {
        background-color: var(--accent);
        color: #ffffff;
        border: none;
        padding: 6px 14px;
        border-radius: 20px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        transition: opacity 0.2s;
        white-space: nowrap;
    }

    .install-btn:hover {
        opacity: 0.9;
    }

    .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--subtext);
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s, color 0.2s;
    }

    .close-btn:hover {
        background-color: var(--button-hover);
        color: var(--text);
    }
    
    @media (max-width: 600px) {
        .pwa-banner {
            flex-direction: column;
            gap: 12px;
            padding: 12px 16px;
            text-align: center;
        }
        
        .content {
            flex-direction: column;
            gap: 8px;
        }

        .actions {
            width: 100%;
            justify-content: center;
        }
    }
</style>
