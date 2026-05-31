import { Router, Response, Request } from 'express'
import { Pool } from 'pg'

export interface LongExposureConfig {
  postgresUri: string
}

/**
 * Read-only Long Exposure API. Surfaces narrated IEX market events
 * to the vedanta.systems frontend. Backed by long-exposure's Postgres
 * (the same DB the worker writes to).
 *
 * SECURITY: All endpoints are read-only. There is no write/refresh/
 * broadcast/admin surface — narration is produced by the Temporal
 * pipeline on long-exposure's worker, never by an API call. So
 * there are no endpoints that need to be 404'd at nginx; the public
 * /api/long-exposure/* surface is safe by construction.
 */
export function createLongExposureRouter(config: LongExposureConfig): Router {
  const router = Router()

  const pool = new Pool({
    connectionString: config.postgresUri,
    max: 5,
    min: 1,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
  })

  pool.on('error', (err) => {
    console.error('[long-exposure] Unexpected pool error:', err)
  })

  // ============ HEALTH ============

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const client = await pool.connect()
      try {
        await client.query('SELECT 1')
        const counts = await client.query(`
          SELECT
            (SELECT COUNT(*) FROM narratives) AS narratives,
            (SELECT COUNT(DISTINCT trading_date) FROM narratives) AS dates
        `)
        res.json({
          status: 'ok',
          postgres: 'up',
          narratives_total: parseInt(counts.rows[0].narratives, 10),
          dates_available: parseInt(counts.rows[0].dates, 10),
          timestamp: new Date().toISOString(),
        })
      } finally {
        client.release()
      }
    } catch (err: any) {
      console.error('[long-exposure] health check failed:', err)
      res.status(503).json({ status: 'degraded', postgres: 'down', error: err.message })
    }
  })

  // ============ DATES ============

  /** GET /dates — list of trading dates that have at least one verified narrative. */
  router.get('/dates', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300') // 5 min — daily product
    try {
      const result = await pool.query(`
        SELECT
          trading_date::text AS date,
          COUNT(*)::int AS narrative_count,
          COUNT(*) FILTER (WHERE verifier_passed = true)::int AS verified_count
        FROM narratives
        GROUP BY trading_date
        ORDER BY trading_date DESC
      `)
      res.json({ dates: result.rows })
    } catch (err: any) {
      console.error('[long-exposure] /dates failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  /** GET /latest — convenience shortcut to the most recent narrated date. */
  router.get('/latest', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300')
    try {
      const result = await pool.query(`
        SELECT trading_date::text AS date
        FROM narratives
        ORDER BY trading_date DESC
        LIMIT 1
      `)
      if (result.rowCount === 0) {
        return res.json({ date: null })
      }
      res.json({ date: result.rows[0].date })
    } catch (err: any) {
      console.error('[long-exposure] /latest failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // ============ DAY ============

  /**
   * GET /day/:date — all verified narratives for a trading date,
   * grouped by scorer type, sorted by score within each group.
   *
   * Path param: YYYY-MM-DD. Validated as ISO date format; bad input → 400.
   */
  router.get('/day/:date', async (req: Request, res: Response) => {
    const date = req.params.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }
    res.setHeader('Cache-Control', 'public, max-age=600') // 10 min — historical days don't change

    try {
      // Anchor on selected_events (the current selection — SelectTopEvents
      // pre-cleans it per re-score, so it holds only today's ~160 events),
      // then DISTINCT ON to the LATEST verified narrative per event. This
      // fixes two things vs the naive "SELECT FROM narratives": (1) narratives
      // accumulates a row per prompt-version iteration AND per re-score
      // (stale selected_ids), so querying it directly returned ~1.7k duplicate
      // /stale cards for an iterated day — anchoring on selected_events +
      // DISTINCT ON gives the real set; (2) scorer_id / score / narration_rank
      // come from selected_events (the prior join was on the wrong column,
      // leaving narration_rank always NULL).
      const result = await pool.query(`
        SELECT * FROM (
          SELECT DISTINCT ON (se.selected_id)
            encode(n.event_hash, 'hex')  AS id,
            se.scorer_id,
            se.symbol,
            n.event_ts::text             AS event_ts,
            se.score,
            n.narrative                  AS prose,
            n.blueprint,
            n.score_breakdown            AS breakdown,
            n.verifier_passed,
            se.narration_rank,
            interp.interpretation
          FROM selected_events se
          JOIN narratives n
            ON n.trading_date = se.trading_date
           AND n.symbol       = se.symbol
           AND n.event_type   = se.scorer_id
           AND n.event_ts     = se.ts
          LEFT JOIN LATERAL (
            SELECT i.interpretation
            FROM interpretations i
            WHERE i.trading_date = se.trading_date
              AND i.symbol       = se.symbol
              AND i.event_type   = se.scorer_id
              AND i.event_ts     = se.ts
              AND i.verifier_passed = true
            ORDER BY i.created_at DESC
            LIMIT 1
          ) interp ON true
          WHERE se.trading_date = $1
            AND n.verifier_passed = true
          ORDER BY se.selected_id, n.created_at DESC
        ) d
        ORDER BY d.scorer_id, d.narration_rank NULLS LAST, d.score DESC
      `, [date])

      // Group by scorer_id for the frontend
      const groups: Record<string, any[]> = {}
      for (const row of result.rows) {
        const k = row.scorer_id
        if (!groups[k]) groups[k] = []
        groups[k].push(row)
      }

      res.json({
        date,
        total: result.rowCount,
        groups,
      })
    } catch (err: any) {
      console.error('[long-exposure] /day failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // ============ SYMBOL ============

  /**
   * GET /symbol/:symbol — all narratives for a ticker across dates.
   * Path param: max 12-char alphanumeric symbol. Anything else → 400.
   */
  router.get('/symbol/:symbol', async (req: Request, res: Response) => {
    const symbol = req.params.symbol
    if (!/^[A-Za-z0-9._=+-]{1,12}$/.test(symbol)) {
      return res.status(400).json({ error: 'invalid symbol format' })
    }
    res.setHeader('Cache-Control', 'public, max-age=300')

    try {
      // Dedup to the latest verified narrative per event (an event is
      // identified by date+scorer+event_ts for this symbol) — narratives
      // accumulates a row per prompt-version iteration and per re-score, so a
      // raw SELECT returns duplicates for any iterated/re-scored day. Same
      // content-key dedup as /day. Interpretation pulled via LATERAL.
      const result = await pool.query(`
        SELECT * FROM (
          SELECT DISTINCT ON (n.trading_date, n.event_type, n.event_ts)
            encode(n.event_hash, 'hex')  AS id,
            n.trading_date::text AS trading_date,
            n.event_type         AS scorer_id,
            n.symbol,
            n.event_ts::text     AS event_ts,
            n.score,
            n.narrative          AS prose,
            n.verifier_passed,
            interp.interpretation
          FROM narratives n
          LEFT JOIN LATERAL (
            SELECT i.interpretation
            FROM interpretations i
            WHERE i.trading_date = n.trading_date
              AND i.symbol       = n.symbol
              AND i.event_type   = n.event_type
              AND i.event_ts     = n.event_ts
              AND i.verifier_passed = true
            ORDER BY i.created_at DESC
            LIMIT 1
          ) interp ON true
          WHERE n.symbol = $1
            AND n.verifier_passed = true
          ORDER BY n.trading_date, n.event_type, n.event_ts, n.created_at DESC
        ) d
        ORDER BY d.trading_date DESC, d.score DESC
        LIMIT 200
      `, [symbol.toUpperCase()])

      res.json({ symbol: symbol.toUpperCase(), events: result.rows })
    } catch (err: any) {
      console.error('[long-exposure] /symbol failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // ============ SINGLE EVENT (drill-down) ============

  /**
   * GET /event/:id — full detail for one event: prose, blueprint,
   * raw breakdown (the "score explanation" that powers the drill-down).
   * Path param: 64-char hex event_hash.
   */
  router.get('/event/:id', async (req: Request, res: Response) => {
    const id = req.params.id
    if (!/^[0-9a-fA-F]{64}$/.test(id)) {
      return res.status(400).json({ error: 'invalid event id format' })
    }
    res.setHeader('Cache-Control', 'public, max-age=3600') // 1 hour — narratives are stable

    try {
      const result = await pool.query(`
        SELECT
          encode(n.event_hash, 'hex')  AS id,
          n.trading_date::text  AS trading_date,
          n.event_type          AS scorer_id,
          n.symbol,
          n.event_ts::text      AS event_ts,
          n.score,
          n.narrative           AS prose,
          n.blueprint,
          n.score_breakdown     AS breakdown,
          n.verifier_passed,
          n.verifier_notes,
          n.model_id,
          n.created_at::text    AS created_at,
          interp.interpretation,
          interp.pre_window_summary,
          interp.post_window_summary
        FROM narratives n
        LEFT JOIN LATERAL (
          SELECT i.interpretation, i.pre_window_summary, i.post_window_summary
          FROM interpretations i
          WHERE i.trading_date = n.trading_date
            AND i.symbol       = n.symbol
            AND i.event_type   = n.event_type
            AND i.event_ts     = n.event_ts
            AND i.verifier_passed = true
          ORDER BY i.created_at DESC
          LIMIT 1
        ) interp ON true
        WHERE n.event_hash = decode($1, 'hex')
        LIMIT 1
      `, [id])

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'event not found' })
      }
      res.json(result.rows[0])
    } catch (err: any) {
      console.error('[long-exposure] /event failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // ============ SYNTHESIS (daily themes — top of page) ============

  /**
   * GET /synthesis/:date — the day's themes paragraph (SYNTHESIZE output).
   * One row per trading date. 404 if that date has no synthesis yet.
   */
  router.get('/synthesis/:date', async (req: Request, res: Response) => {
    const date = req.params.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    }
    res.setHeader('Cache-Control', 'public, max-age=600')
    try {
      const result = await pool.query(`
        SELECT
          trading_date::text         AS date,
          synthesis_text             AS prose,
          events_considered,
          narrations_considered,
          interpretations_considered,
          day_aggregates,
          data_table,
          verifier_passed,
          created_at::text           AS created_at
        FROM daily_synthesis
        WHERE trading_date = $1
        LIMIT 1
      `, [date])
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'no synthesis for that date' })
      }
      res.json(result.rows[0])
    } catch (err: any) {
      console.error('[long-exposure] /synthesis failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // ============ AGGREGATE (weekly themes) ============

  /** GET /aggregate/latest — most recent weekly themes paragraph. */
  router.get('/aggregate/latest', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=600')
    try {
      const result = await pool.query(`
        SELECT
          week_start::text  AS week_start,
          week_end::text    AS week_end,
          aggregate_text    AS prose,
          days_considered,
          verifier_passed,
          created_at::text  AS created_at
        FROM weekly_aggregate
        ORDER BY week_start DESC
        LIMIT 1
      `)
      if (result.rowCount === 0) {
        return res.json({ week_start: null })
      }
      res.json(result.rows[0])
    } catch (err: any) {
      console.error('[long-exposure] /aggregate/latest failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  /**
   * GET /aggregate/:weekStart — weekly themes for the ISO week beginning
   * :weekStart (a Monday, YYYY-MM-DD). 404 if no rollup for that week.
   */
  router.get('/aggregate/:weekStart', async (req: Request, res: Response) => {
    const weekStart = req.params.weekStart
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ error: 'weekStart must be YYYY-MM-DD (a Monday)' })
    }
    res.setHeader('Cache-Control', 'public, max-age=600')
    try {
      const result = await pool.query(`
        SELECT
          week_start::text  AS week_start,
          week_end::text    AS week_end,
          aggregate_text    AS prose,
          days_considered,
          week_aggregates,
          data_table,
          verifier_passed,
          created_at::text  AS created_at
        FROM weekly_aggregate
        WHERE week_start = $1
        LIMIT 1
      `, [weekStart])
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'no weekly aggregate for that week_start' })
      }
      res.json(result.rows[0])
    } catch (err: any) {
      console.error('[long-exposure] /aggregate failed:', err)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
