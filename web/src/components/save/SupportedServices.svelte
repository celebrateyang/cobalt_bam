<script lang="ts">
    import { t } from "$lib/i18n/translations";
    import { getServerInfo } from "$lib/api/server-info";
    import cachedInfo from "$lib/state/server-info";

    import Skeleton from "$components/misc/Skeleton.svelte";
    import IconPlus from "@tabler/icons-svelte/IconPlus.svelte";

    let services: string[] = [];

    let expanded = false;
    let loaded = false;

    const loadInfo = async () => {
        await getServerInfo();

        if ($cachedInfo) {
            loaded = true;
            services = $cachedInfo.info.cobalt.services;
        }
    };
</script>

<div id="supported-services">
    <button
        id="services-button"
        class:expanded
        on:click={async () => {
            expanded = !expanded;
            if (expanded && services.length === 0) {
                await loadInfo();
            }
        }}
        aria-label={$t("save.services.title")}
        aria-expanded={expanded}
        aria-controls="services-popover"
    >
        <div class="expand-icon">
            <IconPlus />
        </div>
        <span class="title">{$t("save.services.title")}</span>
    </button>

    <div id="services-popover" class:expanded>
        <div id="services-container">
            {#if loaded}
                {#each services as service}
                     {#if !service.includes("youtube")} 
                        <div class="service-item">{service}</div>
                    {/if}
                {/each}
            {:else}
                {#each { length: 17 } as _}
                    <Skeleton
                        class="elevated"
                        width={Math.random() * 44 + 50 + "px"}
                        height="24.5px"
                    />
                {/each}
            {/if}
        </div>
        <div id="services-disclaimer" class="subtext">
            {$t("save.services.disclaimer")}
        </div>
    </div>
</div>

<style>
    #supported-services {
        display: flex;
        position: relative;
        max-width: 400px;
        flex-direction: column;
        align-items: center;
        width: 100%;
        margin: 0 auto;
    }

    #services-popover {
        display: flex;
        flex-direction: column;
        transition:
            max-height 0.25s ease,
            opacity 0.2s ease,
            transform 0.2s cubic-bezier(0.53, 0.05, 0.23, 0.99);
        border-radius: 18px;
        background: var(--button);
        box-shadow:
            var(--button-box-shadow),
            0 0 10px 10px var(--button-stroke);

        transform: translateY(-6px) scale(0.98);
        transform-origin: top center;
        position: relative;
        max-height: 0;
        opacity: 0;
        overflow: hidden;
        pointer-events: none;

        padding: 12px;
        gap: 6px;
        margin-top: 6px;
    }

    #services-popover.expanded {
        transform: translateY(0) scale(1);
        max-height: min(70vh, 520px);
        opacity: 1;
        overflow: auto;
        pointer-events: auto;
    }

    #services-button {
        gap: 9px;
        padding: 7px 13px 7px 10px;
        justify-content: flex-start;
        border-radius: 18px;
        display: flex;
        flex-direction: row;
        font-size: 13px;
        font-weight: 500;
        background: none;
    }

    #services-button:not(:focus-visible) {
        box-shadow: none;
    }

    .expand-icon {
        height: 22px;
        width: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 18px;
        background: var(--button-elevated);
        padding: 0;
        box-shadow: none;
        transition: transform 0.2s;
    }

    #services-button:active .expand-icon {
        background: var(--button-elevated-hover);
    }

    @media (hover: hover) {
        #services-button:hover .expand-icon {
            background: var(--button-elevated-hover);
        }
    }

    .expand-icon :global(svg) {
        height: 18px;
        width: 18px;
        stroke-width: 2px;
        color: var(--secondary);
        will-change: transform;
    }

    .expanded .expand-icon {
        transform: rotate(45deg);
    }

    #services-container {
        display: flex;
        flex-wrap: wrap;
        flex-direction: row;
        gap: 3px;
    }

    .service-item {
        display: flex;
        padding: 4px 8px;
        border-radius: calc(var(--border-radius) / 2);
        background: var(--button-elevated);
        font-size: 12.5px;
        font-weight: 500;
    }

    #services-disclaimer {
        padding: 0;
        user-select: none;
        -webkit-user-select: none;
    }

    .expanded #services-disclaimer {
        padding: 0;
        user-select: text;
        -webkit-user-select: text;
    }

    @media screen and (max-width: 535px) {
        .expand-icon {
            height: 21px;
            width: 21px;
        }

        .expand-icon :global(svg) {
            height: 16px;
            width: 16px;
        }
    }
</style>
