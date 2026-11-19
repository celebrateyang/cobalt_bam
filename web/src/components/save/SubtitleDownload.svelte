<script lang="ts">
    import { onDestroy } from "svelte";
    import IconChevronDown from "@tabler/icons-svelte/IconChevronDown.svelte";
    import API, { type SubtitleTrack } from "$lib/api/api";
    import { device } from "$lib/device";
    import { saveWithFeedback } from "$lib/download";
    import { INTERNAL_locale, t } from "$lib/i18n/translations";

    export let url: string;
    export let filename: string;
    export let inActionBar = false;

    let expanded = false;
    let status: "idle" | "loading" | "unsupported" | "error" | "ready" = "idle";
    let tracks: SubtitleTrack[] = [];
    let busyTrack = "";
    let failedTrack = "";
    let preparedFile: File | undefined;
    let preparedTrack = "";
    let destroyed = false;
    onDestroy(() => { destroyed = true; });

    async function loadTracks() {
        status = "loading";
        try {
            const result = await API.subtitles({ url });
            if (result.status === "unsupported") {
                status = "unsupported";
            } else if (result.status === "ok" && "tracks" in result) {
                tracks = result.tracks;
                status = "ready";
            } else {
                status = "error";
            }
        } catch {
            status = "error";
        }
    }

    function toggle() {
        expanded = !expanded;
        if (expanded && status === "idle") void loadTracks();
    }

    function languageName(track: SubtitleTrack, locale: string | undefined) {
        try {
            return new Intl.DisplayNames([locale || "en"], { type: "language", fallback: "none" })
                .of(track.language) || track.name || track.language;
        } catch {
            return track.name || track.language;
        }
    }

    async function download(track: SubtitleTrack) {
        busyTrack = track.id;
        failedTrack = "";
        try {
            if (preparedTrack !== track.id || !preparedFile) {
                const result = await API.subtitles({ url, trackId: track.id });
                if (result.status !== "ok" || !("text" in result) || !result.text) throw new Error("Subtitle unavailable");
                if (destroyed) return;
                const base = filename.replace(/\.[^.]+$/, "") || "subtitles";
                preparedFile = new File([result.text], `${base}.${track.language}${track.automatic ? ".auto" : ""}.${track.format}`, {
                    type: track.format === "vtt" ? "text/vtt" : "application/x-subrip",
                });
                preparedTrack = track.id;
                if (device.is.iOS) return;
            }
            const method = device.is.iOS && !device.supports.directDownload && device.supports.share ? "share" : "download";
            const outcome = await saveWithFeedback(method, { file: preparedFile });
            if (outcome === "failed") failedTrack = track.id;
        } catch {
            failedTrack = track.id;
        } finally {
            busyTrack = "";
        }
    }
</script>

<div class="subtitle-download" class:in-action-bar={inActionBar}>
    <button type="button" class="button elevated subtitle-toggle" aria-expanded={expanded} on:click={toggle}>
        {$t("subtitles.open")}
        <span class="chevron" class:expanded aria-hidden="true"><IconChevronDown /></span>
    </button>
    {#if expanded}
        <div class="subtitle-options">
            {#if status === "loading"}
                <p role="status">{$t("subtitles.loading")}</p>
            {:else if status === "unsupported"}
                <p role="status">{$t("subtitles.unsupported")}</p>
            {:else if status === "error"}
                <p role="status">{$t("subtitles.error")}</p>
                <button type="button" class="button elevated" on:click={loadTracks}>{$t("subtitles.retry")}</button>
            {:else if status === "ready" && !tracks.length}
                <p role="status">{$t("subtitles.empty")}</p>
            {:else if status === "ready"}
                <ul>
                    {#each tracks as track (track.id)}
                        <li>
                            <span>{languageName(track, $INTERNAL_locale)}{track.automatic ? ` (${$t("subtitles.automatic")})` : ""}</span>
                            <button type="button" class="button elevated" disabled={!!busyTrack} on:click={() => download(track)}>
                                {busyTrack === track.id ? $t("subtitles.preparing") : failedTrack === track.id ? $t("subtitles.retry") : preparedTrack === track.id && device.is.iOS ? $t("subtitles.save") : track.format.toUpperCase()}
                            </button>
                            {#if failedTrack === track.id}<p role="status">{$t("subtitles.file_error")}</p>{/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}
</div>

<style>
    .subtitle-download { max-width: 100%; }
    .subtitle-options { margin-top: 8px; }
    .in-action-bar { display: contents; }
    .subtitle-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .chevron { display: inline-flex; }
    .chevron.expanded { transform: rotate(180deg); }
    .chevron :global(svg) { width: 14px; height: 14px; }
    .in-action-bar .subtitle-toggle {
        min-height: var(--subtitle-action-height, 32px);
        padding: var(--subtitle-action-padding, 6px 10px);
        font-size: 12px;
        box-shadow: none;
    }
    .in-action-bar .subtitle-toggle[aria-expanded="true"] {
        background: var(--button-hover);
        color: var(--text);
    }
    .in-action-bar .subtitle-options {
        order: 1;
        flex: 0 0 100%;
        min-width: 0;
        box-sizing: border-box;
        margin-top: 2px;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid var(--button-stroke);
        background: var(--button);
        font-size: 12px;
        line-height: 1.45;
        color: var(--gray);
        overflow-wrap: anywhere;
    }
    ul { list-style: none; padding: 0; margin: 0; max-height: min(28vh, 220px); overflow: auto; }
    li { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding-block: 4px; }
    p { margin: 4px 0; }
</style>
