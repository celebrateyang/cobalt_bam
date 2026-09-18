<script lang="ts">
    import { page } from "$app/stores";
    import VideoAgentWorkspace from "$components/video-agent/VideoAgentWorkspace.svelte";
</script>
<svelte:head>
    <title>Video Agent</title>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>
<VideoAgentWorkspace projectId={$page.params.projectId} />
