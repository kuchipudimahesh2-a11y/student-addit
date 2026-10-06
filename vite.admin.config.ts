import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    rollupOptions: { input: { index: fileURLToPath(new URL('./admin.html', import.meta.url)) } },
  },
});
