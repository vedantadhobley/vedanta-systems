import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import { Client as MinioClient } from 'minio'

const app = express()
app.use(cors())
app.use(express.json())

const MONGODB_URI = process.env.MONGODB_URI
const PORT = process.env.API_PORT || 3001

// MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000')
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY

// Validate required environment variables
if (!MONGODB_URI) throw new Error('MONGODB_URI environment variable is required')
if (!MINIO_ENDPOINT) throw new Error('MINIO_ENDPOINT environment variable is required')
if (!MINIO_ACCESS_KEY) throw new Error('MINIO_ACCESS_KEY environment variable is required')
if (!MINIO_SECRET_KEY) throw new Error('MINIO_SECRET_KEY environment variable is required')

const minioClient = new MinioClient({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
})

let mongoClient: MongoClient | null = null
let db: any = null

// Track connected SSE clients
const sseClients: Set<express.Response> = new Set()

async function connectMongo() {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI)
    await mongoClient.connect()
    db = mongoClient.db('found_footy')
    console.log('✅ Connected to MongoDB')
  }
  return db
}

// Helper to fetch all fixtures
async function fetchAllFixtures() {
  const database = await connectMongo()
  
  const activeFixtures = await database.collection('fixtures_active')
    .find({})
    .sort({ 'fixture.date': -1 })
    .toArray()
  
  const completedFixtures = await database.collection('fixtures_completed')
    .find({})
    .sort({ 'fixture.date': -1 })
    .limit(20)
    .toArray()
  
  return { active: activeFixtures, completed: completedFixtures }
}

// Broadcast to all SSE clients
function broadcastRefresh() {
  const message = `data: ${JSON.stringify({ type: 'refresh' })}\n\n`
  sseClients.forEach(client => {
    client.write(message)
  })
  console.log(`📡 Broadcasted refresh to ${sseClients.size} clients`)
}

// GET / - all fixtures
app.get('/', async (_req, res) => {
  try {
    const fixtures = await fetchAllFixtures()
    res.json(fixtures)
  } catch (error) {
    console.error('Error fetching fixtures:', error)
    res.status(500).json({ error: 'Failed to fetch fixtures' })
  }
})

// GET /stream - SSE for real-time updates
app.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  
  console.log('🔌 Client connected to SSE stream')
  sseClients.add(res)
  
  try {
    // Send initial data
    const fixtures = await fetchAllFixtures()
    res.write(`data: ${JSON.stringify({ 
      type: 'initial', 
      fixtures: fixtures.active, 
      completedFixtures: fixtures.completed 
    })}\n\n`)
    
    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
    }, 30000)
    
    // Cleanup on disconnect
    req.on('close', () => {
      console.log('🔌 Client disconnected')
      clearInterval(heartbeat)
      sseClients.delete(res)
    })
    
  } catch (error) {
    console.error('SSE stream error:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`)
    sseClients.delete(res)
  }
})

// POST /refresh - called by found-footy after monitor/download cycles
app.post('/refresh', (_req, res) => {
  console.log('🔄 Refresh triggered by found-footy')
  broadcastRefresh()
  res.json({ success: true, clientsNotified: sseClients.size })
})

// GET /video/:bucket/* - proxy videos from MinIO with authentication
app.get('/video/:bucket/*', async (req, res) => {
  try {
    const bucket = req.params.bucket
    const objectPath = req.params[0]
    
    console.log(`🎬 Proxying video: ${bucket}/${objectPath}`)
    
    // Get object stats first
    const stat = await minioClient.statObject(bucket, objectPath)
    const fileSize = stat.size
    
    // Set headers
    res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'video/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    
    // Handle range requests for video seeking
    const range = req.headers.range
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1
      
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      res.setHeader('Content-Length', chunkSize)
      
      // Stream partial content
      const stream = await minioClient.getPartialObject(bucket, objectPath, start, chunkSize)
      stream.pipe(res)
    } else {
      // Stream full file
      res.setHeader('Content-Length', fileSize)
      const stream = await minioClient.getObject(bucket, objectPath)
      stream.pipe(res)
    }
    
  } catch (error: any) {
    console.error('Video proxy error:', error.message)
    if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
      res.status(404).json({ error: 'Video not found' })
    } else {
      res.status(500).json({ error: 'Failed to proxy video' })
    }
  }
})

// GET /download/:bucket/* - download videos with Content-Disposition header (forces download on iOS/browsers)
app.get('/download/:bucket/*', async (req, res) => {
  try {
    const bucket = req.params.bucket
    const objectPath = req.params[0]
    
    console.log(`⬇️ Download video: ${bucket}/${objectPath}`)
    
    // Get object stats
    const stat = await minioClient.statObject(bucket, objectPath)
    
    // Extract filename from path
    const filename = objectPath.split('/').pop() || 'video.mp4'
    
    // Set headers to force download
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    
    // Stream the file
    const stream = await minioClient.getObject(bucket, objectPath)
    stream.pipe(res)
    
  } catch (error: any) {
    console.error('Download error:', error.message)
    if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
      res.status(404).json({ error: 'Video not found' })
    } else {
      res.status(500).json({ error: 'Failed to download video' })
    }
  }
})

// GET /health
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    connectedClients: sseClients.size,
    timestamp: new Date().toISOString() 
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Found Footy API server running on port ${PORT}`)
})
