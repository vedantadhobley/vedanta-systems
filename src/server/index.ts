import express from 'express'
import cors from 'cors'

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
    useSSL: !isDev // Use SSL in production
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

// ============ GLOBAL ROUTES ============

// Global health check - returns status of all projects
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: isDev ? 'development' : 'production',
    projects: {
      'found-footy': '/api/found-footy/health',
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
})
