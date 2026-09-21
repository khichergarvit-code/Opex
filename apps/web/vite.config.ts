import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP + no CDN assets (invariant #2): everything is bundled by Vite,
// nothing loaded from a public CDN at runtime.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/me': 'http://localhost:3000',
      '/projects': 'http://localhost:3000',
      '/conversations': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
