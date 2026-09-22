import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Strict CSP + no CDN assets (invariant #2): everything is bundled by Vite,
// nothing loaded from a public CDN at runtime. pdf.js's cmaps and standard
// fonts (needed for non-Latin scripts like the Hindi seed document) are
// copied into public/pdfjs/ once (see lib/pdf.ts) rather than fetched from
// pdf.js's default CDN, and served like any other static asset in both dev
// and build via Vite's public dir.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  server: {
    proxy: {
      '/health': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/me': 'http://localhost:3000',
      '/projects': 'http://localhost:3000',
      '/conversations': 'http://localhost:3000',
      '/documents': 'http://localhost:3000',
      '/artifacts': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/access-requests': 'http://localhost:3000',
      '/feedback': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
