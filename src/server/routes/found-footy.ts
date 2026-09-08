import { Router, Response, Request } from 'express'
import { Readable } from 'node:stream'
import type {
  Fixture,
  GoalEvent,
  SearchFixture,
  SharedMediaState,
} from '../../types/found-footy'
import { withEventContext, type EventProjection } from '../../lib/found-footy-event'
import { createFootyDiagnostics } from '../../lib/found-footy-diagnostics'
import { createEventUpdateForwarder, createFixtureUpdateBatcher, foundFootyLiveTopic, type BridgeMessage } from './found-footy-live-bridge'

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
  signal?: AbortSignal // shuts down this router's bridge with its owning server
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

export { createFixtureUpdateBatcher, foundFootyLiveTopic } from './found-footy-live-bridge'

// Factory function to create Found Footy router with configuration
export function createFoundFootyRouter(config: FoundFootyConfig): Router {
  const router = Router()
  const API = (config.apiUrl || '').replace(/\/$/, '')
  const isConfigured = !!API

  // Track connected SSE clients for the NATS -> browser bridge.
  const sseClients: Set<Response> = new Set()
  const diagnostics = createFootyDiagnostics(entry => console.info('[found-footy-live]', JSON.stringify(entry)))
  let natsGeneration = 0

  function broadcast(event: BridgeMessage) {
    const msg = `data: ${JSON.stringify(event)}\n\n`
    let delivered = 0
    let failed = 0
    sseClients.forEach(client => {
      try {
        if (client.destroyed || client.writableEnded) throw new Error('closed-client')
        if (!client.write(msg) && client.writableLength > 1_048_576) {
          // Bound slow-client buffering. Closing forces snapshot recovery.
          failed++
          sseClients.delete(client)
          client.destroy()
        } else delivered++
      } catch {
        failed++
        sseClients.delete(client)
        client.destroy()
      }
    })
    diagnostics.record({ stage: 'sse_delivery', outcome: failed ? 'failed' : delivered ? 'written' : 'no-clients',
      count: delivered, ...(event.type === 'event_update' ? { event_id: event.event_id, fixture_id: event.fixture_id }
        : event.type === 'fixture_update' && event.fixture_ids.length === 1 ? { fixture_id: event.fixture_ids[0] } : {}) })
  }

  // ---- helpers ----
  async function goJson<T>(path: string): Promise<T> {
    const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) throw new Error(`found-footy-api ${path} -> ${r.status}`)
    return r.json() as Promise<T>
  }

  const videoUrl = (shareId: string) => `/api/found-footy/video/${shareId}`
  const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const shareIdPattern = /^s_[a-f0-9]{12}$/i

  async function probeMediaState(shareId: string): Promise<SharedMediaState> {
    const response = await fetch(`${API}/api/v1/videos/${encodeURIComponent(shareId)}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
    await response.body?.cancel()
    if (response.status === 302) return 'available'
    if (response.status === 410) return 'removed'
    if (response.status === 404) return 'unknown'
    throw new Error(`found-footy-api media probe ${shareId} -> ${response.status}`)
  }

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

  function reshapeEvent(e: GoEvent): EventProjection | null {
    const kind = e.type === 'goal' ? 'goal'
      : e.type === 'card' && /red/i.test(e.detail || '') ? 'card'
      : e.type === 'missed penalty' ? 'penalty-miss' : null
    if (!kind) return null
    const videos = [...(e.videos || [])].sort((a, b) => a.rank - b.rank)
    const { monitorComplete, downloadComplete, removed } = legacyEventFlags(e)
    return {
      type: 'Goal',
      _kind: kind,
      detail: kind === 'card' ? 'Red Card' : kind === 'penalty-miss' ? 'Missed Penalty' : e.detail,
      time: { elapsed: e.minute, extra: e.extra },
      team: { ...e.team, logo: '' },
      player: e.player || { id: null, name: null },
      assist: kind === 'goal' && e.assist ? e.assist : { id: null, name: null },
      comments: null,
      _event_id: e.id,
      _twitter_search: '',
      _discovered_videos: [],
      _s3_urls: videos.map(v => videoUrl(v.share_id)),
      _s3_videos: videos.map(v => ({
        url: videoUrl(v.share_id), perceptual_hash: '',
        resolution_score: (v.width || 0) * (v.height || 0),
        popularity: v.popularity || 0, rank: v.rank,
      })),
      _perceptual_hashes: [],
      _monitor_complete: monitorComplete,
      _download_complete: downloadComplete,
      _removed: removed,
    }
  }

  function reshapeEvents(g: GoFixture): GoalEvent[] {
    const events = (g.events || []).map(reshapeEvent)
      .filter((event): event is EventProjection => event !== null)
    return withEventContext({
      teams: { home: g.home, away: g.away },
      fixture: { date: g.kickoff },
    }, events)
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

  const fetchFixtures = async (ids: number[]) => {
    const fixtures = await goJson<GoFixture[]>(`/api/v1/fixtures?ids=${encodeURIComponent(ids.join(','))}`)
    return fixtures.map(reshapeFixture)
  }

  const fixtureUpdates = createFixtureUpdateBatcher(async fixtureIds => {
    const generation = natsGeneration
    try {
      const fixtures = await fetchFixtures(fixtureIds)
      if (generation !== natsGeneration) {
        diagnostics.record({ stage: 'targeted_fixture', outcome: 'ignored', reason: 'connection-changed' })
        return
      }
      diagnostics.record({ stage: 'targeted_fixture', outcome: 'fetched', count: fixtures.length })
      broadcast({
        type: 'fixture_update',
        fixture_ids: fixtureIds,
        fixtures,
      })
    } catch (error) {
      if (generation !== natsGeneration) return
      diagnostics.record({ stage: 'targeted_fixture', outcome: 'failed' })
      broadcast({ type: 'resync', reason: 'fixture-update-failed' })
    }
  })

  const forwardEventUpdate = createEventUpdateForwarder({
    fetchEvent: async (eventId, fixtureId) => {
      const events = await goJson<GoEvent[]>(`/api/v1/events?ids=${encodeURIComponent(eventId)}`)
      const event = events.find(e => e.id === eventId && e.fixture_id === fixtureId)
      return event ? reshapeEvent(event) : null
    },
    fetchFixtures,
    broadcast,
    record: diagnostics.record,
  })

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
        if (config.signal?.aborted) return
        try {
          const nc = await nats.connect({
            servers: config.natsUrl,
            name: 'vedanta-systems-bff',
            maxReconnectAttempts: -1,
            reconnectTimeWait: 2000,
          })
          if (config.signal?.aborted) { await nc.close(); return }
          config.signal?.addEventListener('abort', () => { fixtureUpdates.close(); void nc.close() }, { once: true })
          console.log(`✅ [found-footy] NATS bridge connected (${config.natsUrl})`)
          void (async () => {
            for await (const status of nc.status()) {
              if (status.type === 'disconnect') natsGeneration++
              if (status.type === 'reconnect') {
                console.log('[found-footy] NATS reconnected — resync')
                broadcast({ type: 'resync', reason: 'nats-reconnect' })
              }
            }
          })().catch(() => { /* status stream closed */ })

          const envName = config.env || 'dev'
          const sub = nc.subscribe(`found-footy.${envName}.>`)
          await nc.flush()
          broadcast({ type: 'resync', reason: 'nats-connect' })
          for await (const message of sub) {
            try {
              const envelope = jc.decode(message.data) as FoundFootyEnvelope
              const subject = message.subject
              if (envelope.subject && envelope.subject !== subject) throw new Error('envelope subject mismatch')
              const topic = foundFootyLiveTopic(subject)
              const generation = natsGeneration
              diagnostics.record({ stage: 'nats_receipt', outcome: topic ? 'received' : 'ignored',
                ...(typeof envelope.payload?.event_id === 'string' ? { event_id: envelope.payload.event_id.slice(0, 36) } : {}),
                ...(typeof envelope.payload?.fixture_id === 'number' ? { fixture_id: envelope.payload.fixture_id } : {}) })
              if (topic === 'fixture_status') {
                await fixtureUpdates.flush()
                if (generation !== natsGeneration) {
                  diagnostics.record({ stage: 'nats_receipt', outcome: 'ignored', reason: 'connection-changed' })
                  continue
                }
                const fixtures = envelope?.payload?.fixtures
                if (Array.isArray(fixtures) && fixtures.length > 0) {
                  broadcast({ type: 'fixture_status', fixtures: fixtures as FixtureStatusEntry[] })
                }
              } else if (topic === 'fixture_update') {
                const fixtureIds = envelope?.payload?.fixture_ids
                if (Array.isArray(fixtureIds)) fixtureUpdates.add(fixtureIds)
              } else if (topic === 'event_update') {
                await fixtureUpdates.flush()
                if (generation !== natsGeneration) continue
                await forwardEventUpdate(envelope?.payload || {}, () => generation === natsGeneration)
              }
            } catch (error) {
              diagnostics.record({ stage: 'nats_receipt', outcome: 'failed' })
              broadcast({ type: 'resync', reason: 'nats-message-failed' })
            }
          }
        } catch (error) {
          if (config.signal?.aborted) return
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
  router.get('/fixtures', async (req: Request, res: Response) => {
    try {
      if (req.query.ids !== undefined) {
        const raw = String(req.query.ids)
        const ids = raw.split(',').map(Number)
        if (!/^\d+(,\d+)*$/.test(raw) || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
          res.status(400).json({ error: 'invalid fixture ids' })
          return
        }
        const fixtures = await fetchFixtures([...new Set(ids)])
        diagnostics.record({ stage: 'parent_recovery', outcome: fixtures.length ? 'fetched' : 'empty', count: fixtures.length,
          ...(ids.length === 1 ? { fixture_id: ids[0] } : {}) })
        res.json({ fixtures })
        return
      }
      const all = await goJson<GoFixture[]>('/api/v1/fixtures')
      res.json({ fixtures: all.map(reshapeFixture) })
    } catch (error) {
      console.error('[found-footy] /fixtures:', (error as Error).message)
      diagnostics.record({ stage: req.query.ids === undefined ? 'snapshot' : 'parent_recovery', outcome: 'failed' })
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

  // GET /event/:eventId?share_id=<share-id> - retained context for a GUI share.
  // Targeted reads reach outside the bounded fixture snapshot. A directly
  // requested removed event is merged back into its fixture projection so the
  // browser can render the historical row. Media is probed without following
  // the Garage redirect; this route never downloads video bytes.
  router.get('/event/:eventId', async (req: Request, res: Response) => {
    const eventId = req.params.eventId
    const rawShareId = req.query.share_id
    const shareId = typeof rawShareId === 'string' && rawShareId ? rawShareId : null
    if (!eventIdPattern.test(eventId)) {
      return res.status(400).json({ error: 'invalid event id' })
    }
    if (rawShareId !== undefined && (!shareId || !shareIdPattern.test(shareId))) {
      return res.status(400).json({ error: 'invalid share id' })
    }

    try {
      const events = await goJson<GoEvent[]>(`/api/v1/events?ids=${encodeURIComponent(eventId)}`)
      const event = events.find(candidate => candidate.id === eventId)
      if (!event) return res.status(404).json({ eventId, found: false })

      const [fixtures, mediaState] = await Promise.all([
        goJson<GoFixture[]>(`/api/v1/fixtures?ids=${event.fixture_id}`),
        shareId ? probeMediaState(shareId) : Promise.resolve(null),
      ])
      const fixture = fixtures.find(candidate => candidate.id === event.fixture_id)
      if (!fixture) return res.status(404).json({ eventId, found: false })

      const targetedFixture: GoFixture = {
        ...fixture,
        events: [
          ...(fixture.events || []).filter(candidate => candidate.id !== event.id),
          event,
        ],
      }
      res.json({
        eventId,
        date: fixture.kickoff.slice(0, 10),
        kickoff: fixture.kickoff,
        found: true,
        fixture: reshapeFixture(targetedFixture),
        media: shareId ? { share_id: shareId, state: mediaState } : null,
      })
    } catch (error) {
      console.error('[found-footy] /event:', (error as Error).message)
      res.status(502).json({ error: 'found-footy api unavailable' })
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
