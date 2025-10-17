import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    open: true,
    host: '0.0.0.0',  // Bind to all interfaces so Tailscale can reach it
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
