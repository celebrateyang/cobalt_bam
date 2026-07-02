<script lang="ts">
    import { t } from "$lib/i18n/translations";

    export let titleKey: string;
    export let bodyKey: string;
    export let onInstall: () => void;
    export let onDismiss: () => void;
</script>

<div class="extension-prompt">
    <div class="extension-prompt-copy">
        <strong>{$t(titleKey)}</strong>
        <p>{$t(bodyKey)}</p>
        <div class="extension-trust">
            <span>{$t("dialog.tiktok_download.extension.trust.easy")}</span>
            <span>{$t("dialog.tiktok_download.extension.trust.safe")}</span>
            <span>{$t("dialog.tiktok_download.extension.trust.free")}</span>
        </div>
    </div>
    <div class="extension-prompt-actions">
        <button type="button" class="install-button chrome" on:click={onInstall}>
            <span class="browser-icon chrome-icon"></span>
            {$t("dialog.tiktok_download.extension.chrome")}
        </button>
        <button type="button" class="install-button edge" on:click={onInstall}>
            <span class="browser-icon edge-icon"></span>
            {$t("dialog.tiktok_download.extension.edge")}
        </button>
        <button type="button" class="later-button" on:click={onDismiss}>
            {$t("dialog.tiktok_download.extension.later")}
        </button>
    </div>
</div>

<style>
    .extension-prompt {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 14px;
        padding: 18px;
        border-radius: 22px;
        border: 1px solid color-mix(in srgb, var(--secondary) 26%, var(--button-stroke));
        background:
            radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--secondary) 22%, transparent), transparent 36%),
            linear-gradient(135deg, color-mix(in srgb, var(--secondary) 13%, var(--background)), color-mix(in srgb, var(--popup-bg) 94%, var(--secondary)));
        box-shadow: 0 12px 34px color-mix(in srgb, var(--secondary) 14%, transparent);
        color: var(--text);
    }

    .extension-prompt-copy {
        min-width: 0;
    }

    .extension-prompt strong {
        display: block;
        margin-bottom: 6px;
        font-size: 1.05rem;
        line-height: 1.25;
    }

    .extension-prompt p {
        margin: 0;
        color: var(--subtext);
        font-size: 0.9rem;
        line-height: 1.45;
        max-width: 58ch;
    }

    .extension-trust {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        margin-top: 12px;
    }

    .extension-trust span {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--text);
        font-size: 0.78rem;
        opacity: 0.86;
    }

    .extension-trust span::before {
        content: "\2713";
        display: inline-grid;
        place-items: center;
        width: 15px;
        height: 15px;
        border-radius: 999px;
        color: white;
        font-size: 0.68rem;
        background: var(--secondary);
    }

    .extension-prompt-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-start;
        width: 100%;
    }

    .install-button,
    .later-button {
        border: 0;
        border-radius: 14px;
        font: inherit;
        cursor: pointer;
        transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
    }

    .install-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        min-width: 168px;
        padding: 11px 18px;
        color: var(--text);
        background: color-mix(in srgb, var(--popup-bg) 84%, white);
        box-shadow: 0 8px 18px color-mix(in srgb, black 9%, transparent);
    }

    .install-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 22px color-mix(in srgb, black 12%, transparent);
    }

    .later-button {
        padding: 11px 16px;
        color: var(--subtext);
        background: color-mix(in srgb, var(--button-hover) 58%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--button-stroke) 68%, transparent);
    }

    .later-button:hover {
        color: var(--text);
        background: color-mix(in srgb, var(--button-hover) 72%, transparent);
    }

    .browser-icon {
        position: relative;
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        border-radius: 50%;
    }

    .chrome-icon {
        background: conic-gradient(#ea4335 0 33%, #fbbc05 0 66%, #34a853 0 83%, #ea4335 0);
    }

    .chrome-icon::before,
    .edge-icon::before {
        content: "";
        position: absolute;
        inset: 6px;
        border-radius: inherit;
        background: #4285f4;
        box-shadow: 0 0 0 2px white;
    }

    .edge-icon {
        background: conic-gradient(#0aa5ff, #00c2a8, #2cc36b, #0a5fdc, #0aa5ff);
    }

    .edge-icon::before {
        background: #fff;
        opacity: 0.92;
    }

    @media (max-width: 640px) {
        .install-button,
        .later-button {
            flex: 1 1 100%;
        }
    }
</style>
