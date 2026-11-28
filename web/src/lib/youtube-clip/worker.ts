import LibAV from '@imput/libav.js-encode-cli';

type ClipTask = { urls: string[]; start: number; end: number; filename: string };

self.onmessage = async (event: MessageEvent<ClipTask>) => {
    const { urls, start, end, filename } = event.data;
    let av: Awaited<ReturnType<typeof LibAV.LibAV>> | undefined;
    let access: FileSystemSyncAccessHandle | undefined;
    let dir: FileSystemDirectoryHandle | undefined;
    let storageName: string | undefined;
    let success = false;
    try {
        if (urls.length !== 2 || !urls.every(url => typeof url === 'string' && url.length > 0)
            || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
            throw new Error('invalid_clip');
        }
        const sizes: number[] = [];
        for (const url of urls) {
            const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30000) });
            const range = /^bytes 0-0\/(\d+)$/.exec(res.headers.get('Content-Range') || '');
            if (res.status !== 206 || !range) throw new Error(`range_unavailable:${res.status}:${res.headers.get('Content-Range') || 'missing'}`);
            const size = Number(range[1]);
            if (!Number.isSafeInteger(size) || size <= 0 || (await res.arrayBuffer()).byteLength !== 1) throw new Error('range_unavailable:invalid_size');
            sizes.push(size);
        }
        const root = await navigator.storage.getDirectory();
        dir = await root.getDirectoryHandle('fsv-youtube-clips', { create: true });
        // Clean up only stale files made by this feature, never active tasks.
        for await (const name of (dir as any).keys() as AsyncIterable<string>) {
            const created = Number(/^clip-(\d+)-[0-9a-f-]+\.webm$/i.exec(name)?.[1]);
            if (created && Date.now() - created > 24 * 60 * 60 * 1000) {
                await dir.removeEntry(name).catch(() => undefined);
            }
        }
        storageName = `clip-${Date.now()}-${crypto.randomUUID()}.webm`;
        const fileHandle = await dir.getFileHandle(storageName, { create: true });
        access = await fileHandle.createSyncAccessHandle();
        av = await LibAV.LibAV({ base: '/_libav', nothreads: true, noworker: true });
        const engine = av;
        let bytes = 0, outputSize = 0;
        let writeError: unknown;
        engine.onblockread = (name, pos, length) => {
            const index = name.endsWith('input0') ? 0 : 1;
            const last = Math.min(pos + length - 1, sizes[index] - 1);
            void (async () => {
                if (!Number.isSafeInteger(pos) || !Number.isSafeInteger(length) || pos < 0 || length <= 0 || last < pos) throw new Error('invalid_range');
                const res = await fetch(urls[index], { headers: { Range: `bytes=${pos}-${last}` }, signal: AbortSignal.timeout(30000) });
                if (res.status !== 206 || res.headers.get('Content-Range') !== `bytes ${pos}-${last}/${sizes[index]}`) throw new Error('range_unavailable');
                const chunk = new Uint8Array(await res.arrayBuffer());
                if (chunk.length !== last - pos + 1) throw new Error('short_read');
                bytes += chunk.length;
                self.postMessage({ stage: 'processing', sourceBytes: bytes });
                await engine.ff_block_reader_dev_send(name, pos, chunk);
            })().catch(async () => {
                await engine.ff_block_reader_dev_send(name, pos, null, { errorCode: -5 });
            });
        };
        await engine.mkblockreaderdev('input0', sizes[0]);
        await engine.mkblockreaderdev('input1', sizes[1]);
        engine.onwrite = (name, pos, data) => {
            if (name !== 'clip.webm' || writeError || !access) return;
            try {
                if (access.write(data, { at: pos }) !== data.length) throw new Error('short_write');
                outputSize = Math.max(outputSize, pos + data.length);
            } catch (error) { writeError = error; }
        };
        await engine.mkwriterdev('clip.webm');
        const code = await engine.ffmpeg(['-nostdin', '-y', '-loglevel', 'error', '-xerror',
            '-ss', String(start), '-i', 'input0', '-ss', String(start), '-i', 'input1',
            '-t', String(end - start), '-map', '0:v:0', '-map', '1:a:0',
            '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
            '-c:a', 'libopus', '-f', 'webm', 'clip.webm']);
        if (writeError) throw writeError;
        if (code !== 0 || outputSize === 0) throw new Error('processing_failed');
        access.flush(); access.close(); access = undefined;
        const result = await fileHandle.getFile();
        if (result.size !== outputSize) throw new Error('short_write');
        // A truncated media source can otherwise end successfully with an
        // incomplete clip. Verify the produced file before reporting success.
        await engine.mkreadaheadfile('verify.webm', result);
        try {
            const probeCode = await engine.ffprobe(['-v', 'quiet', '-show_entries',
                'format=duration:stream=codec_type', '-of', 'json', 'verify.webm', '-o', 'clip-probe.json']);
            if (probeCode !== 0) throw new Error('invalid_output');
            const probe = JSON.parse(new TextDecoder().decode(await engine.readFile('clip-probe.json')));
            const duration = Number(probe?.format?.duration);
            const types = Array.isArray(probe?.streams) ? probe.streams.map((stream: {codec_type?: string}) => stream.codec_type) : [];
            if (!Number.isFinite(duration) || Math.abs(duration - (end - start)) > 0.15
                || !types.includes('video') || !types.includes('audio')) throw new Error('invalid_output');
        } finally {
            await engine.unlinkreadaheadfile('verify.webm').catch(() => undefined);
            await engine.unlink('clip-probe.json').catch(() => undefined);
        }
        success = true;
        self.postMessage({ stage: 'done', file: new File([result], filename, { type: 'video/webm' }), storageName, sourceBytes: bytes });
    } catch (error) {
        self.postMessage({ stage: 'error', error: error instanceof Error ? error.message : 'processing_failed' });
    } finally {
        access?.close();
        av?.terminate();
        if (!success && dir && storageName) await dir.removeEntry(storageName).catch(() => undefined);
    }
};
