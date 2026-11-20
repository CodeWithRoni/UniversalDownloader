import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tauri serves the built files itself; the GitHub Pages preview sets
// VITE_BASE=/UniversalDownloader/ in its workflow.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE || './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
    sourcemap: false,
  },
})
