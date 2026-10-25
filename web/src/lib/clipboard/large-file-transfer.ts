export const MEMORY_FILE_LIMIT = 200 * 1024 * 1024;
export const MAX_TRANSFER_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const CHUNK_BYTES = 32 * 1024;
const WINDOW_CHUNKS = 16;
const WAIT_MS = 60_000;

type DiskReceive = {
    id: string; name: string; size: number; type: string; next: number;
    root: FileSystemDirectoryHandle; handle: FileSystemFileHandle;
    writer: FileSystemWritableFileStream; tempName: string;
    idleTimer?: ReturnType<typeof setTimeout>;
};
type Options = {
    send: (message: object) => void;
    sendChunk: (id: string, index: number, total: number, data: Uint8Array) => Promise<void>;
    decrypt: (data: Uint8Array) => Promise<Uint8Array>;
    progress: (percent: number, receiving: boolean) => void;
    received: (file: Blob, name: string, release: () => Promise<void>) => void;
    failed: () => void;
    getRoot?: () => Promise<FileSystemDirectoryHandle>;
};

// Large transfers use a separate versioned protocol. Only one bounded window
// can be in flight; acknowledgements follow disk writes, not network receipt.
export class LargeFileTransfer {
    private receiving: DiskReceive | null = null;
    private sendingId: string | null = null;
    private generation = 0;
    private preparing = false;
    private incoming = Promise.resolve();
    private waiters = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    constructor(private options: Options) {}

    get isReceiving() { return this.preparing || this.receiving !== null; }

    private monitor(receiving: DiskReceive) {
        clearTimeout(receiving.idleTimer);
        receiving.idleTimer = setTimeout(() => {
            if (this.receiving !== receiving) return;
            this.cancel();
            this.options.failed();
        }, WAIT_MS);
    }

    private wait(id: string, phase: string) {
        const key = `${id}:${phase}`;
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { this.waiters.delete(key); reject(new Error("large_transfer_timeout")); }, WAIT_MS);
            this.waiters.set(key, { resolve, reject, timer });
        });
    }

    private acknowledge(id: string, phase: string) {
        const key = `${id}:${phase}`;
        const waiter = this.waiters.get(key);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        this.waiters.delete(key);
        waiter.resolve();
    }

    private rejectWaiters() {
        for (const waiter of this.waiters.values()) {
            clearTimeout(waiter.timer);
            waiter.reject(new Error("large_transfer_cancelled"));
        }
        this.waiters.clear();
    }

    cancel(notify = true) {
        this.generation++;
        const receiving = this.receiving;
        const id = receiving?.id || this.sendingId;
        this.receiving = null;
        this.sendingId = null;
        this.rejectWaiters();
        if (receiving) {
            clearTimeout(receiving.idleTimer);
            void receiving.writer.abort().catch(() => {}).then(() => receiving.root.removeEntry(receiving.tempName)).catch(() => {});
        }
        if (notify && id) { try { this.options.send({ type: "large_file_error_v1", fileId: id }); } catch {} }
    }

    async sendFile(file: File) {
        if (!Number.isSafeInteger(file.size) || file.size > MAX_TRANSFER_FILE_SIZE || file.size <= MEMORY_FILE_LIMIT) throw new Error("large_transfer_size");
        if (this.preparing || this.sendingId || this.receiving) throw new Error("large_transfer_busy");
        const id = crypto.randomUUID();
        this.sendingId = id;
        const generation = this.generation;
        try {
            const ready = this.wait(id, "ready");
            void ready.catch(() => {});
            this.options.send({ type: "large_file_start_v1", fileId: id, name: file.name, size: file.size, mimeType: file.type });
            await ready;
            const total = Math.ceil(file.size / CHUNK_BYTES);
            for (let start = 0; start < total; start += WINDOW_CHUNKS) {
                if (generation !== this.generation) throw new Error("large_transfer_cancelled");
                const end = Math.min(start + WINDOW_CHUNKS, total);
                const persisted = this.wait(id, `ack:${end}`);
                // Attach a rejection handler while the window is being sent.
                void persisted.catch(() => {});
                for (let index = start; index < end; index++) {
                    if (generation !== this.generation) throw new Error("large_transfer_cancelled");
                    const bytes = new Uint8Array(await file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).arrayBuffer());
                    await this.options.sendChunk(id, index, total, bytes);
                }
                await persisted;
                this.options.progress(Math.floor(end / total * 100), false);
            }
            const done = this.wait(id, "done");
            void done.catch(() => {});
            this.options.send({ type: "large_file_end_v1", fileId: id });
            await done;
        } catch (error) {
            if (this.sendingId === id) this.cancel();
            throw error;
        } finally {
            if (this.sendingId === id) this.sendingId = null;
        }
    }

    async control(message: any): Promise<boolean> {
        if (typeof message?.type !== "string" || !message.type.startsWith("large_file_")) return false;
        if (message.type === "large_file_ready_v1") this.acknowledge(message.fileId, "ready");
        else if (message.type === "large_file_ack_v1") this.acknowledge(message.fileId, `ack:${message.next}`);
        else if (message.type === "large_file_done_v1") this.acknowledge(message.fileId, "done");
        else if (message.type === "large_file_error_v1") {
            if (message.fileId === this.sendingId || message.fileId === this.receiving?.id) {
                this.cancel(false);
                this.options.failed();
            }
        } else if (message.type === "large_file_start_v1") {
            if (this.preparing || this.receiving || this.sendingId) {
                this.options.send({ type: "large_file_error_v1", fileId: message.fileId });
                return true;
            }
            const generation = this.generation;
            let pending: DiskReceive | null = null;
            try {
                if (!Number.isSafeInteger(message.size)
                    || message.size <= MEMORY_FILE_LIMIT || message.size > MAX_TRANSFER_FILE_SIZE
                    || typeof message.fileId !== "string" || message.fileId.length > 100
                    || typeof message.name !== "string" || message.name.length > 1024) throw new Error("large_transfer_invalid");
                this.preparing = true;
                const root = await (this.options.getRoot ? this.options.getRoot() : navigator.storage.getDirectory().then(root => root.getDirectoryHandle('fsv-large-transfers', { create: true })));
                // Interrupted tabs can leave files behind. Expire only our own
                // day-old files, preserving transfers in other active tabs.
                for await (const name of (root as any).keys()) {
                    const created = Number(/^fsv-transfer-(\d+)-/.exec(name)?.[1]);
                    if (created && Date.now() - created > 24 * 60 * 60 * 1000) await root.removeEntry(name).catch(() => {});
                }
                const estimate = await navigator.storage?.estimate?.();
                if (estimate?.quota && message.size > estimate.quota - (estimate.usage || 0)) throw new Error("large_transfer_quota");
                const tempName = `fsv-transfer-${Date.now()}-${crypto.randomUUID()}`;
                const handle = await root.getFileHandle(tempName, { create: true });
                let writer: FileSystemWritableFileStream;
                try { writer = await handle.createWritable(); }
                catch (error) { await root.removeEntry(tempName).catch(() => {}); throw error; }
                pending = { id: message.fileId, name: message.name, size: message.size, type: message.mimeType || "application/octet-stream", next: 0, root, handle, writer, tempName };
                if (generation !== this.generation) throw new Error("large_transfer_cancelled");
                this.receiving = pending;
                this.monitor(pending);
                this.options.progress(0, true);
                this.options.send({ type: "large_file_ready_v1", fileId: message.fileId });
            } catch {
                if (pending) {
                    clearTimeout(pending.idleTimer);
                    await pending.writer.abort().catch(() => {});
                    await pending.root.removeEntry(pending.tempName).catch(() => {});
                    if (this.receiving === pending) this.receiving = null;
                }
                this.options.send({ type: "large_file_error_v1", fileId: message.fileId });
                if (generation === this.generation) this.options.failed();
            } finally {
                this.preparing = false;
            }
        } else if (message.type === "large_file_end_v1") {
            await this.incoming;
            const receiving = this.receiving;
            if (!receiving || receiving.id !== message.fileId) return true;
            try {
                if (receiving.next !== Math.ceil(receiving.size / CHUNK_BYTES)) throw new Error("large_transfer_incomplete");
                clearTimeout(receiving.idleTimer);
                await receiving.writer.close();
                const file = await receiving.handle.getFile();
                if (file.size !== receiving.size || this.receiving !== receiving) throw new Error("large_transfer_incomplete");
                this.receiving = null;
                this.options.received(file.slice(0, file.size, receiving.type), receiving.name, () => receiving.root.removeEntry(receiving.tempName));
                this.options.send({ type: "large_file_done_v1", fileId: receiving.id });
            } catch {
                this.cancel();
                this.options.failed();
            }
        }
        return true;
    }

    chunk(id: string, index: number, total: number, encrypted: Uint8Array): boolean {
        if (this.receiving?.id !== id) return false;
        const receiving = this.receiving;
        this.incoming = this.incoming.then(async () => {
            if (this.receiving !== receiving) return;
            if (index !== receiving.next || total !== Math.ceil(receiving.size / CHUNK_BYTES)) throw new Error("large_transfer_order");
            const bytes = await this.options.decrypt(encrypted);
            if (this.receiving !== receiving) return;
            if (bytes.length !== Math.min(CHUNK_BYTES, receiving.size - index * CHUNK_BYTES)) throw new Error("large_transfer_chunk_size");
            await receiving.writer.write(new Uint8Array(bytes).buffer);
            if (this.receiving !== receiving) return;
            this.monitor(receiving);
            receiving.next++;
            if (receiving.next % WINDOW_CHUNKS === 0 || receiving.next === total) {
                this.options.progress(Math.floor(receiving.next / total * 100), true);
                this.options.send({ type: "large_file_ack_v1", fileId: id, next: receiving.next });
            }
        }).catch(() => {
            if (this.receiving !== receiving) return;
            this.cancel(); this.options.failed();
        });
        return true;
    }
}
