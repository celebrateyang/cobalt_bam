<script lang="ts">
    import VideoAgentWorkspace from "$components/video-agent/VideoAgentWorkspace.svelte";
    import { t } from "$lib/i18n/translations";
</script>

<svelte:head>
    <title>Video Agent</title>
    <meta name="description" content={$t("video-agent.description")} />
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<VideoAgentWorkspace />
