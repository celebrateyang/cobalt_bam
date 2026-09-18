import { prepareXinpianchangDownload, removeXinpianchangRule } from './xinpianchang';

export async function fetchXinpianchangBlob(url: string, sourcePageUrl?: string,
    signal?: AbortSignal, progress?: (bytes: number, total?: number) => void) {
    const ruleId = await prepareXinpianchangDownload(url, sourcePageUrl);
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
        response = await fetch(url, { headers: { Range: 'bytes=0-' }, credentials: 'omit',
            cache: 'no-store', signal });
        if (!response.ok) throw new Error(`Xinpianchang media returned ${response.status}. Play the video and scan again.`);
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (type && !/^(video\/|audio\/|application\/octet-stream$|binary\/octet-stream$)/.test(type)) {
            throw new Error(`Xinpianchang returned ${type} instead of video. Play the video and scan again.`);
        }
        const range = response.headers.get('content-range');
        const match = range?.match(/^bytes 0-(\d+)\/(\d+)$/);
        if (response.status === 206 && (!match || Number(match[1]) + 1 !== Number(match[2]))) {
            throw new Error('Xinpianchang returned only part of the video. Play the video and scan again.');
        }
        const total = match ? Number(match[2]) : Number(response.headers.get('content-length')) || undefined;
        reader = response.body?.getReader();
        if (!reader) throw new Error('The video response was empty.');
        const chunks: ArrayBuffer[] = [];
        const prefix: number[] = [];
        let received = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value.slice().buffer as ArrayBuffer);
            received += value.byteLength;
            if (prefix.length < 8) prefix.push(...value.slice(0, 8 - prefix.length));
            if (prefix.length === 8 && String.fromCharCode(...prefix.slice(4)) !== 'ftyp') {
                throw new Error('The server did not return an MP4 file. Play the video and scan again.');
            }
            progress?.(received, total);
        }
        if (received < 8 || (total !== undefined && received !== total)) {
            throw new Error('The video download was incomplete. Please retry.');
        }
        return new Blob(chunks, { type: 'video/mp4' });
    } finally {
        await reader?.cancel().catch(() => {});
        if (response && !reader) await response.body?.cancel().catch(() => {});
        await removeXinpianchangRule(ruleId);
    }
}
