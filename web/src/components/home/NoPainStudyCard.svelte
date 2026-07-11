<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import IconLanguage from "@tabler/icons-svelte/IconLanguage.svelte";
    import IconExternalLink from "@tabler/icons-svelte/IconExternalLink.svelte";
</script>

<aside class="ecosystem-card" aria-labelledby="nopainstudy-title">
    <div class="ecosystem-icon" aria-hidden="true">
        <IconLanguage />
    </div>
    <div class="ecosystem-copy">
        <span class="ecosystem-badge">{$t("home.ecosystem.badge")}</span>
        <h2 id="nopainstudy-title">{$t("home.ecosystem.title")}</h2>
        <p>{$t("home.ecosystem.description")}</p>
    </div>
    <a
        class="ecosystem-link"
        href="https://nopainstudy.top/"
        target="_blank"
        rel="noopener noreferrer"
    >
        <span>{$t("home.ecosystem.action")}</span>
        <IconExternalLink aria-hidden="true" />
    </a>
</aside>

<style>
    .ecosystem-card {
        width: 100%;
        max-width: 1096px;
        min-height: 74px;
        margin: 2px auto 12px;
        padding: 12px 14px;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        border: 1px solid rgba(var(--accent-rgb), 0.2);
        border-radius: 12px;
        background: color-mix(in srgb, var(--surface-1) 94%, var(--accent) 6%);
    }

    .ecosystem-icon {
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        border-radius: 10px;
        background: rgba(var(--accent-rgb), 0.11);
        color: var(--accent-strong);
    }

    .ecosystem-icon :global(svg) {
        width: 22px;
        height: 22px;
        stroke-width: 1.7;
    }

    .ecosystem-copy {
        min-width: 0;
    }

    .ecosystem-badge {
        display: block;
        margin-bottom: 2px;
        color: var(--accent-strong);
        font-size: 0.7rem;
        font-weight: 700;
        line-height: 1.2;
    }

    .ecosystem-copy h2 {
        margin: 0;
        color: var(--text);
        font-size: 0.96rem;
        line-height: 1.3;
    }

    .ecosystem-copy p {
        margin: 3px 0 0;
        color: var(--secondary-600);
        font-size: 0.78rem;
        line-height: 1.4;
    }

    .ecosystem-link {
        min-height: 36px;
        padding: 0 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid rgba(var(--accent-rgb), 0.35);
        border-radius: 9px;
        color: var(--accent-strong);
        font-size: 0.78rem;
        font-weight: 700;
        line-height: 1.2;
        text-decoration: none;
        white-space: nowrap;
        transition:
            background-color 0.2s,
            border-color 0.2s;
    }

    .ecosystem-link:hover {
        border-color: var(--accent);
        background: rgba(var(--accent-rgb), 0.08);
    }

    .ecosystem-link :global(svg) {
        width: 15px;
        height: 15px;
        stroke-width: 1.8;
    }

    @media (max-width: 600px) {
        .ecosystem-card {
            width: calc(100% - 28px);
            margin: 0 auto 8px;
            grid-template-columns: auto minmax(0, 1fr);
            gap: 10px;
        }

        .ecosystem-link {
            grid-column: 1 / -1;
            width: 100%;
            box-sizing: border-box;
        }
    }
</style>
