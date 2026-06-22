import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-rewrite',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = req.url ? req.url.split('?')[0] : '';
            if (url === '/founding' || url === '/early-access') {
              req.url = '/founding.html' + (req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
            } else if (url === '/app') {
              req.url = '/app.html' + (req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
            }
            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR can be disabled via the DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Local scoring API (npm run dev:api) — keys stay server-side; the
      // browser only sees score JSON. 127.0.0.1 (not localhost): Node 17+
      // resolves localhost to ::1 first on Windows → ECONNREFUSED.
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
    build: {
      rollupOptions: {
        input: {
          // "panik landing page" — the public marketing site
          landing: path.resolve(__dirname, 'index.html'),
          // "panik core" — the isolated product app (separate bundle / surface)
          app: path.resolve(__dirname, 'app.html'),
          // "founding user" — hidden escrow page (direct URL only, not linked from nav)
          founding: path.resolve(__dirname, 'founding.html'),
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
