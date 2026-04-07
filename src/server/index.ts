import express from 'express'
import cors from 'cors'
import http from 'http'

// Import project routes
import { createFoundFootyRouter } from './routes/found-footy'
import { createSpinCycleRouter } from './routes/spin-cycle'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.API_PORT || 3001
const isDev = process.env.NODE_ENV !== 'production'

// ============ PROJECT CONFIGURATION ============

// Found Footy configuration (from environment)
const foundFootyConfig = {
  mongoUri: process.env.MONGODB_URI || '',
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || '',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
    useSSL: process.env.MINIO_USE_SSL === 'true' // Default to false (most internal MinIO setups use HTTP)
  },
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'temporal:7233'
  },
  twitter: {
    apiKey: process.env.TWITTER_API_KEY || ''
  }
}

// Spin Cycle configuration (from environment)
const spinCycleConfig = {
  postgresUri: process.env.SPIN_CYCLE_POSTGRES_URI || '',
}

// Validate Found Footy config - fail fast if not configured
if (!foundFootyConfig.mongoUri) {
  throw new Error('MONGODB_URI environment variable is required')
}
if (!foundFootyConfig.minio.endpoint) {
  throw new Error('MINIO_ENDPOINT environment variable is required')
}
if (!foundFootyConfig.minio.accessKey || !foundFootyConfig.minio.secretKey) {
  throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables are required')
}

// Validate Spin Cycle config
if (!spinCycleConfig.postgresUri) {
  console.warn('⚠️  SPIN_CYCLE_POSTGRES_URI not set — spin-cycle routes will fail')
}

// ============ MOUNT PROJECT ROUTES ============

// Found Footy - Goal clip aggregator
// Endpoints: /api/found-footy/health, /api/found-footy/fixtures, /api/found-footy/stream, etc.
const foundFootyRouter = createFoundFootyRouter(foundFootyConfig)
app.use('/api/found-footy', foundFootyRouter)

// Spin Cycle - Claim verification pipeline
// Endpoints: /api/spin-cycle/health, /api/spin-cycle/transcripts, /api/spin-cycle/claims/:id, /api/spin-cycle/stream, etc.
if (spinCycleConfig.postgresUri) {
  const spinCycleRouter = createSpinCycleRouter(spinCycleConfig)
  app.use('/api/spin-cycle', spinCycleRouter)
}

// ============ BTOP PROXY ============
// Proxy btop frame/health/stream requests to btop containers
// Supports multiple nodes (luv, joi) via different ports

const BTOP_HOST = process.env.BTOP_HOST || 'host.docker.internal'

function mountBtopProxy(app: ReturnType<typeof express>, prefix: string, port: string, label: string) {
  const portNum = parseInt(port)

  app.get(`${prefix}/frame.png`, (_req, res) => {
    const proxyReq = http.request({ hostname: BTOP_HOST, port: portNum, path: '/frame.png', method: 'GET', timeout: 5000 }, (proxyRes) => {
      res.status(proxyRes.statusCode || 200)
      res.set('Content-Type', 'image/png')
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      proxyRes.pipe(res)
    })
    proxyReq.on('error', (err) => { console.error(`btop ${label} proxy error:`, err.message); res.status(503).json({ error: `btop ${label} unavailable` }) })
    proxyReq.on('timeout', () => { proxyReq.destroy(); res.status(504).json({ error: `btop ${label} timeout` }) })
    proxyReq.end()
  })

  app.get(`${prefix}/health`, (_req, res) => {
    const proxyReq = http.request({ hostname: BTOP_HOST, port: portNum, path: '/health', method: 'GET', timeout: 2000 }, (proxyRes) => {
      res.status(proxyRes.statusCode || 200)
      res.set('Content-Type', 'text/plain')
      proxyRes.pipe(res)
    })
    proxyReq.on('error', () => { res.status(503).json({ error: `btop ${label} unavailable` }) })
    proxyReq.end()
  })

  app.get(`${prefix}/`, (_req, res) => {
    const proxyReq = http.request({ hostname: BTOP_HOST, port: portNum, path: '/', method: 'GET', timeout: 5000 }, (proxyRes) => {
      res.status(proxyRes.statusCode || 200)
      res.set('Content-Type', 'text/html')
      proxyRes.pipe(res)
    })
    proxyReq.on('error', (err) => {
      console.error(`btop ${label} viewer proxy error:`, err.message)
      res.status(503).send(`<html><body style="background:#000;color:#c9a0f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">${label} monitor unavailable</body></html>`)
    })
    proxyReq.end()
  })

  app.get(`${prefix}/stream`, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' })
    const proxyReq = http.request({ hostname: BTOP_HOST, port: portNum, path: '/stream', method: 'GET' }, (proxyRes) => { proxyRes.pipe(res) })
    proxyReq.on('error', (err) => { console.error(`btop ${label} stream proxy error:`, err.message); res.end() })
    req.on('close', () => { proxyReq.destroy() })
    proxyReq.end()
  })
}

// luv (local node)
mountBtopProxy(app, '/api/btop-luv', isDev ? '4102' : '3102', 'luv')
// joi (remote node via SSH)
mountBtopProxy(app, '/api/btop-joi', isDev ? '4103' : '3103', 'joi')

// ============ GLOBAL ROUTES ============

// Global health check - returns status of all projects
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: isDev ? 'development' : 'production',
    projects: {
      'found-footy': '/api/found-footy/health',
      'spin-cycle': '/api/spin-cycle/health',
      'btop-luv': '/api/btop-luv/health',
      'btop-joi': '/api/btop-joi/health',
    }
  })
})

// ============ START SERVER ============

app.listen(PORT, () => {
  console.log(`🚀 vedanta-systems API server running on port ${PORT}`)
  console.log(`🌍 Environment: ${isDev ? 'development' : 'production'}`)
  console.log(`📍 Routes:`)
  console.log(`   /api/health - Global health check`)
  console.log(`   /api/found-footy/* - Found Footy endpoints`)
  console.log(`   /api/spin-cycle/* - Spin Cycle endpoints`)
  console.log(`   /api/btop-luv/* - System monitor (luv)`)
  console.log(`   /api/btop-joi/* - System monitor (joi)`)
})
