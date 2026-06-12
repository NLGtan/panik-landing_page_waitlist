import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        input: {
          // "panik landing page" — the public marketing site
          landing: path.resolve(__dirname, 'index.html'),
          // "panik core" — the isolated product app (separate bundle / surface)
          app: path.resolve(__dirname, 'app.html'),
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react')) {
                return 'vendor-react';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('lucide')) {
                return 'vendor-lucide';
              }
              return 'vendor';
            }
          },
        },
      },
    },
  };
});
