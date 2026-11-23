import { OPFSStorage } from "$lib/storage/opfs";

// The synchronous access handle is available only inside a dedicated worker.
self.onmessage = async () => {
    try {
        self.postMessage(await OPFSStorage.isAvailable());
    } catch {
        self.postMessage(false);
    }
};
