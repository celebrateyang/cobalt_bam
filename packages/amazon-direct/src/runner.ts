export type AmazonDownloadProgress = { bytes: number; percent: number; stage: 'downloading' | 'remuxing' };

export const downloadAmazonMp4 = (
    makeWorker: () => Worker,
    url: string,
    signal: AbortSignal,
    onProgress: (progress: AmazonDownloadProgress) => void,
): Promise<Blob> => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (error?: Error, blob?: Blob) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        worker?.terminate();
        if (error) reject(error); else resolve(blob!);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const deadline = () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error('Amazon download timed out. Retry the download.')), 130_000);
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
        worker = makeWorker();
        worker.onerror = () => finish(new Error('Browser MP4 processing could not start.'));
        worker.onmessageerror = () => finish(new Error('Browser MP4 processing failed.'));
        worker.onmessage = (event) => {
            const data = event.data?.amazonDirect;
            if (!data || settled) return;
            deadline();
            if (data.error) { finish(new Error(data.error)); return; }
            if (data.buffer) { finish(undefined, new Blob([data.buffer], { type: 'video/mp4' })); return; }
            onProgress(data);
        };
        deadline();
        worker.postMessage({ url });
    } catch (error) { finish(error instanceof Error ? error : new Error('Browser MP4 processing failed.')); }
});
