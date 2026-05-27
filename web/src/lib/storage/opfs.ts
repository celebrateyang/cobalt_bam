import { AbstractStorage } from "./storage";
import { uuid } from "$lib/util";

const COBALT_PROCESSING_DIR = "cobalt-processing-data";
export const FILE_STORAGE_CHANGE_EVENT = "cobalt-file-storage-change";

export type FileStorageUsage = {
    available: boolean;
    bytes: number;
    files: number;
};

const emptyStorageUsage = (available: boolean): FileStorageUsage => ({
    available,
    bytes: 0,
    files: 0,
});

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
    values: () => AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
};

const notifyStorageChanged = () => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(FILE_STORAGE_CHANGE_EVENT));
    }
};

const canAccessOPFSDirectory = () => {
    return typeof navigator !== "undefined" &&
        "storage" in navigator &&
        "getDirectory" in navigator.storage;
};

export class OPFSStorage extends AbstractStorage {
    #root;
    #handle;
    #io;
    #closed = false;

    static #isAvailable?: boolean;

    constructor(root: FileSystemDirectoryHandle, handle: FileSystemFileHandle, reader: FileSystemSyncAccessHandle) {
        super();
        this.#root = root;
        this.#handle = handle;
        this.#io = reader;
    }

    static async init() {
        const root = await navigator.storage.getDirectory();
        const cobaltDir = await root.getDirectoryHandle(COBALT_PROCESSING_DIR, { create: true });
        const handle = await cobaltDir.getFileHandle(uuid(), { create: true });
        const reader = await handle.createSyncAccessHandle();

        return new this(cobaltDir, handle, reader);
    }

    static async open(name: string) {
        const root = await navigator.storage.getDirectory();
        const cobaltDir = await root.getDirectoryHandle(COBALT_PROCESSING_DIR, { create: true });
        const handle = await cobaltDir.getFileHandle(name);
        const reader = await handle.createSyncAccessHandle();

        return new this(cobaltDir, handle, reader);
    }

    getName() {
        return this.#handle.name;
    }

    async getSize() {
        const file = await this.#handle.getFile();
        return file.size;
    }

    async close() {
        if (this.#closed) return;
        await this.#io.flush();
        this.#io.close();
        this.#closed = true;
    }

    async res() {
        // await for compat with ios 15
        await this.close();
        return await this.#handle.getFile();
    }

    async write(data: Uint8Array | Int8Array, offset: number) {
        return this.#io.write(data, { at: offset })
    }

    async destroy() {
        await this.close();
        await this.#root.removeEntry(this.#handle.name);
    }

    static async #computeIsAvailable() {
        let tempFile = uuid(), ok = true;

        if (typeof navigator === 'undefined')
            return false;

        if ('storage' in navigator && 'getDirectory' in navigator.storage) {
            try {
                const root = await navigator.storage.getDirectory();
                const handle = await root.getFileHandle(tempFile, { create: true });
                const syncAccess = await handle.createSyncAccessHandle();
                syncAccess.close();
            } catch {
                ok = false;
            }

            try {
                const root = await navigator.storage.getDirectory();
                await root.removeEntry(tempFile, { recursive: true });
            } catch {
                ok = false;
            }

            return ok;
        }

        return false;
    }

    static async isAvailable() {
        if (this.#isAvailable === undefined) {
            this.#isAvailable = await this.#computeIsAvailable();
        }

        return this.#isAvailable;
    }
}

const measureDirectory = async (dir: FileSystemDirectoryHandle): Promise<FileStorageUsage> => {
    const usage = emptyStorageUsage(true);

    for await (const handle of (dir as IterableDirectoryHandle).values()) {
        if (handle.kind === "file") {
            const file = await handle.getFile();
            usage.bytes += file.size;
            usage.files += 1;
            continue;
        }

        const nested = await measureDirectory(handle);
        usage.bytes += nested.bytes;
        usage.files += nested.files;
    }

    return usage;
};

export const getFileStorageUsage = async (): Promise<FileStorageUsage> => {
    if (!canAccessOPFSDirectory()) {
        return emptyStorageUsage(false);
    }

    const root = await navigator.storage.getDirectory();
    try {
        const cobaltDir = await root.getDirectoryHandle(COBALT_PROCESSING_DIR);
        return await measureDirectory(cobaltDir);
    } catch (error) {
        if (error instanceof DOMException && error.name === "NotFoundError") {
            return emptyStorageUsage(true);
        }
        throw error;
    }
};

export const removeFromFileStorage = async (filename: string) => {
    if (canAccessOPFSDirectory()) {
        const root = await navigator.storage.getDirectory();

        try {
            const cobaltDir = await root.getDirectoryHandle(COBALT_PROCESSING_DIR);
            await cobaltDir.removeEntry(filename);
            notifyStorageChanged();
        } catch {
            // catch and ignore
        }
    }
}

export const clearFileStorage = async () => {
    if (!canAccessOPFSDirectory()) {
        return false;
    }

    const root = await navigator.storage.getDirectory();
    try {
        await root.removeEntry(COBALT_PROCESSING_DIR, { recursive: true });
        notifyStorageChanged();
        return true;
    } catch (error) {
        const usage = await getFileStorageUsage().catch(() => null);
        if (usage?.files === 0) {
            notifyStorageChanged();
            return true;
        }

        console.warn("[storage] unable to clear local processing files", error);
        return false;
    }
}
