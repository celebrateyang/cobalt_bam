const AUTO_SAVE_DB = "cobalt-auto-save";
const AUTO_SAVE_STORE = "handles";
const AUTO_SAVE_DIRECTORY_KEY = "download-directory";

let activeDirectory: FileSystemDirectoryHandle | null = null;
let writeChain = Promise.resolve();
let restorePromise: Promise<FileSystemDirectoryHandle | null> | null = null;

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(AUTO_SAVE_DB, 1);

    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(AUTO_SAVE_STORE)) {
            db.createObjectStore(AUTO_SAVE_STORE);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const readStoredDirectory = async () => {
    if (typeof indexedDB === "undefined") return null;

    const db = await openDatabase();
    try {
        return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
            const transaction = db.transaction(AUTO_SAVE_STORE, "readonly");
            const request = transaction.objectStore(AUTO_SAVE_STORE).get(AUTO_SAVE_DIRECTORY_KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
};

const storeDirectory = async (handle: FileSystemDirectoryHandle) => {
    const db = await openDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(AUTO_SAVE_STORE, "readwrite");
            transaction.objectStore(AUTO_SAVE_STORE).put(handle, AUTO_SAVE_DIRECTORY_KEY);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } finally {
        db.close();
    }
};

const hasReadWritePermission = async (handle: FileSystemDirectoryHandle) => {
    return await handle.queryPermission({ mode: "readwrite" }) === "granted";
};

const requestReadWritePermission = async (handle: FileSystemDirectoryHandle) => {
    if (await hasReadWritePermission(handle)) return true;
    return await handle.requestPermission({ mode: "readwrite" }) === "granted";
};

export const supportsAutoSaveDirectory = () => (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "showDirectoryPicker" in window
);

export const restoreAutoSaveDirectory = () => {
    if (!supportsAutoSaveDirectory()) {
        return Promise.resolve(null);
    }
    if (!restorePromise) {
        restorePromise = readStoredDirectory()
            .then((handle) => {
                if (!activeDirectory) {
                    activeDirectory = handle;
                }
                return handle;
            })
            .catch(() => null);
    }
    return restorePromise;
};

export const prepareAutoSaveDirectory = async (options?: { prompt?: boolean }) => {
    if (!supportsAutoSaveDirectory()) return false;

    let handle = activeDirectory;
    if (!options?.prompt && handle && await requestReadWritePermission(handle).catch(() => false)) {
        activeDirectory = handle;
        return true;
    }

    try {
        handle = await window.showDirectoryPicker({
            id: "cobalt-batch-downloads",
            mode: "readwrite",
            startIn: "downloads",
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            return false;
        }
        throw error;
    }

    if (!await requestReadWritePermission(handle)) {
        return false;
    }

    activeDirectory = handle;
    await storeDirectory(handle).catch((error) => {
        console.warn("[auto-save] unable to remember directory", error);
    });
    return true;
};

if (typeof window !== "undefined") {
    void restoreAutoSaveDirectory();
}

const sanitizeFilename = (filename: string) => {
    const cleaned = filename
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .replace(/[ .]+$/g, "")
        .trim();

    return cleaned || `download-${Date.now()}`;
};

const splitFilename = (filename: string) => {
    const dot = filename.lastIndexOf(".");
    if (dot <= 0 || dot === filename.length - 1) {
        return { stem: filename, extension: "" };
    }
    return {
        stem: filename.slice(0, dot),
        extension: filename.slice(dot),
    };
};

const getAvailableFilename = async (
    directory: FileSystemDirectoryHandle,
    requestedFilename: string,
) => {
    const filename = sanitizeFilename(requestedFilename);
    const { stem, extension } = splitFilename(filename);

    for (let suffix = 0; suffix < 10_000; suffix += 1) {
        const candidate = suffix === 0
            ? filename
            : `${stem} (${suffix})${extension}`;
        try {
            await directory.getFileHandle(candidate);
        } catch (error) {
            if (error instanceof DOMException && error.name === "NotFoundError") {
                return candidate;
            }
            throw error;
        }
    }

    return `${stem}-${Date.now()}${extension}`;
};

const writeFile = async (file: File, requestedFilename: string) => {
    const directory = activeDirectory || await readStoredDirectory().catch(() => null);
    if (!directory || !await hasReadWritePermission(directory)) {
        throw new DOMException("Auto-save directory permission is unavailable", "NotAllowedError");
    }

    activeDirectory = directory;
    const filename = await getAvailableFilename(directory, requestedFilename);
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();

    try {
        await writable.write(file);
        await writable.close();
    } catch (error) {
        await writable.abort().catch(() => undefined);
        await directory.removeEntry(filename).catch(() => undefined);
        throw error;
    }

    return {
        directoryName: directory.name,
        filename,
    };
};

export const saveFileToAutoSaveDirectory = (
    file: File,
    requestedFilename: string,
) => {
    const operation = writeChain.then(() => writeFile(file, requestedFilename));
    writeChain = operation.then(() => undefined, () => undefined);
    return operation;
};
