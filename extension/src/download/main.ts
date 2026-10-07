import { fetchXinpianchangBlob } from '../downloader/xinpianchang-fetch';
import type { XinpianchangJob } from '../downloader/xinpianchang-job';
import type { AmazonJob } from '../downloader/amazon-job';
import AmazonWorker from '../downloader/amazon-worker?worker';
import { downloadAmazonMp4 } from '@freesavevideo/amazon-direct/runner';
import './style.css';

const status = document.querySelector<HTMLElement>('#status')!;
const progress = document.querySelector<HTMLProgressElement>('#progress')!;
const button = document.querySelector<HTMLButtonElement>('#cancel')!;
const controller = new AbortController();
let blobUrl: string | undefined;
let downloadId: number | undefined;
let terminal = false;
const release = () => { if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = undefined; };
const finish = (state: string, error?: string) => {
    if (terminal) return;
    terminal = true;
    release();
    status.textContent = state === 'complete' ? 'Video saved successfully.' : `Download failed: ${error || 'Download interrupted.'}`;
    button.textContent = 'Close';
};
chrome.downloads.onChanged.addListener(delta => {
    if (delta.id === downloadId && delta.state?.current) {
        if (delta.state.current === 'complete' || delta.state.current === 'interrupted') finish(delta.state.current, delta.error?.current);
    }
});
button.addEventListener('click', () => {
    if (terminal) { window.close(); return; }
    controller.abort();
    if (downloadId !== undefined) void chrome.downloads.cancel(downloadId).catch(() => {});
    finish('interrupted', 'Cancelled.');
});
window.addEventListener('pagehide', () => { controller.abort(); release(); });

async function run() {
    const key = location.hash.slice(1);
    if (!/^(?:xpc|amazon)-job-[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid download task.');
    const data = await chrome.storage.session.get(key);
    await chrome.storage.session.remove(key);
    const job = data[key] as XinpianchangJob | AmazonJob | undefined;
    if (!job || Date.now() - job.createdAt > 300000) throw new Error('This download task expired. Start it again from the extension.');
    document.querySelector('#filename')!.textContent = job.filename.split('/').pop() || 'Video';
    status.textContent = 'Downloading video...';
    const blob = key.startsWith('amazon-job-')
        ? await downloadAmazonMp4(() => new AmazonWorker(), job.url, controller.signal, state => {
            status.textContent = state.stage === 'remuxing' ? 'Preparing MP4 file...' : `Downloading video: ${(state.bytes / 1048576).toFixed(1)} MB`;
            progress.max = 100; progress.value = state.percent;
        })
        : await fetchXinpianchangBlob(job.url, (job as XinpianchangJob).sourcePageUrl, controller.signal, (bytes, total) => {
        status.textContent = `Downloading video: ${(bytes / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}`;
        if (total) { progress.max = total; progress.value = bytes; }
    });
    controller.signal.throwIfAborted();
    // Chrome saves verified local bytes, never making a second CDN request.
    blobUrl = URL.createObjectURL(blob);
    status.textContent = 'Saving MP4 file...';
    downloadId = await chrome.downloads.download({ url: blobUrl, filename: job.filename, saveAs: false });
    if (controller.signal.aborted) {
        await chrome.downloads.cancel(downloadId).catch(() => {});
        controller.signal.throwIfAborted();
    }
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item?.state === 'complete' || item?.state === 'interrupted') finish(item.state, item.error);
}
void run().catch(error => finish('interrupted', controller.signal.aborted ? 'Cancelled.' : String(error instanceof Error ? error.message : error)));
