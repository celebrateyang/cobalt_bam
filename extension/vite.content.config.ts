import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: false,
        lib: {
            entry: resolve(__dirname, 'src/content.ts'),
            formats: ['iife'],
            fileName: () => 'content.js',
            name: 'FreeSaveVideoContent',
        },
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name][extname]',
            },
        },
    },
});
