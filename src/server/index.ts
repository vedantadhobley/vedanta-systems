import express from 'express'
import cors from 'cors'
import http from 'http'

// Import project routes
import { createFoundFootyRouter } from './routes/found-footy'

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

// ============ MOUNT PROJECT ROUTES ============

// Found Footy - Goal clip aggregator
// Endpoints: /api/found-footy/health, /api/found-footy/fixtures, /api/found-footy/stream, etc.
const foundFootyRouter = createFoundFootyRouter(foundFootyConfig)
app.use('/api/found-footy', foundFootyRouter)

// ============ BTOP PROXY ============
// Proxy btop frame requests to btop container
// This avoids SSE and goes through the standard API proxy
const BTOP_HOST = process.env.BTOP_HOST || 'host.docker.internal'
const BTOP_PORT = isDev ? '4102' : '3102'

app.get('/api/btop/frame.png', (req, res) => {
  const options = {
    hostname: BTOP_HOST,
    port: parseInt(BTOP_PORT),
    path: '/frame.png',
    method: 'GET',
    timeout: 5000,
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200)
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('btop proxy error:', err.message)
    res.status(503).json({ error: 'btop unavailable' })
  })

  proxyReq.on('timeout', () => {
    proxyReq.destroy()
    res.status(504).json({ error: 'btop timeout' })
  })

  proxyReq.end()
})

app.get('/api/btop/health', (_req, res) => {
  const options = {
    hostname: BTOP_HOST,
    port: parseInt(BTOP_PORT),
    path: '/health',
    method: 'GET',
    timeout: 2000,
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200)
    res.set('Content-Type', 'text/plain')
    proxyRes.pipe(res)
  })

  proxyReq.on('error', () => {
    res.status(503).json({ error: 'btop unavailable' })
  })

  proxyReq.end()
})

// Proxy btop viewer HTML
app.get('/api/btop/', (req, res) => {
  const options = {
    hostname: BTOP_HOST,
    port: parseInt(BTOP_PORT),
    path: '/',
    method: 'GET',
    timeout: 5000,
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 200)
    res.set('Content-Type', 'text/html')
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('btop viewer proxy error:', err.message)
    res.status(503).send('<html><body style="background:#000;color:#c9a0f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">system monitor unavailable</body></html>')
  })

  proxyReq.end()
})

// Proxy btop SSE stream
app.get('/api/btop/stream', (req, res) => {
  const options = {
    hostname: BTOP_HOST,
    port: parseInt(BTOP_PORT),
    path: '/stream',
    method: 'GET',
  }

  // Set SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // Disable nginx buffering
  })

  const proxyReq = http.request(options, (proxyRes) => {
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('btop stream proxy error:', err.message)
    res.end()
  })

  // Clean up on client disconnect
  req.on('close', () => {
    proxyReq.destroy()
  })

  proxyReq.end()
})

// ============ GLOBAL ROUTES ============

// Global health check - returns status of all projects
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: isDev ? 'development' : 'production',
    projects: {
      'found-footy': '/api/found-footy/health',
      'btop': '/api/btop/health',
      // Add more projects here as they're added:
      // 'legal-tender': '/api/legal-tender/health',
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
  console.log(`   /api/btop/frame.png - System monitor frame`)
})
