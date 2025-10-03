<script lang="ts">
    import { createEventDispatcher, onDestroy, onMount } from 'svelte';
    import { t } from '$lib/i18n/translations';
    import {
        BrowserQRCodeReader,
        type IScannerControls,
        type Result
    } from '@zxing/browser';

    const dispatch = createEventDispatcher<{
        result: { text: string };
        error: { message: string };
    }>();

    let videoElement: HTMLVideoElement;
    let reader: BrowserQRCodeReader | null = null;
    let controls: IScannerControls | null = null;
    let isScanning = false;
    let errorMessage = '';

    async function startScanning() {
        if (isScanning) return;

        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            errorMessage = t.get('clipboard.scan_camera_unsupported');
            dispatch('error', { message: errorMessage });
            return;
        }

        try {
            reader ??= new BrowserQRCodeReader();
            errorMessage = '';
            dispatch('error', { message: '' });
            isScanning = true;

            controls = await reader.decodeFromVideoDevice(
                undefined,
                videoElement,
                (result: Result | undefined, error: unknown) => {
                    if (result) {
                        stopScanning();
                        dispatch('result', { text: result.getText() });
                        return;
                    }

                    if (error && (error as Error).name !== 'NotFoundException') {
                        console.error('QR decode error:', error);
                        errorMessage = (error as Error)?.message ?? t.get('clipboard.scan_decode_error');
                        dispatch('error', { message: errorMessage });
                    }
                }
            );
        } catch (error) {
            console.error('Unable to start camera', error);
            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                errorMessage = t.get('clipboard.scan_camera_error');
            } else {
                errorMessage = t.get('clipboard.scan_camera_unsupported');
            }
            dispatch('error', { message: errorMessage });
        }
    }

    function stopScanning() {
        controls?.stop();
        controls = null;
        isScanning = false;
    }

    onMount(() => {
        startScanning();
        return () => {
            stopScanning();
        };
    });

    onDestroy(() => {
        stopScanning();
    });
</script>

<div class="scanner-wrapper">
    <div class="video-frame">
        <video bind:this={videoElement} autoplay playsinline muted></video>
        <div class="viewfinder"></div>
    </div>
    <p class="hint">{$t('clipboard.scan_instruction')}</p>
    {#if errorMessage}
        <p class="error">{errorMessage}</p>
    {/if}
</div>

<style>
    .scanner-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
    }

    .video-frame {
        position: relative;
        width: min(320px, 100%);
        aspect-ratio: 3 / 4;
        border-radius: 16px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
    }

    video {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .viewfinder {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border: 2px solid rgba(102, 126, 234, 0.6);
        border-radius: 16px;
        box-shadow: inset 0 0 0 200px rgba(0, 0, 0, 0.25);
        pointer-events: none;
    }

    .hint {
        font-size: 0.9rem;
        color: var(--secondary);
        text-align: center;
        margin: 0;
    }

    .error {
        font-size: 0.85rem;
        color: #f87171;
        text-align: center;
        margin: 0;
    }

    @media (min-width: 768px) {
        .video-frame {
            width: min(360px, 100%);
        }
    }
</style>
