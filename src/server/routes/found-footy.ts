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
  apiUrl: string  // Go read API base, e.g. http://found-footy-dev-api:8081
  natsUrl?: string // workspace NATS for the live-feed bridge, e.g. nats://nats:4222
  env?: 'dev' | 'prod' // our environment — scopes the NATS subscription to found-footy.<env>.>
}

// ---- Go cmd/api DTO shapes (what we consume) ----
interface GoSide { id: number; name: string; score: number | null; winner: boolean | null }
interface GoStatus { short: string; long: string; elapsed: number | null; extra: number | null }
interface GoLeague { id: number; name: string; season: number; country?: string; round?: string }
interface GoVideo {
  share_id: string; url: string; rank: number; verified: boolean
  extracted_minute: number | null; popularity: number
  width: number; height: number; duration_ms: number
}
interface GoEvent {
  id: string; fixture_id: number; type: string; detail: string
  minute: number; extra: number | null
  team: { id: number; name: string }; player: { id: number; name: string } | null
  assist?: { id: number; name: string } | null   // captured end-to-end now (was parsed-but-dropped); goals only
  videos: GoVideo[]
  // Backend-derived lifecycle (design.md "Data contracts" contract). Optional so the
  // shim still works against an API that predates the field.
  phase?: 'detected' | 'searching' | 'complete' | 'removed'
  debounce_count?: number
}
interface GoFixture {
  id: number; state: 'staging' | 'active' | 'completed'; kickoff: string
  league: GoLeague; home: GoSide; away: GoSide; status: GoStatus
  penalty?: { home: number; away: number } | null   // shootout result
  last_activity_at: string | null; events: GoEvent[]
}

// Factory function to create Found Footy router with configuration
export function createFoundFootyRouter(config: FoundFootyConfig): Router {
  const router = Router()
  const API = (config.apiUrl || '').replace(/\/$/, '')
  const isConfigured = !!API

  // Track connected SSE clients (for the /refresh fan-out + NATS bridge)
  const sseClients: Set<Response> = new Set()

  function broadcastRefresh(reason?: string) {
    const msg = `data: ${JSON.stringify({ type: 'refresh', timestamp: Date.now(), reason })}\n\n`
    sseClients.forEach(c => { try { c.write(msg) } catch { /* client gone */ } })
    console.log(`[found-footy] refresh -> ${sseClients.size} clients${reason ? ` (${reason})` : ''}`)
  }

  // Coalesce bursty NATS hints (a monitor cycle can fire several update/video messages)
  // into one refresh per ~250ms window — the frontend refetches the window once per burst.
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  function coalescedRefresh() {
    if (refreshTimer) return
    refreshTimer = setTimeout(() => { refreshTimer = null; broadcastRefresh('nats') }, 250)
  }

  // fixture.clock -> forward minute ticks as an SSE 'clock'; the frontend patches the
  // displayed minute in place (no refetch). Producer emits one batched message per monitor
  // cycle, so no coalescing needed.
  function broadcastClock(fixtures: any[]) {
    if (!Array.isArray(fixtures) || fixtures.length === 0) return
    const msg = `data: ${JSON.stringify({ type: 'clock', fixtures })}\n\n`
    sseClients.forEach(c => { try { c.write(msg) } catch { /* client gone */ } })
  }

  // ---- NATS live-feed bridge: found-footy.<env>.> -> SSE ----
  // Per the producer's bridge handoff (found-footy/docs/design/frontend-bridge-handoff.md):
  // REST is truth; each NATS message is a "refetch" hint. For the current window-refetching
  // frontend we coalesce fixture.update + event.video into the SSE `refresh` it already acts
  // on, and re-emit on our OWN NATS reconnect (closes the BFF<->NATS blip: the browser sees
  // no disconnect, so it must be told to re-snapshot). fixture.clock (in-place minute tick,
  // no fetch) is the next slice; until then the minute refreshes with the next update.
  if (config.natsUrl) {
    ;(async () => {
      let nats: any
      try { nats = await import('nats') } catch (e) {
        console.error('[found-footy] NATS client not installed — bridge disabled:', (e as Error).message)
        return
      }
      const jc = nats.JSONCodec()
      const connectLoop = async () => {
        try {
          const nc = await nats.connect({
            servers: config.natsUrl, name: 'vedanta-systems-bff',
            maxReconnectAttempts: -1, reconnectTimeWait: 2000,
          })
          console.log(`✅ [found-footy] NATS bridge connected (${config.natsUrl})`)
          ;(async () => {
            for await (const s of nc.status()) {
              if (s.type === 'reconnect') { console.log('[found-footy] NATS reconnected — resync'); broadcastRefresh('nats-resync') }
            }
          })().catch(() => { /* status stream closed */ })
          // Scope to OUR env: one shared broker serves dev + prod, and subjects carry the env
          // token (found-footy.<env>.<domain>.<event>). Subscribing to found-footy.> would pull
          // the other env's events into this SSE feed. Env isolation is by subject, not account
          // (broker is open mode — no creds). See ~/workspace/nats/schemas/README.md.
          const env = config.env || 'dev'
          const sub = nc.subscribe(`found-footy.${env}.>`)
          for await (const m of sub) {
            try {
              const env: any = jc.decode(m.data)
              const subject: string = env?.subject || m.subject || ''
              if (subject.endsWith('fixture.clock')) {
                broadcastClock(env?.payload?.fixtures || [])
              } else if (subject.endsWith('fixture.update') || subject.endsWith('event.video')) {
                coalescedRefresh()
              }
            } catch (err) {
              console.error('[found-footy] NATS message parse error:', (err as Error).message)
            }
          }
        } catch (e) {
          console.error('[found-footy] NATS bridge connect failed, retrying in 5s:', (e as Error).message)
          setTimeout(connectLoop, 5000)
        }
      }
      connectLoop()
    })()
  }

  // ---- helpers ----
  async function goJson<T>(path: string): Promise<T> {
    const r = await fetch(`${API}${path}`)
    if (!r.ok) throw new Error(`found-footy-api ${path} -> ${r.status}`)
    return r.json() as Promise<T>
  }

  const videoUrl = (shareId: string) => `/api/found-footy/video/${shareId}`

  // Non-scoring searchable events (red cards, missed penalties). found-footy's contract:
  // both run the SAME detected->searching->complete lifecycle and surface clips exactly like
  // goals (toEventDTO does no type-branching) — they just aren't goals, so no score line and
  // the running-score tally never sees them (they're filtered out by type upstream). The
  // involved team (card offender / penalty taker) rides in _scoring_team so generateEventTitle
  // names the right side; `detail` is the display label. player is always known (no unknown-
  // scorer case), so phase=detected maps straight to the debouncing state.
  function reshapeNonScoring(g: GoFixture, e: GoEvent, kind: string, detailLabel: string): any {
    const team: 'home' | 'away' = e.team.id === g.home.id ? 'home' : 'away'
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
      _kind: kind,
      detail: detailLabel,
      time: { elapsed: e.minute, extra: e.extra },
      team: { id: e.team.id, name: e.team.name, logo: '' },
      player: e.player ? { id: e.player.id, name: e.player.name } : { id: null, name: null },
      assist: { id: null, name: null },
      comments: null,
      _event_id: e.id,
      _display_title: '',
      _display_subtitle: '',
      _score_before: null,
      _score_after: null,        // non-scoring — no score line
      _scoring_team: team,       // reused by generateEventTitle to name the involved team
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
  }

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
        assist: e.assist ? { id: e.assist.id, name: e.assist.name } : { id: null, name: null }, // forward-only; older fixtures aged out
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
          width: v.width || 0,
          height: v.height || 0,
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

    // Non-scoring searchable events, both via reshapeNonScoring: red cards + missed penalties.
    // found-footy surfaces only red cards among card events; missed penalties are their own
    // `missed penalty` type (never type:'goal', so the score tally above never sees them).
    const cardEvents = (g.events || [])
      .filter(e => e.type === 'card' && /red/i.test(e.detail || ''))
      .map(e => reshapeNonScoring(g, e, 'card', 'Red Card'))
    const missedPenEvents = (g.events || [])
      .filter(e => e.type === 'missed penalty')
      .map(e => reshapeNonScoring(g, e, 'penalty-miss', 'Missed Penalty'))

    return [...goalEvents, ...cardEvents, ...missedPenEvents]
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
      league: { id: g.league.id, name: g.league.name, country: g.league.country || '', logo: '', flag: '', season: g.league.season, round: g.league.round || '' },
      teams: {
        home: { id: g.home.id, name: g.home.name, winner: g.home.winner, logo: '' },
        away: { id: g.away.id, name: g.away.name, winner: g.away.winner, logo: '' },
      },
      goals: { home: g.home.score, away: g.away.score },
      // Go provides `penalty` (the shootout result); HT/FT/ET splits stay dropped.
      score: { halftime: { home: 0, away: 0 }, fulltime: { home: 0, away: 0 }, extratime: null, penalty: g.penalty || null },
      events: g.state === 'staging' ? [] : reshapeEvents(g),
      // found-footy's last_activity_at is event-anchored (rebuild/go 93606af): it bumps only
      // on goal/card, status transition, activation, or completion — never on a plain poll.
      // So it's a stable, monotonic recency key; live fixtures sort by it desc. Staging never
      // activates → no last_activity_at → falls through to kickoff order.
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
      // found-footy moves fixtures between staging/active/completed on its own schedule, and that
      // location can disagree with the actual match status: a not-yet-kicked-off game is pulled
      // into 'active' early to ride the fast monitor cycle (status still NS), and a finished game
      // can linger in 'active' (its ft->completed transition stalls). Either way the frontend
      // would mis-report it as live. So bucket by the match STATUS, which is unambiguous; fall
      // back to the backend state only for statuses we don't classify. (Raw Go status is lowercase.)
      const NOT_STARTED = ['NS', 'TBD']
      const LIVE = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']
      const FINISHED = ['FT', 'AET', 'PEN', 'AWD', 'WO']
      const effectiveState = (g: GoFixture): string => {
        const s = (g.status.short || '').toUpperCase()
        if (NOT_STARTED.includes(s)) return 'staging'
        if (LIVE.includes(s)) return 'active'
        if (FINISHED.includes(s)) return 'completed'
        return g.state // CANC/PST/ABD/unknown -> keep the backend state (usually completed)
      }
      const pick = (state: string) => all.filter(g => effectiveState(g) === state && inDate(g)).map(reshapeFixture)
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

  // GET /search?q= - proxy Go's /api/v1/search (case-insensitive substring across competition,
  // team, scorer, and assist names). Go returns a flat []fixtureDTO (same shape as /fixtures);
  // we reshape, re-derive which part matched for the UI's highlight metadata (_search), and
  // group by UTC date. The frontend re-buckets per timezone + applies its navigable cutoff.
  router.get('/search', async (req: Request, res: Response) => {
    const q = ((req.query.q as string) || '').trim()
    // Frontend already gates <2 chars; guard here too, and never send an empty q (Go 400s it).
    if (!isConfigured || q.length < 2) {
      return res.json({ results: [], query: q, totalFixtures: 0 })
    }
    try {
      const all = await goJson<GoFixture[]>(`/api/v1/search?q=${encodeURIComponent(q)}`)
      const needle = q.toLowerCase()
      const has = (s?: string | null) => !!s && s.toLowerCase().includes(needle)

      const fixtures = all.map(g => {
        const f = reshapeFixture(g)
        const teamMatch = has(g.home.name) || has(g.away.name)
        const matchedEventIds = (f.events as any[])
          .filter(e => has(e.player?.name) || has(e.assist?.name))
          .map(e => e._event_id)
        f._search = { teamMatch, matchedEventIds, matchCount: matchedEventIds.length + (teamMatch ? 1 : 0) }
        return f
      })

      // Group by UTC date, newest first (the frontend regroups by tz-local date).
      const byDate = new Map<string, any[]>()
      for (const f of fixtures) {
        const date = (f.fixture.date || '').slice(0, 10)
        if (!byDate.has(date)) byDate.set(date, [])
        byDate.get(date)!.push(f)
      }
      const results = Array.from(byDate.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, groupFixtures]) => ({ date, fixtures: groupFixtures }))

      res.json({ results, query: q, totalFixtures: fixtures.length })
    } catch (e) {
      // Pre-migration Go /search 404s (goJson throws on non-2xx) — degrade to empty results
      // rather than surfacing an error in the search UI.
      console.warn('[found-footy] /search:', (e as Error).message)
      res.json({ results: [], query: q, totalFixtures: 0 })
    }
  })

  // GET /event/:eventId - which date an event is on (for shared-link navigation). found-footy
  // dropped single-resource GETs (N7) — everything is the batch ?ids= form now, even for one id
  // ("single event is just ?ids=<one>"). Take the first result; empty array => not found.
  router.get('/event/:eventId', async (req: Request, res: Response) => {
    try {
      const [ev] = await goJson<GoEvent[]>(`/api/v1/events?ids=${encodeURIComponent(req.params.eventId)}`)
      if (!ev) return res.json({ eventId: req.params.eventId, found: false })
      const [fx] = await goJson<GoFixture[]>(`/api/v1/fixtures?ids=${ev.fixture_id}`)
      if (!fx) return res.json({ eventId: req.params.eventId, found: false })
      // `date` is the UTC day; also return the raw kickoff so the client can navigate to the
      // event's date in the USER's timezone (fixtures bucket by local date, not UTC).
      res.json({ eventId: req.params.eventId, date: fx.kickoff.slice(0, 10), kickoff: fx.kickoff, found: true })
    } catch {
      res.json({ eventId: req.params.eventId, found: false })
    }
  })

  // Stream a clip by share_id: re-proxy Go's presigned Garage redirect, Range-forwarded.
  // Must survive constant client disconnects: <video> opens/aborts range requests on every
  // seek and on unmount, so an aborted upstream stream is normal, not a 500. When `attachment`
  // (a filename) is set, force a download via Content-Disposition instead of inline playback
  // (Garage serves the object inline, so the header has to be added on this hop).
  async function streamClip(shareId: string, req: Request, res: Response, attachment?: string) {
    if (!isConfigured) return res.status(503).json({ error: 'found-footy api not configured' })
    const controller = new AbortController()
    // Abort the upstream fetch only if the client leaves mid-stream (seek/close).
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    try {
      const range = req.headers.range
      // redirect:'follow' lets undici follow Go's 302 to the presigned Garage URL,
      // forwarding Range through the hop; the final response is the (ranged) bytes.
      const upstream = await fetch(`${API}/api/v1/videos/${encodeURIComponent(shareId)}`, {
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
      if (attachment) res.setHeader('Content-Disposition', `attachment; filename="${attachment}"`)

      if (!upstream.body) return res.end()
      const nodeStream = Readable.fromWeb(upstream.body as any)
      // Unhandled stream 'error' crashes the request (→ 500). A client seek/disconnect
      // aborts the upstream — expected; swallow it, log anything genuinely unexpected.
      nodeStream.on('error', (err: any) => {
        if (err?.name !== 'AbortError' && err?.code !== 'ABORT_ERR') {
          console.error('[found-footy] stream:', err?.message)
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
      console.error('[found-footy] stream:', err?.message)
      if (!res.headersSent) res.status(502).json({ error: 'Failed to stream video' })
    }
  }

  // GET /video/:shareId — inline playback.
  router.get('/video/:shareId', (req: Request, res: Response) => streamClip(req.params.shareId, req, res))

  // GET /download/:shareId?filename= — same stream, forced download. filename is the caller's
  // meaningful name (teams + minute), sanitized to filesystem-safe chars; defaults to share_id.
  router.get('/download/:shareId', (req: Request, res: Response) => {
    const raw = (req.query.filename as string) || `${req.params.shareId}.mp4`
    const filename = (raw.replace(/[^\w.\- ]+/g, '').trim().slice(0, 80)) || `${req.params.shareId}.mp4`
    streamClip(req.params.shareId, req, res, filename)
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

  // POST /refresh - internal-only webhook; fan out a lightweight refresh signal.
  // (Legacy Pattern-A path; the live feed is now the NATS bridge above. Kept harmless.)
  router.post('/refresh', (_req: Request, res: Response) => {
    broadcastRefresh('webhook')
    res.json({ success: true, clientsNotified: sseClients.size })
  })

  return router
}
