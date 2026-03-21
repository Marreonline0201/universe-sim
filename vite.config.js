import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
export default defineConfig({
    plugins: [react(), wasm(), topLevelAwait()],
    worker: {
        format: 'es',
        plugins: () => [wasm(), topLevelAwait()],
    },
    optimizeDeps: {
        exclude: ['@dimforge/rapier3d-compat'],
    },
    server: {
        headers: {
            // Required for SharedArrayBuffer (used by the grid and workers)
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
    build: {
        target: 'esnext',
    },
});
