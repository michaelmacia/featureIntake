import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.join(here, '..', 'shared') },
  },
  server: {
    port: 5173,
    // The API runs separately (npm run dev starts both); the browser only talks to Vite.
    proxy: { '/api': 'http://127.0.0.1:3000' },
    // shared/rules.js lives outside web/
    fs: { allow: [path.join(here, '..')] },
  },
  build: {
    outDir: path.join(here, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
});
