import { Router, Response, Request } from 'express'
import { Pool } from 'pg'

export interface SpinCycleConfig {
  postgresUri: string
}

export function createSpinCycleRouter(config: SpinCycleConfig): Router {
  const router = Router()

  // PostgreSQL connection pool
  const pool = new Pool({
    connectionString: config.postgresUri,
    max: 5,
    min: 1,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
  })

  pool.on('error', (err) => {
    console.error('[spin-cycle] Unexpected pool error:', err)
  })

  // Track connected SSE clients
  const sseClients: Set<Response> = new Set()

  // Track backend health
  let backendHealth = {
    postgres: { status: 'unknown' as 'up' | 'down' | 'unknown', lastCheck: null as Date | null },
    overall: 'unknown' as 'healthy' | 'unhealthy' | 'unknown'
  }

  // Check backend health
  async function checkBackendHealth() {
    const now = new Date()
    const health = {
      postgres: { status: 'down' as 'up' | 'down', lastCheck: now },
      overall: 'unhealthy' as 'healthy' | 'unhealthy'
    }

    try {
      const client = await pool.connect()
      await client.query('SELECT 1')
      client.release()
      health.postgres.status = 'up'
      health.overall = 'healthy'
    } catch (err) {
      console.error('[spin-cycle] PostgreSQL health check failed:', err)
    }

    backendHealth = health
    return health
  }

  // Broadcast health to all SSE clients
  function broadcastHealth(health: typeof backendHealth) {
    const message = `data: ${JSON.stringify({ type: 'health', health })}\n\n`
    sseClients.forEach(client => {
      try { client.write(message) } catch (err) {
        console.error('[spin-cycle] Failed to send health to client:', err)
      }
    })
  }

  // Broadcast refresh signal to all SSE clients
  function broadcastRefresh() {
    const message = `data: ${JSON.stringify({ type: 'refresh', timestamp: Date.now() })}\n\n`
    sseClients.forEach(client => {
      try { client.write(message) } catch (err) {
        console.error('[spin-cycle] Failed to broadcast refresh:', err)
      }
    })
    console.log(`[spin-cycle] Broadcast refresh to ${sseClients.size} clients`)
  }

  // ============ ROUTES ============

  // GET /health
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: backendHealth.overall === 'healthy' ? 'ok' : 'degraded',
      health: backendHealth,
      connectedClients: sseClients.size,
      timestamp: new Date().toISOString()
    })
  })

  // GET /transcripts - all transcripts with their claims and verdict statuses
  router.get('/transcripts', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      // Fetch all transcripts
      const transcriptsResult = await pool.query(`
        SELECT
          t.id, t.url, t.title, t.date, t.speakers, t.enriched_speakers,
          t.word_count, t.segment_count, t.display_text, t.status,
          t.description, t.created_at,
          COUNT(tc.id) FILTER (WHERE tc.worth_checking = true) AS total_claims,
          COUNT(tc.claim_id) FILTER (WHERE tc.worth_checking = true AND tc.claim_id IS NOT NULL) AS verified_claims
        FROM transcripts t
        LEFT JOIN transcript_claims tc ON tc.transcript_id = t.id
        GROUP BY t.id
        ORDER BY t.date DESC NULLS LAST, t.created_at DESC
      `)

      if (transcriptsResult.rows.length === 0) {
        return res.json({ transcripts: [] })
      }

      const transcriptIds = transcriptsResult.rows.map(t => t.id)

      // Fetch all claims for these transcripts in one query
      const claimsResult = await pool.query(`
        SELECT
          tc.id, tc.transcript_id, tc.claim_id, tc.claim_text, tc.original_quote,
          tc.speaker, tc.worth_checking, tc.classification, tc.topic,
          tc.checkable, tc.is_duplicate, tc.factual_anchor,
          tc.created_at AS tc_created_at,
          c.status AS claim_status,
          v.verdict, v.confidence, v.reasoning
        FROM transcript_claims tc
        LEFT JOIN claims c ON tc.claim_id = c.id
        LEFT JOIN verdicts v ON c.id = v.claim_id
        WHERE tc.transcript_id = ANY($1)
        ORDER BY tc.created_at ASC
      `, [transcriptIds])

      // Group claims by transcript_id
      const claimsByTranscript = new Map<string, any[]>()
      for (const claim of claimsResult.rows) {
        const tid = claim.transcript_id
        if (!claimsByTranscript.has(tid)) {
          claimsByTranscript.set(tid, [])
        }
        claimsByTranscript.get(tid)!.push({
          id: claim.id,
          transcript_id: claim.transcript_id,
          claim_id: claim.claim_id,
          claim_text: claim.claim_text,
          original_quote: claim.original_quote,
          speaker: claim.speaker,
          worth_checking: claim.worth_checking,
          classification: claim.classification,
          topic: claim.topic,
          checkable: claim.checkable,
          is_duplicate: claim.is_duplicate,
          factual_anchor: claim.factual_anchor,
          claim_status: claim.claim_status,
          verdict: claim.verdict,
          confidence: claim.confidence,
          reasoning: claim.reasoning,
        })
      }

      // Assemble response
      const transcripts = transcriptsResult.rows.map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        date: t.date,
        speakers: t.enriched_speakers || t.speakers,
        word_count: t.word_count,
        segment_count: t.segment_count,
        display_text: t.display_text,
        status: t.status,
        description: t.description,
        created_at: t.created_at,
        total_claims: parseInt(t.total_claims) || 0,
        verified_claims: parseInt(t.verified_claims) || 0,
        claims: claimsByTranscript.get(t.id) || [],
      }))

      // Sort: date descending, then claim count descending within same date
      transcripts.sort((a, b) => {
        const dateA = a.date || ''
        const dateB = b.date || ''
        if (dateA !== dateB) return dateB.localeCompare(dateA)
        return b.total_claims - a.total_claims
      })

      res.json({ transcripts })
    } catch (error) {
      console.error('[spin-cycle] Error fetching transcripts:', error)
      res.status(500).json({ error: 'Failed to fetch transcripts' })
    }
  })

  // GET /claims/:id - full claim with verdict tree (sub-claims + evidence)
  router.get('/claims/:claimId', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const { claimId } = req.params

      // Fetch claim with verdict
      const claimResult = await pool.query(`
        SELECT
          c.id, c.text, c.status, c.speaker, c.speaker_description,
          c.normalized_claim, c.thesis, c.key_test,
          c.claim_date, c.transcript_title, c.supporting_quotes,
          v.verdict, v.confidence, v.reasoning, v.citations
        FROM claims c
        LEFT JOIN verdicts v ON c.id = v.claim_id
        WHERE c.id = $1
      `, [claimId])

      if (claimResult.rows.length === 0) {
        return res.status(404).json({ error: 'Claim not found' })
      }

      const claim = claimResult.rows[0]

      // Fetch sub-claims with evidence
      const subClaimsResult = await pool.query(`
        SELECT
          sc.id, sc.parent_id, sc.is_leaf, sc.text,
          sc.verdict, sc.confidence, sc.reasoning
        FROM sub_claims sc
        WHERE sc.claim_id = $1
      `, [claimId])

      // Fetch evidence for all sub-claims
      const subClaimIds = subClaimsResult.rows.map(sc => sc.id)
      let evidenceBySubClaim = new Map<string, any[]>()

      if (subClaimIds.length > 0) {
        const evidenceResult = await pool.query(`
          SELECT
            e.sub_claim_id, e.judge_index, e.source_url AS url, e.title,
            e.domain, e.source_type, e.bias, e.factual, e.tier,
            e.assessment, e.is_independent, e.key_point
          FROM evidence e
          WHERE e.sub_claim_id = ANY($1)
          ORDER BY e.judge_index ASC NULLS LAST
        `, [subClaimIds])

        for (const e of evidenceResult.rows) {
          const sid = e.sub_claim_id
          if (!evidenceBySubClaim.has(sid)) {
            evidenceBySubClaim.set(sid, [])
          }
          evidenceBySubClaim.get(sid)!.push({
            judge_index: e.judge_index,
            url: e.url,
            title: e.title,
            domain: e.domain,
            source_type: e.source_type || 'web',
            bias: e.bias,
            factual: e.factual,
            tier: e.tier,
            assessment: e.assessment,
            is_independent: e.is_independent,
            key_point: e.key_point,
          })
        }
      }

      // Build sub-claim tree (flat → nested)
      const byId = new Map<string, any>()
      const roots: any[] = []

      for (const sc of subClaimsResult.rows) {
        const node = {
          id: sc.id,
          text: sc.text,
          is_leaf: sc.is_leaf,
          verdict: sc.verdict,
          confidence: sc.confidence,
          reasoning: sc.reasoning,
          evidence: evidenceBySubClaim.get(sc.id) || [],
          children: [],
        }
        byId.set(sc.id, { node, parent_id: sc.parent_id })
      }

      for (const [_id, { node, parent_id }] of byId) {
        if (!parent_id) {
          roots.push(node)
        } else if (byId.has(parent_id)) {
          byId.get(parent_id).node.children.push(node)
        }
      }

      res.json({
        id: claim.id,
        text: claim.text,
        status: claim.status,
        speaker: claim.speaker,
        speaker_description: claim.speaker_description,
        normalized_claim: claim.normalized_claim,
        thesis: claim.thesis,
        key_test: claim.key_test,
        claim_date: claim.claim_date,
        supporting_quotes: claim.supporting_quotes,
        verdict: claim.verdict,
        confidence: claim.confidence,
        reasoning: claim.reasoning,
        citations: claim.citations,
        sub_claims: roots,
      })
    } catch (error) {
      console.error('[spin-cycle] Error fetching claim:', error)
      res.status(500).json({ error: 'Failed to fetch claim' })
    }
  })

  // GET /stream - SSE for real-time updates
  router.get('/stream', async (req: Request, res: Response) => {
    req.socket.setTimeout(0)
    req.socket.setNoDelay(true)
    req.socket.setKeepAlive(true)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    sseClients.add(res)

    try {
      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)

      const initialHealth = await checkBackendHealth()
      res.write(`data: ${JSON.stringify({ type: 'health', health: initialHealth })}\n\n`)

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
      }, 30000)

      req.on('close', () => {
        clearInterval(heartbeat)
        sseClients.delete(res)
      })
    } catch (error) {
      console.error('[spin-cycle] SSE stream error:', error)
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`)
      sseClients.delete(res)
    }
  })

  // POST /refresh - called by spin-cycle backend after verification completes
  router.post('/refresh', async (_req: Request, res: Response) => {
    broadcastRefresh()
    res.json({ success: true, clientsNotified: sseClients.size })
  })

  // ============ INITIALIZATION ============

  // Periodic health checks (every 15 seconds)
  setInterval(async () => {
    const health = await checkBackendHealth()
    broadcastHealth(health)
  }, 15000)

  // Initial health check
  checkBackendHealth().then(health => {
    console.log('✅ [spin-cycle] Initial health check:', JSON.stringify(health, null, 2))
  })

  return router
}
