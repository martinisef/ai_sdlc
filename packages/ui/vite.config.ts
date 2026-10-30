import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `npm run dev` proxies the API to a running `sdlc ui --no-open` (pass its token with ?token=…).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:4319' } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
