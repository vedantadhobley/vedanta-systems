import { Router, Response, Request } from 'express'
import { MongoClient, Db } from 'mongodb'
import { Client as MinioClient } from 'minio'

// Configuration interface for Found Footy routes
export interface FoundFootyConfig {
  mongoUri: string
  minio: {
    endpoint: string
    port: number
    accessKey: string
    secretKey: string
    useSSL: boolean
  }
  temporal?: {
    address: string
  }
  twitter?: {
    apiKey: string
  }
}

// Factory function to create Found Footy router with configuration
export function createFoundFootyRouter(config: FoundFootyConfig): Router {
  const router = Router()
  
  // Check if properly configured
  const isConfigured = !!(config.mongoUri && config.minio.endpoint && config.minio.accessKey && config.minio.secretKey)
  
  // MinIO client
  const minioClient = isConfigured ? new MinioClient({
    endPoint: config.minio.endpoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey
  }) : null

  // MongoDB connection
  let mongoClient: MongoClient | null = null
  let db: Db | null = null

  // Track connected SSE clients
  const sseClients: Set<Response> = new Set()

  // Track backend health status
  let backendHealth = {
    mongo: { status: 'unknown' as 'up' | 'down' | 'unknown', lastCheck: null as Date | null },
    s3: { status: 'unknown' as 'up' | 'down' | 'unknown', lastCheck: null as Date | null },
    temporal: { status: 'unknown' as 'up' | 'down' | 'unknown', lastCheck: null as Date | null },
    twitter: { status: 'unknown' as 'up' | 'down' | 'unknown', lastCheck: null as Date | null },
    overall: 'unknown' as 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  }

  async function connectMongo(): Promise<Db | null> {
    if (!isConfigured || !config.mongoUri) return null
    
    if (!mongoClient) {
      mongoClient = new MongoClient(config.mongoUri)
      await mongoClient.connect()
      db = mongoClient.db('found_footy')
      console.log('✅ [found-footy] Connected to MongoDB')
    }
    return db
  }

  // Check backend services health
  async function checkBackendHealth() {
    const now = new Date()
    const health = {
      mongo: { status: 'down' as 'up' | 'down', lastCheck: now },
      s3: { status: 'down' as 'up' | 'down', lastCheck: now },
      temporal: { status: 'down' as 'up' | 'down', lastCheck: now },
      twitter: { status: 'down' as 'up' | 'down', lastCheck: now },
      overall: 'unhealthy' as 'healthy' | 'degraded' | 'unhealthy'
    }

    if (!isConfigured) {
      backendHealth = health
      return health
    }

    // Check MongoDB
    try {
      const database = await connectMongo()
      if (database) {
        await database.admin().ping()
        health.mongo.status = 'up'
      }
    } catch (err) {
      console.error('[found-footy] MongoDB health check failed:', err)
    }

    // Check MinIO (S3)
    try {
      if (minioClient) {
        await minioClient.listBuckets()
        health.s3.status = 'up'
      }
    } catch (err) {
      console.error('[found-footy] MinIO health check failed:', err)
    }

    // Check Temporal - TODO: Implement actual Temporal health check
    if (config.temporal?.address) {
      // Placeholder - would use Temporal client to check connection
      // For now, mark as down since we can't actually check
      health.temporal.status = 'down'
    }

    // Check Twitter API - TODO: Implement actual Twitter API health check  
    if (config.twitter?.apiKey) {
      // Placeholder - would make a lightweight API call to verify credentials
      health.twitter.status = 'down'
    }

    // Determine overall health (mongo and s3 are critical, temporal and twitter are optional)
    const criticalUp = health.mongo.status === 'up' && health.s3.status === 'up'
    const criticalDown = health.mongo.status === 'down' && health.s3.status === 'down'
    
    if (criticalUp) {
      health.overall = 'healthy'
    } else if (criticalDown) {
      health.overall = 'unhealthy'
    } else {
      health.overall = 'degraded'
    }

    backendHealth = health
    return health
  }

  // Broadcast health status to all SSE clients
  function broadcastHealth(health: typeof backendHealth) {
    const message = `data: ${JSON.stringify({ type: 'health', health })}\n\n`
    sseClients.forEach(client => {
      try {
        client.write(message)
      } catch (err) {
        console.error('[found-footy] Failed to send health to client:', err)
      }
    })
  }

  // Broadcast refresh with updated fixture data to all SSE clients
  async function broadcastRefresh() {
    try {
      const fixtures = await fetchAllFixtures()
      const message = `data: ${JSON.stringify({ 
        type: 'refresh', 
        stagingFixtures: fixtures.staging,
        fixtures: fixtures.active, 
        completedFixtures: fixtures.completed 
      })}\n\n`
      sseClients.forEach(client => {
        client.write(message)
      })
      console.log(`📡 [found-footy] Broadcasted refresh with ${fixtures.staging.length} staging, ${fixtures.active.length} active, ${fixtures.completed.length} completed fixtures to ${sseClients.size} clients`)
    } catch (err) {
      console.error('[found-footy] Failed to broadcast refresh:', err)
    }
  }

  // Helper to fetch all fixtures
  async function fetchAllFixtures() {
    const database = await connectMongo()
    if (!database) return { staging: [], active: [], completed: [] }
    
    // Staging: upcoming fixtures, sorted by kickoff time ascending (earliest first)
    const stagingFixtures = await database.collection('fixtures_staging')
      .find({})
      .sort({ 'fixture.date': 1 })
      .toArray()
    
    // Active: live fixtures, sorted by last activity descending (most recent activity first)
    const activeFixtures = await database.collection('fixtures_active')
      .find({})
      .sort({ '_last_activity': -1, 'fixture.date': -1 })
      .toArray()
    
    // Completed: finished fixtures, sorted by match date descending (most recent first)
    const completedFixtures = await database.collection('fixtures_completed')
      .find({})
      .sort({ 'fixture.date': -1 })
      .toArray()
    
    return { staging: stagingFixtures, active: activeFixtures, completed: completedFixtures }
  }

  // ============ ROUTES ============

  // GET /health - returns current backend health status
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: backendHealth.overall === 'healthy' ? 'ok' : 'degraded',
      health: backendHealth,
      connectedClients: sseClients.size,
      timestamp: new Date().toISOString() 
    })
  })

  // GET /fixtures - all fixtures
  router.get('/fixtures', async (_req: Request, res: Response) => {
    try {
      const fixtures = await fetchAllFixtures()
      res.json(fixtures)
    } catch (error) {
      console.error('[found-footy] Error fetching fixtures:', error)
      res.status(500).json({ error: 'Failed to fetch fixtures' })
    }
  })

  // GET /stream - SSE for real-time updates
  router.get('/stream', async (req: Request, res: Response) => {
    // Disable socket timeout for SSE
    req.socket.setTimeout(0)
    req.socket.setNoDelay(true)
    req.socket.setKeepAlive(true)
    
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
    res.flushHeaders() // Flush headers immediately
    
    console.log('🔌 [found-footy] Client connected to SSE stream')
    sseClients.add(res)
    
    try {
      // Send initial data
      const fixtures = await fetchAllFixtures()
      res.write(`data: ${JSON.stringify({ 
        type: 'initial', 
        stagingFixtures: fixtures.staging,
        fixtures: fixtures.active, 
        completedFixtures: fixtures.completed 
      })}\n\n`)
      
      // Send initial health status
      const initialHealth = await checkBackendHealth()
      res.write(`data: ${JSON.stringify({ type: 'health', health: initialHealth })}\n\n`)

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
      }, 30000)
      
      // Cleanup on disconnect
      req.on('close', () => {
        console.log('🔌 [found-footy] Client disconnected')
        clearInterval(heartbeat)
        sseClients.delete(res)
      })
      
    } catch (error) {
      console.error('[found-footy] SSE stream error:', error)
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`)
      sseClients.delete(res)
    }
  })

  // POST /refresh - called by found-footy backend after monitor/download cycles
  router.post('/refresh', async (_req: Request, res: Response) => {
    console.log('🔄 [found-footy] Refresh triggered')
    await broadcastRefresh()
    res.json({ success: true, clientsNotified: sseClients.size })
  })

  // GET /video/:bucket/* - proxy videos from MinIO with authentication
  router.get('/video/:bucket/*', async (req: Request, res: Response) => {
    if (!minioClient) {
      return res.status(503).json({ error: 'MinIO not configured' })
    }
    
    try {
      const bucket = req.params.bucket
      const objectPath = req.params[0]
      
      console.log(`🎬 [found-footy] Proxying video: ${bucket}/${objectPath}`)
      
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
      console.error('[found-footy] Video proxy error:', error.message)
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        res.status(404).json({ error: 'Video not found' })
      } else {
        res.status(500).json({ error: 'Failed to stream video' })
      }
    }
  })

  // GET /download/:bucket/* - download videos with Content-Disposition: attachment
  router.get('/download/:bucket/*', async (req: Request, res: Response) => {
    if (!minioClient) {
      return res.status(503).json({ error: 'MinIO not configured' })
    }
    
    try {
      const bucket = req.params.bucket
      const objectPath = req.params[0]
      const filename = objectPath.split('/').pop() || 'video.mp4'
      
      console.log(`📥 [found-footy] Download request: ${bucket}/${objectPath}`)
      
      // Get object stats
      const stat = await minioClient.statObject(bucket, objectPath)
      
      // Set download headers
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Content-Length', stat.size)
      
      // Stream the file
      const stream = await minioClient.getObject(bucket, objectPath)
      stream.pipe(res)
      
    } catch (error: any) {
      console.error('[found-footy] Download error:', error.message)
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
        res.status(404).json({ error: 'Video not found' })
      } else {
        res.status(500).json({ error: 'Failed to download video' })
      }
    }
  })

  // ============ INITIALIZATION ============

  // Start periodic health checks (every 15 seconds)
  if (isConfigured) {
    setInterval(async () => {
      const health = await checkBackendHealth()
      broadcastHealth(health)
    }, 15000)

    // Initial health check
    checkBackendHealth().then(health => {
      console.log('✅ [found-footy] Initial health check:', JSON.stringify(health, null, 2))
    })
  }

  return router
}
