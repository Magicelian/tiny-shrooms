import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  // L'interface est écrite en JSX pour Preact.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'safari16' },
});
