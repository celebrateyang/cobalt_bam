/// <reference path="./mux.d.ts" />
import muxjs from 'mux.js';
import { fetchAmazonReplay } from './hls';
import { normalizeMp4Durations } from './mp4';

const scope = globalThis as unknown as {
    onmessage: (event: MessageEvent) => void;
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = async (event) => {
    const { url } = event.data;
    const post = (data: unknown) => scope.postMessage({ amazonDirect: data });
    try {
        const blob = await fetchAmazonReplay(url, new AbortController().signal, (bytes, percent) => {
            post({ bytes, percent, stage: 'downloading' });
        });
        post({ bytes: blob.size, percent: 85, stage: 'remuxing' });
        const transmuxer = new muxjs.mp4.Transmuxer({ remux: true });
        const parts: Uint8Array[] = [];
        transmuxer.on('data', (segment) => {
            if (!parts.length) parts.push(normalizeMp4Durations(segment.initSegment));
            parts.push(segment.data);
        });
        // Amazon's finite H.264/AAC TS replay becomes a self-contained MP4.
        // No transcoding, server proxy, queue or WASM runtime is involved.
        transmuxer.push(new Uint8Array(await blob.arrayBuffer()));
        transmuxer.flush();
        if (parts.length < 2) throw new Error('MP4 processing produced an empty file.');
        const buffer = await new Blob(parts, { type: 'video/mp4' }).arrayBuffer();
        scope.postMessage({ amazonDirect: { buffer, percent: 100 } }, [buffer]);
    } catch (error) {
        post({ error: error instanceof Error ? error.message : 'Amazon download failed.' });
    }
};
