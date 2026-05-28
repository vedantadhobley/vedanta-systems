import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
    allowedHosts: true,  // Allow access from any hostname (Tailscale, etc.)
    hmr: {
      // Use the host that the browser connected to (works for Tailscale, local, etc.)
      // Setting host to true makes Vite use the browser's current host
      host: undefined,  // Let client determine host from window.location
      clientPort: 4100, // External port (docker maps 4100 -> 3000)
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
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
