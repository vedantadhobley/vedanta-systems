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

// Transform video URLs to be fully qualified API proxy URLs
// Done server-side so clients don't have to process this
function transformVideoUrl(url: string): string {
  if (url.startsWith('/video/')) {
    return `/api/found-footy${url}`
  }
  return url
}

function transformFixtureUrls(fixture: any): any {
  if (!fixture.events) return fixture
  return {
    ...fixture,
    events: fixture.events.map((event: any) => ({
      ...event,
      _s3_urls: event._s3_urls?.map(transformVideoUrl) || [],
      _s3_videos: event._s3_videos?.map((video: any) => ({
        ...video,
        url: transformVideoUrl(video.url)
      }))
    }))
  }
}

function transformFixtures(fixtures: any[]): any[] {
  return fixtures.map(transformFixtureUrls)
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
      mongoClient = new MongoClient(config.mongoUri, {
        maxPoolSize: 5,           // Limit pool size (default is 100)
        minPoolSize: 1,           // Keep at least 1 connection warm
        maxIdleTimeMS: 60000,     // Close idle connections after 60s
        serverSelectionTimeoutMS: 5000,  // Fail fast on connection issues
        heartbeatFrequencyMS: 30000,    // Reduce topology monitoring (default 10s)
      })
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

  // Broadcast lightweight refresh signal to all SSE clients
  // Client will refetch via REST API - keeps SSE payload tiny (~50 bytes)
  async function broadcastRefresh() {
    try {
      const message = `data: ${JSON.stringify({ 
        type: 'refresh',
        timestamp: Date.now()
      })}\n\n`
      sseClients.forEach(client => {
        client.write(message)
      })
      console.log(`[found-footy] Broadcast refresh to ${sseClients.size} clients`)
    } catch (err) {
      console.error('[found-footy] Failed to broadcast refresh:', err)
    }
  }

  // Helper to fetch all fixtures (with URLs pre-transformed for clients)
  async function fetchAllFixtures() {
    const database = await connectMongo()
    if (!database) return { staging: [], active: [], completed: [] }
    
    // Projection: only fetch fields we actually use on the client
    // This significantly reduces data transfer size
    const projection = {
      _id: 1,
      'fixture.id': 1,
      'fixture.date': 1,
      'fixture.status': 1,
      'league.name': 1,
      'league.country': 1,
      'league.round': 1,
      'teams.home.name': 1,
      'teams.home.winner': 1,
      'teams.away.name': 1,
      'teams.away.winner': 1,
      'goals.home': 1,
      'goals.away': 1,
      'score.penalty': 1,
      '_last_activity': 1,
      // Event fields - we need all of these for display
      'events._event_id': 1,
      'events.type': 1,
      'events.detail': 1,
      'events.time': 1,
      'events.player': 1,
      'events.assist': 1,
      'events._score_after': 1,
      'events._scoring_team': 1,
      'events._monitor_complete': 1,
      'events._download_complete': 1,
      'events._first_seen': 1,
      'events._s3_urls': 1,
      'events._s3_videos': 1,
    }
    
    // Staging: upcoming fixtures, sorted by kickoff time ascending (earliest first)
    const stagingFixtures = await database.collection('fixtures_staging')
      .find({}, { projection })
      .sort({ 'fixture.date': 1 })
      .toArray()
    
    // Active: live fixtures, sorted by last activity descending (most recent activity first)
    const activeFixtures = await database.collection('fixtures_active')
      .find({}, { projection })
      .sort({ '_last_activity': -1, 'fixture.date': -1 })
      .toArray()
    
    // Completed: finished fixtures, sorted by match date descending (most recent first)
    const completedFixtures = await database.collection('fixtures_completed')
      .find({}, { projection })
      .sort({ 'fixture.date': -1 })
      .toArray()
    
    // Transform video URLs server-side (so clients don't have to)
    return { 
      staging: stagingFixtures,  // No videos in staging
      active: transformFixtures(activeFixtures), 
      completed: transformFixtures(completedFixtures) 
    }
  }

  // Helper to get start/end of a day in UTC
  function getDayBounds(dateStr: string): { start: Date; end: Date } {
    const date = new Date(dateStr + 'T00:00:00Z')
    const start = new Date(date)
    const end = new Date(date)
    end.setUTCDate(end.getUTCDate() + 1)
    return { start, end }
  }

  // Helper to fetch fixtures for a specific date
  async function fetchFixturesForDate(dateStr: string) {
    const database = await connectMongo()
    if (!database) return { staging: [], active: [], completed: [] }
    
    const { start, end } = getDayBounds(dateStr)
    const dateFilter = {
      'fixture.date': { $gte: start.toISOString(), $lt: end.toISOString() }
    }
    
    // Projection: only fetch fields we actually use on the client
    const projection = {
      _id: 1,
      'fixture.id': 1,
      'fixture.date': 1,
      'fixture.status': 1,
      'league.name': 1,
      'league.country': 1,
      'league.round': 1,
      'teams.home.name': 1,
      'teams.home.winner': 1,
      'teams.away.name': 1,
      'teams.away.winner': 1,
      'goals.home': 1,
      'goals.away': 1,
      'score.penalty': 1,
      '_last_activity': 1,
      'events._event_id': 1,
      'events.type': 1,
      'events.detail': 1,
      'events.time': 1,
      'events.team': 1,
      'events.player': 1,
      'events.assist': 1,
      'events._scoring_team': 1,
      'events._score_after': 1,
      'events._monitor_complete': 1,
      'events._download_complete': 1,
      'events._first_seen': 1,
      'events._s3_urls': 1,
      'events._s3_videos': 1,
    }
    
    // Staging: upcoming fixtures for this date
    const stagingFixtures = await database.collection('fixtures_staging')
      .find(dateFilter, { projection })
      .sort({ 'fixture.date': 1 })
      .toArray()
    
    // Active: live fixtures for this date
    const activeFixtures = await database.collection('fixtures_active')
      .find(dateFilter, { projection })
      .sort({ '_last_activity': -1, 'fixture.date': -1 })
      .toArray()
    
    // Completed: finished fixtures for this date
    const completedFixtures = await database.collection('fixtures_completed')
      .find(dateFilter, { projection })
      .sort({ 'fixture.date': -1 })
      .toArray()
    
    return { 
      staging: stagingFixtures,
      active: transformFixtures(activeFixtures), 
      completed: transformFixtures(completedFixtures),
      date: dateStr
    }
  }

  // Helper to get list of dates that have completed fixtures (for calendar navigation)
  async function getAvailableDates(): Promise<string[]> {
    const database = await connectMongo()
    if (!database) return []
    
    // Get distinct dates from completed fixtures
    const completedDates = await database.collection('fixtures_completed')
      .aggregate([
        { $project: { date: { $substr: ['$fixture.date', 0, 10] } } },
        { $group: { _id: '$date' } },
        { $sort: { _id: -1 } },
        { $limit: 90 } // Last 90 days max
      ])
      .toArray()
    
    // Get distinct dates from active fixtures  
    const activeDates = await database.collection('fixtures_active')
      .aggregate([
        { $project: { date: { $substr: ['$fixture.date', 0, 10] } } },
        { $group: { _id: '$date' } }
      ])
      .toArray()
    
    // Get distinct dates from staging fixtures
    const stagingDates = await database.collection('fixtures_staging')
      .aggregate([
        { $project: { date: { $substr: ['$fixture.date', 0, 10] } } },
        { $group: { _id: '$date' } }
      ])
      .toArray()
    
    // Combine and dedupe
    const allDates = new Set([
      ...completedDates.map(d => d._id),
      ...activeDates.map(d => d._id),
      ...stagingDates.map(d => d._id)
    ])
    
    return Array.from(allDates).sort().reverse()
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

  // GET /dates - list of dates with fixtures (for calendar navigation)
  router.get('/dates', async (_req: Request, res: Response) => {
    try {
      const dates = await getAvailableDates()
      res.json({ dates })
    } catch (error) {
      console.error('[found-footy] Error fetching dates:', error)
      res.status(500).json({ error: 'Failed to fetch dates' })
    }
  })

  // GET /event/:eventId - look up which date an event belongs to (for shared links)
  router.get('/event/:eventId', async (req: Request, res: Response) => {
    try {
      const eventId = req.params.eventId
      const database = await connectMongo()
      if (!database) {
        return res.status(503).json({ error: 'Database unavailable' })
      }

      // Search all collections for the event
      const collections = ['fixtures_staging', 'fixtures_active', 'fixtures_completed']
      
      for (const collectionName of collections) {
        const fixture = await database.collection(collectionName).findOne(
          { 'events._event_id': eventId },
          { projection: { 'fixture.date': 1 } }
        )
        
        if (fixture?.fixture?.date) {
          const date = fixture.fixture.date.substring(0, 10) // YYYY-MM-DD
          return res.json({ eventId, date, found: true })
        }
      }
      
      // Event not found
      res.json({ eventId, found: false })
    } catch (error) {
      console.error('[found-footy] Error looking up event:', error)
      res.status(500).json({ error: 'Failed to look up event' })
    }
  })

  // GET /search?q=<query> - search across all completed fixtures by team/player/assister
  // Returns fixtures grouped by date, with IDs of matching events
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string || '').trim()
      if (!query || query.length < 2) {
        return res.json({ results: [], query })
      }

      const database = await connectMongo()
      if (!database) {
        return res.status(503).json({ error: 'Database unavailable' })
      }

      // Escape regex special chars
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = { $regex: escaped, $options: 'i' }

      // Search all fixture collections: match team names, player names, or assist names
      const searchFilter = {
        $or: [
          { 'teams.home.name': regex },
          { 'teams.away.name': regex },
          { 'events.player.name': regex },
          { 'events.assist.name': regex },
        ]
      }

      // Staging only matches on team names (no events yet)
      const stagingFilter = {
        $or: [
          { 'teams.home.name': regex },
          { 'teams.away.name': regex },
        ]
      }

      const projection = {
        _id: 1,
        'fixture.id': 1,
        'fixture.date': 1,
        'fixture.status': 1,
        'league.name': 1,
        'league.country': 1,
        'league.round': 1,
        'teams.home.name': 1,
        'teams.home.winner': 1,
        'teams.away.name': 1,
        'teams.away.winner': 1,
        'goals.home': 1,
        'goals.away': 1,
        'score.penalty': 1,
        '_last_activity': 1,
        'events._event_id': 1,
        'events.type': 1,
        'events.detail': 1,
        'events.time': 1,
        'events.team': 1,
        'events.player': 1,
        'events.assist': 1,
        'events._scoring_team': 1,
        'events._score_after': 1,
        'events._monitor_complete': 1,
        'events._download_complete': 1,
        'events._first_seen': 1,
        'events._s3_urls': 1,
        'events._s3_videos': 1,
      }

      // Search all 3 collections in parallel
      const [completedFixtures, activeFixtures, stagingFixtures] = await Promise.all([
        database.collection('fixtures_completed')
          .find(searchFilter, { projection })
          .sort({ 'fixture.date': -1 })
          .limit(100)
          .toArray(),
        database.collection('fixtures_active')
          .find(searchFilter, { projection })
          .sort({ 'fixture.date': -1 })
          .limit(50)
          .toArray(),
        database.collection('fixtures_staging')
          .find(stagingFilter, { projection })
          .sort({ 'fixture.date': 1 })
          .limit(50)
          .toArray(),
      ])

      // Merge and dedupe by _id
      const seen = new Set<string>()
      const fixtures: any[] = []
      for (const f of [...stagingFixtures, ...activeFixtures, ...completedFixtures]) {
        const id = String(f._id)
        if (!seen.has(id)) {
          seen.add(id)
          fixtures.push(f)
        }
      }

      // Sort all by date descending
      fixtures.sort((a: any, b: any) => {
        const da = a.fixture?.date || ''
        const db = b.fixture?.date || ''
        return db.localeCompare(da)
      })

      // For each fixture, determine which events matched the query
      const re = new RegExp(escaped, 'i')
      const resultsWithMatches = transformFixtures(fixtures).map((fixture: any) => {
        const matchedEventIds: string[] = []
        const teamMatch = re.test(fixture.teams?.home?.name || '') || re.test(fixture.teams?.away?.name || '')

        if (fixture.events) {
          for (const event of fixture.events) {
            if (
              re.test(event.player?.name || '') ||
              re.test(event.assist?.name || '')
            ) {
              matchedEventIds.push(event._event_id)
            }
          }
        }

        return {
          ...fixture,
          _search: {
            teamMatch,
            matchedEventIds,
            matchCount: teamMatch ? fixture.events?.length || 0 : matchedEventIds.length,
          }
        }
      })

      // Group by date
      const grouped: Record<string, any[]> = {}
      for (const fixture of resultsWithMatches) {
        const date = fixture.fixture?.date?.substring(0, 10) || 'unknown'
        if (!grouped[date]) grouped[date] = []
        grouped[date].push(fixture)
      }

      // Convert to sorted array of { date, fixtures }
      const results = Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a)) // most recent first
        .map(([date, fixtures]) => ({ date, fixtures }))

      res.json({ results, query, totalFixtures: fixtures.length })
    } catch (error) {
      console.error('[found-footy] Search error:', error)
      res.status(500).json({ error: 'Search failed' })
    }
  })

  // GET /fixtures - fixtures, optionally filtered by date
  // Query params:
  //   ?date=2026-01-25  - get fixtures for specific date only
  //   (no date param)   - get ALL fixtures (legacy behavior, avoid on mobile)
  router.get('/fixtures', async (req: Request, res: Response) => {
    try {
      const dateParam = req.query.date as string | undefined
      
      if (dateParam) {
        // Date-filtered request (new, efficient)
        const fixtures = await fetchFixturesForDate(dateParam)
        res.json(fixtures)
      } else {
        // Legacy: fetch all (kept for backwards compat, but heavy)
        const fixtures = await fetchAllFixtures()
        res.json(fixtures)
      }
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
    
    sseClients.add(res)
    
    try {
      // Send lightweight connected signal - client already has data from REST API
      res.write(`data: ${JSON.stringify({ 
        type: 'connected',
        timestamp: Date.now()
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
      
      // Get object stats first
      const stat = await minioClient.statObject(bucket, objectPath)
      const fileSize = stat.size
      
      // Set headers for optimal video streaming
      res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'video/mp4')
      res.setHeader('Accept-Ranges', 'bytes')
      // Cache video chunks for 1 day (immutable content)
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
      // Keep connection alive for streaming
      res.setHeader('Connection', 'keep-alive')
      // CORS for video playback
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Range')
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
      
      // Handle range requests for video seeking
      const range = req.headers.range
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        // For better streaming, use larger chunks (2MB) when end not specified
        const requestedEnd = parts[1] ? parseInt(parts[1], 10) : null
        const end = requestedEnd !== null ? requestedEnd : Math.min(start + 2 * 1024 * 1024, fileSize - 1)
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
