// needed so that changelog files are appropriately
// typed as svelte components
declare module '*.md' {
    import type { SvelteComponentDev } from 'svelte/internal';

    export default class Comp extends SvelteComponentDev {
        $$prop_def: {};
    }
    export const metadata: Record<string, any>;
}

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    interface FileSystemSyncAccessHandle {
        close(): void;
        flush(): Promise<void> | void;
        write(
            buffer: BufferSource,
            options?: { at?: number },
        ): number;
    }

    interface FileSystemFileHandle {
        createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
    }

    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
