import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Hashed files in js/; the page finds them in js/.vite/manifest.json (lazy parts must
// import exactly the URL the page loaded, so there are no query strings).
export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: {
        outDir: 'js',
        emptyOutDir: true,
        cssCodeSplit: false,
        manifest: true,
        rollupOptions: {
            input: 'src/main.tsx',
            output: { entryFileNames: 'cloud-[hash].js', chunkFileNames: 'cloud-[name]-[hash].js', assetFileNames: 'cloud-[hash].[ext]' },
        },
    },
});
