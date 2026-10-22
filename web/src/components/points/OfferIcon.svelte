<script lang="ts">
    export let name: "arrow" | "gift" | "share" | "copy" | "check";
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    {#if name === "arrow"}
        <path d="M5 12h14m-6-6 6 6-6 6" />
    {:else if name === "gift"}
        <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" />
        <path d="M12 7H8.5A2.5 2.5 0 1 1 11 4.5L12 7Zm0 0h3.5A2.5 2.5 0 1 0 13 4.5L12 7Z" />
    {:else if name === "share"}
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" />
    {:else if name === "copy"}
        <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" />
    {:else}
        <path d="m5 12 4 4L19 6" />
    {/if}
</svg>
