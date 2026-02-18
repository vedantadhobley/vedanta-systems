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
    allowedHosts: ['luv', 'luv.tailf424db.ts.net', 'localhost'],
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
      // API proxy - all backend requests go through /api
      // This includes btop frames (/api/btop/frame.png) routed through the Express server
      '/api': {
        target: 'http://api:3001',
        changeOrigin: true,
      },
      // BlueMap proxy - Minecraft server map on joi
      '/bluemap': {
        target: 'http://joi:3201',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bluemap/, ''),
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
