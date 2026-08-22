import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = (process.env.DEV_ALLOWED_HOSTS || '')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    open: false,  // Don't auto-open browser on remote server
    host: '0.0.0.0',  // Bind to all interfaces for remote access
    // Explicit host allowlist supplied by the gitignored Compose environment.
    // Never use `true`: the dev server is reachable through workspace Caddy.
    allowedHosts,
    hmr: {
      // Use the connected Caddy hostname and port; there is no separate HMR
      // host-port mapping.
      overlay: false,   // Disable error overlay to reduce flicker
    },
    watch: {
      // Ignore server files - they're not part of the frontend
      ignored: ['**/src/server/**', '**/node_modules/**', '**/.git/**'],
      // Use polling in Docker environments for better stability
      usePolling: true,
      interval: 1000,  // Check every second instead of constantly
    },
    proxy: {
      // API proxy — all backend requests go through /api.
      // The Vite dev server runs in the `vedanta-systems-dev` container,
      // so docker-internal hostname resolution applies; targeting the
      // sibling api container directly is the correct hop. Previous
      // `host.docker.internal:4101` only worked if a host-side proxy
      // was forwarding 4101→api, which isn't the case in the current
      // compose — left dev frontend unable to reach the api, breaking
      // /api/found-footy/* + /api/btop/* + every other backend route.
      '/api': {
        target: 'http://vedanta-systems-dev-api:3001',
        changeOrigin: true,
        // Mark browser-originated requests. Internal workers call the API
        // container directly and omit this marker.
        headers: { 'X-Vedanta-Public': '1' },
      },
    },
  },
  build: {
    outDir: 'dist',
    // Production source maps are not public assets. Local Vite development
    // still provides source-mapped stack traces through the dev server.
    sourcemap: false,
  },
})
