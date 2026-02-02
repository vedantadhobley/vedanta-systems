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
      // Proxy btop to dev btop container (WebSocket)
      '/btop': {
        target: 'http://vedanta-systems-dev-btop:7681',
        changeOrigin: true,
        ws: true,  // Enable WebSocket proxying
        rewrite: (path) => path.replace(/^\/btop/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
