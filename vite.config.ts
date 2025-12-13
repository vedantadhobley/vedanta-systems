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
      clientPort: 3000,  // Hot module reload
    },
    watch: {
      // Ignore server files - they're not part of the frontend
      ignored: ['**/src/server/**'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
