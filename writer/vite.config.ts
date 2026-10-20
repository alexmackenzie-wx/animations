import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP for the packaged app. (Skipped in dev, where Vite injects inline scripts.)
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' data: blob:",
  'frame-src embed:',
].join('; ');

const csp = () => ({
  name: 'writer-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  // Relative paths so the built app loads from file:// inside Electron.
  base: './',
  plugins: [react(), csp()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'chrome130', chunkSizeWarningLimit: 4000 },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['harper.js'] },
});
