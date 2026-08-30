import { Router, Response, Request } from 'express'
import { Readable } from 'node:stream'
import type { Fixture, GoalEvent, SearchFixture } from '../../types/found-footy'
import type { EventVideoPatch } from '../../lib/found-footy-live'

/**
 * Found Footy API surface — **Pattern B adapter (translation shim)**.
 *
 * vs-api no longer reads found-footy's Mongo/MinIO directly. It calls the
 * found-footy Go read API (`found-footy-{env}-api`, REST at `/api/v1/*`) and
 * **reshapes** the flat+nested Go DTOs into the portal's existing fixture and
 * event component model. Found Footy owns presentation classification; the
 * adapter preserves its root projection without interpreting provider codes.
 *
 * ── Video / share URLs (the new sharing model) ──────────────────────────
 * Old: MinIO object paths, proxied at `/api/found-footy/video/:bucket/*`.
 * New: found-footy mints a stable **share_id** (`s_<12hex>`) per public clip.
 *   browser → GET /api/found-footy/video/:shareId
 *           → vs-api → GET {found-footy-api}/api/v1/videos/:shareId
 *           → 302 presigned Garage URL → vs-api streams the bytes back
 *             (same-origin, Range-forwarded — Garage isn't browser-reachable).
 * Shares are **stable across replacement**: when a better clip supersedes an
 * older one, the share_id keeps resolving through the supersede chain to the
 * current live asset. That replacement guarantee is not permanent media
 * retention. A removed or retention-reclaimed clip resolves 410; a
 * never-minted id 404s. The share ID remains the durable identity even after
 * its media bytes become unavailable.
 *
 * The adapter also owns timezone-offset `/dates` synthesis, search reshaping,
 * and the NATS→SSE bridge. The Go API now supplies `phase`,
 * `debounce_count`, and forward-only assist data; this shim maps semantic
 * phase back into the legacy flags consumed by the current frontend.
 */

// Configuration interface for Found Footy routes
export interface FoundFootyConfig {
  apiUrl: string  // Go read API base, e.g. http://found-footy-dev-api:8081
  natsUrl?: string // workspace NATS for the live-feed bridge, e.g. nats://nats:4222
  env?: 'dev' | 'prod' // our environment — scopes the NATS subscription to found-footy.<env>.>
}

// ---- Go cmd/api DTO shapes (what we consume) ----
interface GoSide { id: number; name: string; score: number | null; winner: boolean | null }
type GoPresentationState = 'playing' | 'finished' | 'upcoming' | 'deferred'
type GoDisplay = 'clock' | 'status'
interface GoClock { minute: number | null; extra: number | null }
interface GoStatus { short: string; long: string }
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
  phase: 'detected' | 'searching' | 'complete' | 'removed'
  debounce_count: number
}
interface GoFixture {
  id: number; state: 'staging' | 'active' | 'completed'; kickoff: string
  league: GoLeague; home: GoSide; away: GoSide
  presentation_state: GoPresentationState; clock: GoClock; status: GoStatus; display: GoDisplay
  penalty?: { home: number; away: number } | null   // shootout result
  last_activity_at: string | null; events: GoEvent[]
}

interface FixtureStatusEntry {
  fixture_id: number
  presentation_state: GoPresentationState
  clock: GoClock
  status: GoStatus
  display: GoDisplay
}

interface FoundFootyEnvelope {
  subject?: string
  payload?: {
    fixtures?: unknown
    fixture_ids?: unknown
    event_id?: unknown
    fixture_id?: unknown
  }
}

export interface FixtureUpdateBatcher {
  add: (fixtureIds: readonly number[]) => void
  flush: () => Promise<void>
  close: () => void
}

export type FoundFootyLiveTopic = 'fixture_status' | 'fixture_update' | 'event_video'

export function foundFootyLiveTopic(subject: string): FoundFootyLiveTopic | null {
  if (subject.endsWith('fixture.status')) return 'fixture_status'
  if (subject.endsWith('fixture.update')) return 'fixture_update'
  if (subject.endsWith('event.video')) return 'event_video'
  return null
}

export function createFixtureUpdateBatcher(
  onBatch: (fixtureIds: number[]) => Promise<void>,
  delayMs = 250,
): FixtureUpdateBatcher {
  const pending = new Set<number>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let active: Promise<void> | null = null

  const schedule = () => {
    if (timer || pending.size === 0) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delayMs)
  }

  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (active) await active
    if (pending.size === 0) return

    const fixtureIds = [...pending].sort((a, b) => a - b)
    pending.clear()
    active = onBatch(fixtureIds).finally(() => { active = null })
    await active
    schedule()
  }

  return {
    add(fixtureIds) {
      for (const id of fixtureIds) {
        if (Number.isSafeInteger(id) && id > 0) pending.add(id)
      }
      schedule()
    },
    flush,
    close() {
      if (timer) clearTimeout(timer)
      timer = null
      pending.clear()
    },
  }
}

// Factory function to create Found Footy router with configuration
export function createFoundFootyRouter(config: FoundFootyConfig): Router {
  const router = Router()
  const API = (config.apiUrl || '').replace(/\/$/, '')
  const isConfigured = !!API

  // Track connected SSE clients for the NATS -> browser bridge.
  const sseClients: Set<Response> = new Set()

  function broadcast(event: object) {
    const msg = `data: ${JSON.stringify(event)}\n\n`
    sseClients.forEach(c => { try { c.write(msg) } catch { /* client gone */ } })
  }

  // ---- helpers ----
  async function goJson<T>(path: string): Promise<T> {
    const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) throw new Error(`found-footy-api ${path} -> ${r.status}`)
    return r.json() as Promise<T>
  }

  const videoUrl = (shareId: string) => `/api/found-footy/video/${shareId}`

  function legacyEventFlags(e: GoEvent) {
    switch (e.phase) {
      case 'removed':
        return { monitorComplete: true, downloadComplete: true, removed: true }
      case 'complete':
        return { monitorComplete: true, downloadComplete: true, removed: false }
      case 'searching':
        return { monitorComplete: true, downloadComplete: false, removed: false }
      case 'detected':
        // Unknown-player placeholders never enter discovery; the current UI's
        // legacy flags must not render them as an active search.
        return e.player
          ? { monitorComplete: false, downloadComplete: false, removed: false }
          : { monitorComplete: true, downloadComplete: true, removed: false }
    }
  }

  // Non-scoring searchable events (red cards, missed penalties). found-footy's contract:
  // both run the SAME detected->searching->complete lifecycle and surface clips exactly like
  // goals (toEventDTO does no type-branching) — they just aren't goals, so no score line and
  // the running-score tally never sees them (they're filtered out by type upstream). The
  // involved team (card offender / penalty taker) rides in _scoring_team so generateEventTitle
  // names the right side; `detail` is the display label. player is always known (no unknown-
  // scorer case), so phase=detected maps straight to the debouncing state.
  function reshapeNonScoring(
    g: GoFixture,
    e: GoEvent,
    kind: 'card' | 'penalty-miss',
    detailLabel: string,
  ): GoalEvent {
    const team: 'home' | 'away' = e.team.id === g.home.id ? 'home' : 'away'
    const vids = [...(e.videos || [])].sort((x, y) => x.rank - y.rank)
    const { monitorComplete, downloadComplete, removed } = legacyEventFlags(e)
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
  function reshapeEvents(g: GoFixture): GoalEvent[] {
    const goals = (g.events || [])
      .filter(e => e.type === 'goal')
      .sort((a, b) => (a.minute - b.minute) || ((a.extra || 0) - (b.extra || 0)))

    let h = 0
    let a = 0
    const goalEvents = goals.map((e): GoalEvent => {
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

      const { monitorComplete, downloadComplete, removed } = legacyEventFlags(e)

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

  function reshapeFixture(g: GoFixture): Fixture {
    return {
      _id: g.id,
      state: g.state,
      presentation_state: g.presentation_state,
      clock: g.clock,
      status: g.status,
      display: g.display,
      fixture: {
        id: g.id,
        referee: null,
        timezone: 'UTC',
        date: g.kickoff,
        timestamp: Math.floor(new Date(g.kickoff).getTime() / 1000),
      },
      league: { id: g.league.id, name: g.league.name, country: g.league.country || '', logo: '', flag: '', season: g.league.season, round: g.league.round || '' },
      teams: {
        home: { id: g.home.id, name: g.home.name, winner: g.home.winner, logo: '' },
        away: { id: g.away.id, name: g.away.name, winner: g.away.winner, logo: '' },
      },
      goals: { home: g.home.score, away: g.away.score },
      score: { penalty: g.penalty || null },
      events: reshapeEvents(g),
      // found-footy's API derives last_activity_at from activation, first terminal observation,
      // and eligible events. Legacy/direct-complete rows fall back to completion. The later
      // active→completed process transition therefore cannot reorder an already-finished match.
      _last_activity: g.last_activity_at || undefined,
    }
  }

  function reshapeEventVideo(e: GoEvent): EventVideoPatch {
    const videos = [...(e.videos || [])].sort((left, right) => left.rank - right.rank)
    const { monitorComplete, downloadComplete, removed } = legacyEventFlags(e)
    return {
      _event_id: e.id,
      _s3_urls: videos.map(video => videoUrl(video.share_id)),
      _s3_videos: videos.map(video => ({
        url: videoUrl(video.share_id),
        perceptual_hash: '',
        resolution_score: (video.width || 0) * (video.height || 0),
        width: video.width || 0,
        height: video.height || 0,
        popularity: video.popularity || 0,
        rank: video.rank,
      })),
      _monitor_complete: monitorComplete,
      _download_complete: downloadComplete,
      _removed: removed,
    }
  }

  const fixtureUpdates = createFixtureUpdateBatcher(async fixtureIds => {
    try {
      const ids = fixtureIds.join(',')
      const fixtures = await goJson<GoFixture[]>(`/api/v1/fixtures?ids=${encodeURIComponent(ids)}`)
      broadcast({
        type: 'fixture_update',
        fixture_ids: fixtureIds,
        fixtures: fixtures.map(reshapeFixture),
      })
    } catch (error) {
      console.error('[found-footy] targeted fixture update failed:', (error as Error).message)
      broadcast({ type: 'resync', reason: 'fixture-update-failed' })
    }
  })

  async function forwardEventVideo(payload: { event_id?: unknown; fixture_id?: unknown }) {
    const eventId = typeof payload.event_id === 'string' ? payload.event_id : ''
    const fixtureId = typeof payload.fixture_id === 'number' ? payload.fixture_id : 0
    if (!eventId || !Number.isSafeInteger(fixtureId) || fixtureId <= 0) return

    try {
      const events = await goJson<GoEvent[]>(`/api/v1/events?ids=${encodeURIComponent(eventId)}`)
      const event = events.find(candidate => candidate.id === eventId && candidate.fixture_id === fixtureId)
      broadcast({
        type: 'event_video',
        event_id: eventId,
        fixture_id: fixtureId,
        event: event ? reshapeEventVideo(event) : null,
      })
    } catch (error) {
      console.error('[found-footy] targeted event video update failed:', (error as Error).message)
      broadcast({ type: 'resync', reason: 'event-video-failed' })
    }
  }

  // ---- NATS live-feed bridge: found-footy.<env>.> -> targeted browser SSE ----
  // REST remains the recovery authority. The status subject is an inline
  // projection; fixture and event dirty-signals are resolved once in the BFF
  // and broadcast to every connected browser.
  if (config.natsUrl) {
    void (async () => {
      let nats: typeof import('nats')
      try { nats = await import('nats') } catch (error) {
        console.error('[found-footy] NATS client not installed — bridge disabled:', (error as Error).message)
        return
      }
      const jc = nats.JSONCodec()
      const connectLoop = async () => {
        try {
          const nc = await nats.connect({
            servers: config.natsUrl,
            name: 'vedanta-systems-bff',
            maxReconnectAttempts: -1,
            reconnectTimeWait: 2000,
          })
          console.log(`✅ [found-footy] NATS bridge connected (${config.natsUrl})`)
          broadcast({ type: 'resync', reason: 'nats-connect' })
          void (async () => {
            for await (const status of nc.status()) {
              if (status.type === 'reconnect') {
                console.log('[found-footy] NATS reconnected — resync')
                broadcast({ type: 'resync', reason: 'nats-reconnect' })
              }
            }
          })().catch(() => { /* status stream closed */ })

          const envName = config.env || 'dev'
          const sub = nc.subscribe(`found-footy.${envName}.>`)
          for await (const message of sub) {
            try {
              const envelope = jc.decode(message.data) as FoundFootyEnvelope
              const subject: string = envelope?.subject || message.subject || ''
              const topic = foundFootyLiveTopic(subject)
              if (topic === 'fixture_status') {
                await fixtureUpdates.flush()
                const fixtures = envelope?.payload?.fixtures
                if (Array.isArray(fixtures) && fixtures.length > 0) {
                  broadcast({ type: 'fixture_status', fixtures: fixtures as FixtureStatusEntry[] })
                }
              } else if (topic === 'fixture_update') {
                const fixtureIds = envelope?.payload?.fixture_ids
                if (Array.isArray(fixtureIds)) fixtureUpdates.add(fixtureIds)
              } else if (topic === 'event_video') {
                await fixtureUpdates.flush()
                await forwardEventVideo(envelope?.payload || {})
              }
            } catch (error) {
              console.error('[found-footy] NATS message handling failed:', (error as Error).message)
              broadcast({ type: 'resync', reason: 'nats-message-failed' })
            }
          }
        } catch (error) {
          console.error('[found-footy] NATS bridge connect failed, retrying in 5s:', (error as Error).message)
          setTimeout(connectLoop, 5000)
        }
      }
      connectLoop()
    })()
  }

  const localDate = (iso: string, offsetMin: number) =>
    new Date(new Date(iso).getTime() + offsetMin * 60_000).toISOString().slice(0, 10)

  // ============ ROUTES ============

  // GET /health - is the found-footy read API reachable?
  router.get('/health', async (_req: Request, res: Response) => {
    let up = false
    try { up = (await fetch(`${API}/healthz`, { signal: AbortSignal.timeout(5_000) })).ok } catch { up = false }
    res.json({
      status: up ? 'ok' : 'degraded',
      health: { api: { status: up ? 'up' : 'down' }, overall: up ? 'healthy' : 'unhealthy' },
      connectedClients: sseClients.size,
      timestamp: new Date().toISOString(),
    })
  })

  // GET /fixtures - one complete authoritative fixture window. Presentation
  // grouping comes from presentation_state; Found Footy's processing state is
  // preserved as data but never becomes a browser bucket.
  router.get('/fixtures', async (_req: Request, res: Response) => {
    try {
      const all = await goJson<GoFixture[]>('/api/v1/fixtures')
      res.json({ fixtures: all.map(reshapeFixture) })
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
        const teamMatch = has(g.home.name) || has(g.away.name)
        const base = reshapeFixture(g)
        const matchedEventIds = base.events
          .filter(e => has(e.player?.name) || has(e.assist?.name))
          .map(e => e._event_id)
        const fixture: SearchFixture = {
          ...base,
          _search: { teamMatch, matchedEventIds, matchCount: matchedEventIds.length + (teamMatch ? 1 : 0) },
        }
        return fixture
      })

      // Group by UTC date, newest first (the frontend regroups by tz-local date).
      const byDate = new Map<string, SearchFixture[]>()
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
      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0])
      // Unhandled stream 'error' crashes the request (→ 500). A client seek/disconnect
      // aborts the upstream — expected; swallow it, log anything genuinely unexpected.
      nodeStream.on('error', (error: unknown) => {
        const err = error as { name?: string; code?: string; message?: string }
        if (err?.name !== 'AbortError' && err?.code !== 'ABORT_ERR') {
          console.error('[found-footy] stream:', err?.message)
        }
        if (!res.writableEnded) res.destroy()
      })
      res.on('error', () => nodeStream.destroy())
      nodeStream.pipe(res)
    } catch (error) {
      const err = error as { name?: string; code?: string; message?: string }
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

  // GET /stream - connected/health/heartbeat plus targeted NATS-backed updates.
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
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let closed = false
    const cleanup = () => {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      sseClients.delete(res)
    }
    req.once('close', cleanup)

    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
    let up = false
    try { up = (await fetch(`${API}/healthz`, { signal: AbortSignal.timeout(5_000) })).ok } catch { up = false }
    if (closed) return
    res.write(`data: ${JSON.stringify({ type: 'health', health: { api: { status: up ? 'up' : 'down' }, overall: up ? 'healthy' : 'unhealthy' } })}\n\n`)

    heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`)
    }, 30000)
  })

  return router
}
