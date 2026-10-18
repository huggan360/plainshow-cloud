import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// One bundle with fixed names in js/; the page adds ?v=<file time> itself.
export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: {
        outDir: 'js',
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            input: 'src/main.tsx',
            output: { entryFileNames: 'cloud.js', chunkFileNames: 'cloud-[name].js', assetFileNames: 'cloud.[ext]' },
        },
    },
});
