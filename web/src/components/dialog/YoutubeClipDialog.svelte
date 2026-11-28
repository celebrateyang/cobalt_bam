<script lang="ts">
    import { onDestroy } from 'svelte';
    import { t } from '$lib/i18n/translations';
    import api from '$lib/api/api';
    import { buildSaveRequest } from '$lib/api/saving-handler';
    import { finalizePointsHold, releasePointsHold, settleClipMembership } from '$lib/api/points';
    import type { CobaltPointsInfo } from '$lib/types/api';
    import ClipWorker from '$lib/youtube-clip/worker?worker';
    import DialogContainer from './DialogContainer.svelte';

    export let id: string;
    export let sourceUrl: string;
    export let sourceDuration: number;
    export let limit: number;
    export let notice: string;
    let close: () => void;
    let startText = '00:00:00';
    let endText = formatTime(Math.min(Math.floor(sourceDuration), Math.floor(limit * 60)));
    let state: 'editing' | 'processing' | 'settling' | 'ready' | 'failed' | 'settlement' = 'editing';
    let errorKey = '';
    let worker: Worker | undefined;
    let points: CobaltPointsInfo | undefined;
    let fileUrl = '';
    let filename = 'youtube-clip.webm';
    let closed = false;
    let settlementAction: boolean | undefined;

    function formatTime(value: number) {
        const s = Math.max(0, Math.floor(value));
        return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
    }
    function parseTime(value: string): number | null {
        const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
        if (!m) return null;
        const parts = m.slice(1).filter(v => v !== undefined).map(Number);
        if (parts.slice(1).some(v => v >= 60)) return null;
        const result = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
        return Number.isSafeInteger(result) ? result : null;
    }
    $: start = parseTime(startText);
    $: end = parseTime(endText);
    $: length = start !== null && end !== null && end > start ? end - start : 0;
    $: validation = start === null || end === null ? 'invalid'
        : end <= start ? 'order' : end > sourceDuration ? 'beyond'
        : end - start > limit * 60 ? 'too_long' : '';

    async function settle(ok: boolean): Promise<boolean> {
        if (points?.outcome === 'held') {
            if (!points.holdId) return false;
            const result = ok ? await finalizePointsHold(points.holdId, 'youtube_clip_done')
                : await releasePointsHold(points.holdId, 'youtube_clip_failed');
            return result.ok && result.status === (ok ? 'finalized' : 'released');
        }
        if (points?.outcome === 'member') {
            if (!Number.isSafeInteger(points.memberUsageId)) return false;
            return (await settleClipMembership(points.memberUsageId!, ok)).ok;
        }
        // Anonymous/API-key downloads do not have points metadata. Never
        // interpret an unrecognized authenticated settlement as success.
        return !points;
    }
    async function finish(ok: boolean) {
        state = 'settling'; settlementAction = ok;
        if (!await settle(ok).catch(() => false)) { state = 'settlement'; return; }
        settlementAction = undefined;
        state = ok ? 'ready' : 'failed';
        if (!ok) errorKey = 'failure';
    }
    async function run() {
        if (validation || start === null || end === null) return;
        state = 'processing'; errorKey = '';
        const request = { ...buildSaveRequest(sourceUrl), downloadMode: 'auto' as const,
            videoQuality: '360' as const, localProcessing: 'forced' as const, subtitleLang: undefined, youtubeHLS: false,
            batch: false, queueId: crypto.randomUUID(), youtubeClip: { start, end } };
        const response = await api.request(request).catch(() => undefined);
        if (!response || response.status === 'error') {
            state = 'failed';
            errorKey = response?.status === 'error' && response.error.code === 'error.api.youtube.clip.unsupported' ? 'unsupported' : 'failure';
            return;
        }
        points = response.points;
        if (closed) { await settle(false).catch(() => false); return; }
        if (response.status !== 'local-processing' || response.youtubeClip?.version !== 1
            || response.youtubeClip.start !== start || response.youtubeClip.end !== end
            || !Array.isArray(response.tunnel) || response.tunnel.length !== 2 || !response.output?.filename) {
            await finish(false); return;
        }
        filename = response.output.filename;
        try {
            worker = new ClipWorker();
            worker.onmessage = async ({ data }) => {
                if (closed || state !== 'processing') return;
                if (data.stage === 'error') { console.warn('[youtube-clip] worker failed:', data.error); worker?.terminate(); await finish(false); }
                if (data.stage === 'done' && data.file instanceof File) {
                    worker?.terminate(); fileUrl = URL.createObjectURL(data.file); await finish(true);
                }
            };
            worker.onerror = async () => { if (!closed && state === 'processing') { worker?.terminate(); await finish(false); } };
            worker.onmessageerror = async () => { if (!closed && state === 'processing') { worker?.terminate(); await finish(false); } };
            worker.postMessage({ urls: response.tunnel, start, end, filename });
        } catch {
            worker?.terminate();
            await finish(false);
        }
    }
    function cancel() {
        closed = true;
        worker?.terminate();
        if (state === 'processing' && points) void settle(false).catch(() => false);
        close();
    }
    onDestroy(() => {
        if (!closed && state === 'processing' && points) void settle(false).catch(() => false);
        closed = true; worker?.terminate(); if (fileUrl) URL.revokeObjectURL(fileUrl);
    });
</script>

<DialogContainer {id} managedCancel={true} dismissable={false} bind:close ariaLabel={$t('dialog.youtube_clip.title')}>
    <div class="dialog-body youtube-clip">
        <h2>{$t('dialog.youtube_clip.title')}</h2>
        <p>{notice}</p>
        <p>{$t('dialog.youtube_clip.quality_notice')}</p>
        <p>{$t('dialog.youtube_clip.limit')}: {formatTime(limit * 60)}</p>
        {#if state === 'editing'}
            <label>{$t('dialog.youtube_clip.start')} <input bind:value={startText} placeholder="00:00:00" /></label>
            <label>{$t('dialog.youtube_clip.end')} <input bind:value={endText} placeholder="00:00:00" /></label>
            <p>{$t('dialog.youtube_clip.length')}: {formatTime(length)}</p>
            {#if validation}<p role="alert">{$t(`dialog.youtube_clip.${validation}`)}</p>{/if}
            <button type="button" disabled={!!validation} on:click={run}>{$t('dialog.youtube_clip.download')}</button>
        {:else if state === 'processing' || state === 'settling'}
            <p role="status">{$t('dialog.youtube_clip.processing')}</p>
        {:else if state === 'ready'}
            <p role="status">{$t('dialog.youtube_clip.ready')}</p>
            <a href={fileUrl} download={filename}>{$t('dialog.youtube_clip.save')}</a>
        {:else if state === 'settlement'}
            <p role="alert">{$t('dialog.youtube_clip.settlement')}</p>
            <button type="button" on:click={() => finish(settlementAction === true)}>{$t('dialog.youtube_clip.download')}</button>
        {:else}
            <p role="alert">{$t(`dialog.youtube_clip.${errorKey || 'failure'}`)}</p>
        {/if}
        {#if state !== 'settling' && state !== 'settlement'}
            <button type="button" on:click={cancel}>{$t('dialog.youtube_clip.cancel')}</button>
        {/if}
    </div>
</DialogContainer>

<style>
    .youtube-clip { width: min(440px, calc(100vw - 64px)); max-height: 80vh; overflow-y: auto; gap: 12px; align-items: stretch; }
    h2, p { margin: 0; }
    label { display: grid; gap: 6px; }
    input, button, a { font: inherit; padding: 10px; border: 1px solid var(--gray); border-radius: 8px; color: inherit; background: transparent; }
    button, a { cursor: pointer; text-align: center; }
    button:disabled { opacity: .5; cursor: default; }
</style>
