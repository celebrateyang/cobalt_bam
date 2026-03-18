import type { AbstractStorage } from "./storage";
import { MemoryStorage } from "./memory";
import { OPFSStorage } from "./opfs";

export async function init(expectedSize?: number): Promise<AbstractStorage> {
    if (await OPFSStorage.isAvailable()) {
        return OPFSStorage.init();
    }

    if (await MemoryStorage.isAvailable()) {
        return MemoryStorage.init(expectedSize || 0);
    }

    throw "no storage method is available";
}

export async function openExisting(filename: string): Promise<AbstractStorage | null> {
    if (!filename) return null;

    if (await OPFSStorage.isAvailable()) {
        try {
            return await OPFSStorage.open(filename);
        } catch {
            return null;
        }
    }

    return null;
}

export function retype(file: File, type: string) {
    return new File([ file ], file.name, { type });
}
