import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'

const app = express()
app.use(cors())
app.use(express.json())

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://ffuser:ffpass@found-footy-dev-mongo:27017/found_footy?authSource=admin'
const PORT = process.env.API_PORT || 3001

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
