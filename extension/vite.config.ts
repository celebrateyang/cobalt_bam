import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
            input: {
                background: resolve(__dirname, 'src/background.ts'),
                content: resolve(__dirname, 'src/content.ts'),
                popup: resolve(__dirname, 'src/popup/index.html'),
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name][extname]',
            },
        },
    },
});
