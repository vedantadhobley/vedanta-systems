import express from 'express'
import cors from 'cors'

// Import project routes
import { createFoundFootyRouter } from './routes/found-footy'
import { createSpinCycleRouter } from './routes/spin-cycle'
import { createLongExposureRouter } from './routes/long-exposure'
import { createGitHubRouter } from './routes/github'
import { createBtopRouter } from './routes/btop'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.API_PORT || 3001
const isDev = process.env.NODE_ENV !== 'production'

// ============ PROJECT CONFIGURATION ============

// Found Footy configuration (from environment)
// Pattern B: vs-api proxies the found-footy Go read API (found-footy-{env}-api)
// and reshapes its DTOs into the legacy shape the frontend expects.
const foundFootyConfig = {
  apiUrl: process.env.FOUND_FOOTY_API_URL || '',
  natsUrl: process.env.NATS_URL || '',
  natsCredsPath: process.env.NATS_CREDS_FILE || '',
  // Scopes the NATS subscription to found-footy.<env>.> — one broker serves both envs.
  env: (isDev ? 'dev' : 'prod') as 'dev' | 'prod',
}

// Spin Cycle configuration (from environment)
const spinCycleConfig = {
  postgresUri: process.env.SPIN_CYCLE_POSTGRES_URI || '',
}

// Long Exposure configuration (from environment)
const longExposureConfig = {
  postgresUri: process.env.LONG_EXPOSURE_POSTGRES_URI || '',
}

// GitHub contribution calendar. The token stays in this API process; the
// browser receives only the public date/count/level projection.
const githubConfig = {
  token: process.env.GITHUB_TOKEN || '',
  username: 'vedantadhobley',
}

const btopConfig = {
  natsUrl: process.env.BTOP_NATS_URL || process.env.NATS_URL || '',
  natsCredsPath: process.env.BTOP_NATS_CREDS || process.env.NATS_CREDS_FILE || '',
  nodes: (process.env.BTOP_NODES || '')
    .split(',')
    .map((node) => node.trim())
    .filter(Boolean),
}

// Validate Found Footy config
if (!foundFootyConfig.apiUrl) {
  console.warn('⚠️  FOUND_FOOTY_API_URL not set — found-footy routes will return 502')
}

// Validate Spin Cycle config
if (!spinCycleConfig.postgresUri) {
  console.warn('⚠️  SPIN_CYCLE_POSTGRES_URI not set — spin-cycle routes will fail')
}

// Validate Long Exposure config
if (!longExposureConfig.postgresUri) {
  console.warn('⚠️  LONG_EXPOSURE_POSTGRES_URI not set — long-exposure routes will fail')
}

if (!githubConfig.token) {
  console.warn('⚠️  GITHUB_TOKEN not set — contribution graph route will return 503')
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

// Long Exposure - Daily IEX market-data narrative feed
// Endpoints: /api/long-exposure/health, /dates, /latest, /day/:date, /symbol/:symbol, /event/:id
// All read-only — no write/refresh/admin surface, so no public-endpoint blocks needed at nginx.
if (longExposureConfig.postgresUri) {
  const longExposureRouter = createLongExposureRouter(longExposureConfig)
  app.use('/api/long-exposure', longExposureRouter)
}

// GitHub contribution calendar — fixed user, read-only, cached server-side.
app.use('/api/github', createGitHubRouter(githubConfig))

// Multi-node btop. Node-local exporters expose private HTTP/SSE;
// owning control planes publish canonical full/delta frames to NATS. This
// bridge reconstructs each allowlisted node and fans it to browser SSE.
app.use('/api/btop', createBtopRouter(btopConfig))

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
      'github-contributions': '/api/github/contributions',
      'btop-luv': '/api/btop/luv/health',
      'btop-joi': '/api/btop/joi/health',
      'btop-nodes': '/api/btop/nodes',
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
  console.log(`   /api/github/contributions - Cached GitHub contribution calendar`)
  console.log(`   /api/btop/:node/* - NATS-backed multi-node system monitors`)
})
