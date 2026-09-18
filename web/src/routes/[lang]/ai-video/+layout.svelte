<script lang="ts">
    import { page } from "$app/stores";
    import { t } from "$lib/i18n/translations";
    import env from "$lib/env";
    import PageNavSection from "$components/subnav/PageNavSection.svelte";
    import PageNavTab from "$components/subnav/PageNavTab.svelte";
    import IconScissors from "@tabler/icons-svelte/IconScissors.svelte";
    import IconSparkles from "@tabler/icons-svelte/IconSparkles.svelte";

    $: lang = $page.params.lang;
</script>

<div class="video-shell">
    <aside class="video-sidebar">
        <div class="video-sidebar-header">
            <div class="subtext video-subtitle">ai-video</div>
            <h2>{$t("tabs.ai_video")}</h2>
        </div>
        <nav aria-label={$t("tabs.ai_video")}>
            <PageNavSection>
                <PageNavTab tabPath={`/${lang}/ai-video`} tabTitle={$t("tabs.highlight_studio")} iconColor="green">
                    <IconScissors />
                </PageNavTab>
                {#if env.VIDEO_AGENT_ENABLED}
                    <PageNavTab tabPath={`/${lang}/ai-video/video-agent`} tabTitle={$t("tabs.video_agent")} iconColor="blue">
                        <IconSparkles />
                    </PageNavTab>
                {/if}
            </PageNavSection>
        </nav>
    </aside>
    <div class="video-content"><slot /></div>
</div>

<style>
    .video-shell {
        --video-nav-width: 190px;
        --video-padding: 30px;
        display: grid;
        grid-template-columns: var(--video-nav-width) minmax(0, 1fr);
        gap: calc(var(--padding) * 1.5);
        width: 100%;
        box-sizing: border-box;
        padding-left: var(--video-padding);
    }
    .video-sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        box-sizing: border-box;
        overflow-y: auto;
        padding: var(--video-padding) 0;
        display: flex;
        flex-direction: column;
        gap: var(--padding);
    }
    .video-sidebar-header { display: flex; flex-direction: column; gap: 6px; }
    .video-subtitle { padding: 0; letter-spacing: .2px; opacity: .85; }
    h2 { margin: 0; font-size: 1.35rem; font-weight: 800; color: var(--secondary); letter-spacing: -.3px; }
    .video-content { min-width: 0; }
    @media screen and (max-width: 750px) {
        .video-shell { grid-template-columns: minmax(0, 1fr); padding: 0; gap: 0; }
        .video-sidebar { position: static; height: auto; padding: var(--padding); }
    }
</style>
