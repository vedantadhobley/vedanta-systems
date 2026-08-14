import { Router, Response, Request } from 'express'
import { Readable } from 'node:stream'

/**
 * Found Footy API surface — **Pattern B adapter (translation shim)**.
 *
 * vs-api no longer reads found-footy's Mongo/MinIO directly. It calls the
 * found-footy Go read API (`found-footy-{env}-api`, REST at `/api/v1/*`) and
 * **reshapes** the flat+nested Go DTOs back into the legacy Mongo-shaped
 * `Fixture` the current frontend still expects — so the frontend needs zero
 * changes while the backend is the new Go stack. When the frontend is
 * redesigned to consume the Go shape natively, this reshaping goes away.
 *
 * ── Video / share URLs (the new sharing model) ──────────────────────────
 * Old: MinIO object paths, proxied at `/api/found-footy/video/:bucket/*`.
 * New: found-footy mints a stable **share_id** (`s_<12hex>`) per public clip.
 *   browser → GET /api/found-footy/video/:shareId
 *           → vs-api → GET {found-footy-api}/api/v1/videos/:shareId
 *           → 302 presigned Garage URL → vs-api streams the bytes back
 *             (same-origin, Range-forwarded — Garage isn't browser-reachable).
 * Shares are **stable across replacement**: when a better clip supersedes an
 * older one, the share_id keeps resolving (found-footy walks the supersede
 * chain to the current live asset), so a shared link never dies — it
 * upgrades. A VAR-removed clip resolves 410; a never-minted id 404s. That's
 * why the shareable URL is the share_id, not the underlying object path.
 *
 * Not yet wired (next layers): the NATS→SSE coalescing bridge (`/stream`
 * currently keeps alive with connected/health/heartbeat only, no live
 * refresh), `/dates`+`/search` are synthesized/stubbed, and `phase`/`assist`
 * land found-footy-side later (rendered as placeholders until then).
 */

// Configuration interface for Found Footy routes
export interface FoundFootyConfig {
  apiUrl: string // Go read API base, e.g. http://found-footy-dev-api:8081
}

// ---- Go cmd/api DTO shapes (what we consume) ----
interface GoSide { id: number; name: string; score: number | null; winner: boolean | null }
interface GoStatus { short: string; long: string; elapsed: number | null; extra: number | null }
interface GoLeague { id: number; name: string; season: number }
interface GoVideo {
  share_id: string; url: string; rank: number; verified: boolean
  extracted_minute: number | null; popularity: number
  width: number; height: number; duration_ms: number
}
interface GoEvent {
  id: string; fixture_id: number; type: string; detail: string
  minute: number; extra: number | null
  team: { id: number; name: string }; player: { id: number; name: string } | null
  videos: GoVideo[]
  // Backend-derived lifecycle (design.md "Data contracts" contract). Optional so the
  // shim still works against an API that predates the field.
  phase?: 'detected' | 'searching' | 'complete' | 'removed'
  debounce_count?: number
}
interface GoFixture {
  id: number; state: 'staging' | 'active' | 'completed'; kickoff: string
  league: GoLeague; home: GoSide; away: GoSide; status: GoStatus
  last_activity_at: string | null; events: GoEvent[]
}

// Factory function to create Found Footy router with configuration
export function createFoundFootyRouter(config: FoundFootyConfig): Router {
  const router = Router()
  const API = (config.apiUrl || '').replace(/\/$/, '')
  const isConfigured = !!API

  // Track connected SSE clients (for the /refresh fan-out + future NATS bridge)
  const sseClients: Set<Response> = new Set()

  // ---- helpers ----
  async function goJson<T>(path: string): Promise<T> {
    const r = await fetch(`${API}${path}`)
    if (!r.ok) throw new Error(`found-footy-api ${path} -> ${r.status}`)
    return r.json() as Promise<T>
  }

  const videoUrl = (shareId: string) => `/api/found-footy/video/${shareId}`

  // Go event -> legacy GoalEvent, with a running-score tally to reconstruct
  // the display fields the Go API no longer sends (_display_title, _score_after,
  // _scoring_team). Goals only — the old UI renders type:'Goal'.
  function reshapeEvents(g: GoFixture): any[] {
    const goals = (g.events || [])
      .filter(e => e.type === 'goal')
      .sort((a, b) => (a.minute - b.minute) || ((a.extra || 0) - (b.extra || 0)))

    let h = 0
    let a = 0
    const goalEvents = goals.map(e => {
      const scoringTeam: 'home' | 'away' = e.team.id === g.home.id ? 'home' : 'away'
      const before = { home: h, away: a }
      if (scoringTeam === 'home') h++
      else a++
      const after = { home: h, away: a }
      const displayTitle = scoringTeam === 'home'
        ? `${g.home.name} (${after.home}) - ${after.away} ${g.away.name}`
        : `${g.home.name} ${after.home} - (${after.away}) ${g.away.name}`
      const minuteStr = `${e.minute}${e.extra ? `+${e.extra}` : ''}`
      const playerName = e.player?.name || 'Unknown'
      const videos = [...(e.videos || [])].sort((x, y) => x.rank - y.rank)

      // Map the backend-derived semantic phase -> the legacy two-flag model the current
      // UI reads (_monitor_complete/_download_complete). Prefer the real `phase`; fall
      // back to the heuristic only if the API predates the field. (The redesigned frontend
      // will read `phase` + videos natively and this mapping goes away — design.md.)
      let monitorComplete: boolean
      let downloadComplete: boolean
      let removed = false
      switch (e.phase) {
        case 'removed':   monitorComplete = true;  downloadComplete = true;  removed = true; break
        case 'complete':  monitorComplete = true;  downloadComplete = true;  break
        case 'searching': monitorComplete = true;  downloadComplete = false; break
        case 'detected':
          if (e.player) { monitorComplete = false; downloadComplete = false } // known scorer: confirming/validating
          else          { monitorComplete = true;  downloadComplete = true }  // unknown scorer: never searched -> done
          break
        default: {
          // Pre-phase API fallback: exact for finished games, ambiguous only for live ones.
          const done = g.state === 'completed' || !e.player || (e.videos?.length || 0) > 0
          monitorComplete = true
          downloadComplete = done
        }
      }

      return {
        type: 'Goal',
        detail: e.detail,
        time: { elapsed: e.minute, extra: e.extra },
        team: { id: e.team.id, name: e.team.name, logo: '' },
        player: e.player ? { id: e.player.id, name: e.player.name } : { id: null, name: null },
        assist: { id: null, name: null }, // Go doesn't send assist yet (lands later, forward-only)
        comments: null,
        _event_id: e.id,
        _display_title: displayTitle,
        _display_subtitle: `${minuteStr}' - ${playerName}`,
        _score_before: before,
        _score_after: after,
        _scoring_team: scoringTeam,
        _twitter_search: '',
        _discovered_videos: [],
        _s3_urls: videos.map(v => videoUrl(v.share_id)),
        _s3_videos: videos.map(v => ({
          url: videoUrl(v.share_id),
          perceptual_hash: '',
          resolution_score: (v.width || 0) * (v.height || 0),
          popularity: v.popularity || 0,
          rank: v.rank,
        })),
        _perceptual_hashes: [],
        _monitor_complete: monitorComplete,
        _download_complete: downloadComplete,
        _removed: removed,
        // The frontend sorts events by _first_seen desc (newest goal on top). Go doesn't
        // send a detected-at timestamp, so derive a monotonic one from kickoff + minute:
        // later minutes sort first. (Score tally above is computed in true chronological
        // order, so _score_after stays correct regardless of this display ordering.)
        _first_seen: new Date(new Date(g.kickoff).getTime() + ((e.minute || 0) + (e.extra || 0)) * 60000).toISOString(),
      }
    })

    // Red cards are full searchable events — same detected->searching->complete lifecycle
    // and clips as goals; they just aren't goals. Reshape them like goals (phase->flags,
    // videos) but with _kind='card', the carded team as _scoring_team (so the title names
    // the right team), and no score line. found-footy only ingests reds.
    const cardEvents = (g.events || [])
      .filter(e => e.type === 'card' && /red/i.test(e.detail || ''))
      .map(e => {
        const cardedTeam: 'home' | 'away' = e.team.id === g.home.id ? 'home' : 'away'
        const vids = [...(e.videos || [])].sort((x, y) => x.rank - y.rank)
        let monitorComplete: boolean
        let downloadComplete: boolean
        let removed = false
        switch (e.phase) {
          case 'removed':   monitorComplete = true;  downloadComplete = true;  removed = true; break
          case 'complete':  monitorComplete = true;  downloadComplete = true;  break
          case 'searching': monitorComplete = true;  downloadComplete = false; break
          case 'detected':  monitorComplete = false; downloadComplete = false; break // debouncing/validating
          default:          monitorComplete = true;  downloadComplete = g.state === 'completed' || vids.length > 0
        }
        return {
          type: 'Goal',
          _kind: 'card',
          detail: 'Red Card',
          time: { elapsed: e.minute, extra: e.extra },
          team: { id: e.team.id, name: e.team.name, logo: '' },
          player: e.player ? { id: e.player.id, name: e.player.name } : { id: null, name: null },
          assist: { id: null, name: null },
          comments: null,
          _event_id: e.id,
          _display_title: '',
          _display_subtitle: '',
          _score_before: null,
          _score_after: null,        // no score line for a card
          _scoring_team: cardedTeam, // reused by generateEventTitle to name the carded team
          _twitter_search: '',
          _discovered_videos: [],
          _s3_urls: vids.map(v => videoUrl(v.share_id)),
          _s3_videos: vids.map(v => ({
            url: videoUrl(v.share_id),
            perceptual_hash: '',
            resolution_score: (v.width || 0) * (v.height || 0),
            popularity: v.popularity || 0,
            rank: v.rank,
          })),
          _perceptual_hashes: [],
          _monitor_complete: monitorComplete,
          _download_complete: downloadComplete,
          _removed: removed,
          _first_seen: new Date(new Date(g.kickoff).getTime() + ((e.minute || 0) + (e.extra || 0)) * 60000).toISOString(),
        }
      })

    return [...goalEvents, ...cardEvents]
  }

  function reshapeFixture(g: GoFixture): any {
    return {
      _id: g.id,
      fixture: {
        id: g.id,
        referee: null,
        timezone: 'UTC',
        date: g.kickoff,
        timestamp: Math.floor(new Date(g.kickoff).getTime() / 1000),
        // Go sends lowercase status codes ('ns','1h','pen'); the frontend keys all its
        // status logic on uppercase (API-Football convention) — staging/live/penalty/
        // completed detection + the live-minute highlight. Uppercase so they match.
        status: { long: g.status.long, short: (g.status.short || '').toUpperCase(), elapsed: g.status.elapsed, extra: g.status.extra },
      },
      league: { id: g.league.id, name: g.league.name, country: '', logo: '', flag: '', season: g.league.season, round: '' },
      teams: {
        home: { id: g.home.id, name: g.home.name, winner: g.home.winner, logo: '' },
        away: { id: g.away.id, name: g.away.name, winner: g.away.winner, logo: '' },
      },
      goals: { home: g.home.score, away: g.away.score },
      // Go dropped the HT/ET/penalty breakdown; placeholder to satisfy the shape.
      score: { halftime: { home: 0, away: 0 }, fulltime: { home: 0, away: 0 }, extratime: null, penalty: null },
      events: g.state === 'staging' ? [] : reshapeEvents(g),
      _last_activity: g.last_activity_at || undefined,
    }
  }

  const localDate = (iso: string, offsetMin: number) =>
    new Date(new Date(iso).getTime() + offsetMin * 60_000).toISOString().slice(0, 10)

  // ============ ROUTES ============

  // GET /health - is the found-footy read API reachable?
  router.get('/health', async (_req: Request, res: Response) => {
    let up = false
    try { up = (await fetch(`${API}/healthz`)).ok } catch { up = false }
    res.json({
      status: up ? 'ok' : 'degraded',
      health: { api: { status: up ? 'up' : 'down' }, overall: up ? 'healthy' : 'unhealthy' },
      connectedClients: sseClients.size,
      timestamp: new Date().toISOString(),
    })
  })

  // GET /fixtures[?date=YYYY-MM-DD] - reshaped into {staging,active,completed}
  router.get('/fixtures', async (req: Request, res: Response) => {
    try {
      const all = await goJson<GoFixture[]>('/api/v1/fixtures')
      const dateParam = req.query.date as string | undefined
      const inDate = (g: GoFixture) => !dateParam || g.kickoff.slice(0, 10) === dateParam
      const pick = (state: string) => all.filter(g => g.state === state && inDate(g)).map(reshapeFixture)
      const body: any = { staging: pick('staging'), active: pick('active'), completed: pick('completed') }
      if (dateParam) body.date = dateParam
      res.json(body)
    } catch (error) {
      console.error('[found-footy] /fixtures:', (error as Error).message)
      res.status(502).json({ error: 'found-footy api unavailable' })
    }
  })

  // GET /dates?tz=<minutes_east_of_utc> - synthesized from the Go window's kickoffs
  router.get('/dates', async (req: Request, res: Response) => {
    try {
      const raw = req.query.tz
      const parsed = raw === undefined ? 0 : parseInt(String(raw), 10)
      const offsetMin = Number.isFinite(parsed) ? parsed : 0
      const all = await goJson<GoFixture[]>('/api/v1/fixtures')
      const dates = new Set(all.map(g => localDate(g.kickoff, offsetMin)))
      res.json({ dates: [...dates].sort().reverse() })
    } catch (error) {
      console.error('[found-footy] /dates:', (error as Error).message)
      res.status(502).json({ error: 'found-footy api unavailable' })
    }
  })

  // GET /search - stubbed for the minimal slice (Go has no search endpoint; BFF will synthesize later)
  router.get('/search', (req: Request, res: Response) => {
    res.json({ results: [], query: (req.query.q as string) || '' })
  })

  // GET /event/:eventId - which date an event is on (for shared links)
  router.get('/event/:eventId', async (req: Request, res: Response) => {
    try {
      const ev = await goJson<GoEvent>(`/api/v1/events/${encodeURIComponent(req.params.eventId)}`)
      const fx = await goJson<GoFixture>(`/api/v1/fixtures/${ev.fixture_id}`)
      res.json({ eventId: req.params.eventId, date: fx.kickoff.slice(0, 10), found: true })
    } catch {
      res.json({ eventId: req.params.eventId, found: false })
    }
  })

  // GET /video/:shareId - re-proxy Go's presigned Garage redirect, Range-forwarded.
  // Must survive constant client disconnects: <video> opens/aborts range requests on
  // every seek and on unmount, so an aborted upstream stream is normal, not a 500.
  router.get('/video/:shareId', async (req: Request, res: Response) => {
    if (!isConfigured) return res.status(503).json({ error: 'found-footy api not configured' })
    const controller = new AbortController()
    // Abort the upstream fetch only if the client leaves mid-stream (seek/close).
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    try {
      const range = req.headers.range
      // redirect:'follow' lets undici follow Go's 302 to the presigned Garage URL,
      // forwarding Range through the hop; the final response is the (ranged) bytes.
      const upstream = await fetch(`${API}/api/v1/videos/${encodeURIComponent(req.params.shareId)}`, {
        headers: range ? { Range: range } : {},
        redirect: 'follow',
        signal: controller.signal,
      })
      if (upstream.status === 404) return res.status(404).json({ error: 'Video not found' })
      if (upstream.status === 410) return res.status(410).json({ error: 'Video removed' })
      if (!upstream.ok && upstream.status !== 206) return res.status(502).json({ error: 'Upstream video error' })

      res.status(upstream.status)
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4')
      res.setHeader('Accept-Ranges', 'bytes')
      const cr = upstream.headers.get('content-range'); if (cr) res.setHeader('Content-Range', cr)
      const cl = upstream.headers.get('content-length'); if (cl) res.setHeader('Content-Length', cl)
      // Short cache: a superseded share re-resolves to the winner, so don't pin long.
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')

      if (!upstream.body) return res.end()
      const nodeStream = Readable.fromWeb(upstream.body as any)
      // Unhandled stream 'error' crashes the request (→ 500). A client seek/disconnect
      // aborts the upstream — expected; swallow it, log anything genuinely unexpected.
      nodeStream.on('error', (err: any) => {
        if (err?.name !== 'AbortError' && err?.code !== 'ABORT_ERR') {
          console.error('[found-footy] /video stream:', err?.message)
        }
        if (!res.writableEnded) res.destroy()
      })
      res.on('error', () => nodeStream.destroy())
      nodeStream.pipe(res)
    } catch (error) {
      const err = error as any
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
        if (!res.writableEnded) res.destroy()
        return
      }
      console.error('[found-footy] /video:', err?.message)
      if (!res.headersSent) res.status(502).json({ error: 'Failed to stream video' })
    }
  })

  // GET /stream - SSE kept alive (connected/health/heartbeat). No live NATS
  // refresh yet — that's the next layer (NATS -> SSE coalescing bridge).
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
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
    let up = false
    try { up = (await fetch(`${API}/healthz`)).ok } catch { up = false }
    res.write(`data: ${JSON.stringify({ type: 'health', health: { api: { status: up ? 'up' : 'down' }, overall: up ? 'healthy' : 'unhealthy' } })}\n\n`)

    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
    }, 30000)
    req.on('close', () => {
      clearInterval(heartbeat)
      sseClients.delete(res)
    })
  })

  // POST /refresh - internal-only webhook; fan out a lightweight refresh signal
  router.post('/refresh', (_req: Request, res: Response) => {
    const msg = `data: ${JSON.stringify({ type: 'refresh', timestamp: Date.now() })}\n\n`
    sseClients.forEach(c => { try { c.write(msg) } catch { /* client gone */ } })
    console.log(`[found-footy] Broadcast refresh to ${sseClients.size} clients`)
    res.json({ success: true, clientsNotified: sseClients.size })
  })

  return router
}
