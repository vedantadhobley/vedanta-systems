// Acceptance-only composition. Never imported by the production BFF.
import express from 'express'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createBtopRouter } from '../../src/server/routes/btop'

const app = express()
app.get('/', (_req, res) => res.redirect('/tests/btop-browser/index.html'))
app.get('/__acceptance/ready', (_req, res) => res.json({ ready: true }))
app.use('/api/btop', createBtopRouter({ natsUrl: process.env.NATS_URL, nodes: ['luv'] }))
const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  // Do not load this checkout's real environment or write its dependency cache.
  envDir: '/tmp/acceptance-env',
  cacheDir: '/tmp/vite-cache',
  plugins: [react()],
  resolve: { alias: { '@': resolve('src') } },
  server: {
    middlewareMode: true,
    allowedHosts: ['preview', ...(process.env.BTOP_PREVIEW_HOST ? [process.env.BTOP_PREVIEW_HOST] : [])],
    hmr: false,
  },
  appType: 'mpa',
})
app.use(vite.middlewares)
app.listen(3000, '0.0.0.0', () => console.log('BTOP_BROWSER_PREVIEW_READY'))
