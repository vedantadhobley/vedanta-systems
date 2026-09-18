import assert from 'node:assert/strict'
import { createConnection, createServer as createTcpServer, type AddressInfo, type Socket } from 'node:net'
import { createServer, type RequestListener, type Server } from 'node:http'
import test, { type TestContext } from 'node:test'

import express from 'express'
import type { Fixture, FootyEvent, SearchFixture } from '../../types/found-footy'
import { applyFootyLiveEvent, isFootyLiveEvent } from '../../lib/found-footy-live'
import { createFootyDiagnostics, type FootyDiagnostic } from '../../lib/found-footy-diagnostics'
import { createFixtureUpdateBatcher, createFoundFootyRouter, foundFootyLiveTopic } from './found-footy'
import { createEventUpdateForwarder, type BridgeMessage } from './found-footy-live-bridge'
import { loadNatsAuthenticator } from '../nats-auth'

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

function goEvent(
  id = 'a4dbb584-bda7-4495-8eea-0736d252bcf0',
  fixtureId = 1,
  presentationState: FootyEvent['presentation_state'] = 'searching',
) {
  return {
    id,
    fixture_id: fixtureId,
    type: 'goal',
    detail: 'Penalty',
    kind: 'goal' as const,
    presentation_state: presentationState,
    minute: 62,
    extra: null,
    team: { id: fixtureId * 2, name: 'Home' },
    player: { id: 10, name: 'Scorer' },
    assist: null,
    presentation: {
      label: 'Penalty Goal', team_side: 'home' as const,
      score_before: { home: 0, away: 0 }, score_after: { home: 1, away: 0 },
    },
    videos: [{
      share_id: 's_5b7b39d48133', url: '/api/v1/videos/s_5b7b39d48133', rank: 1,
      verified: true, extracted_minute: 62, popularity: 2, width: 1280, height: 720, duration_ms: 12_000,
    }],
    phase: presentationState === 'complete' ? 'complete' : 'searching',
    debounce_count: 3,
  }
}

function goFixture(
  id = 1,
  presentationState: Fixture['presentation_state'] = 'playing',
  status = '2H',
) {
  return {
    id,
    state: 'active',
    kickoff: `2026-08-23T${String(10 + id).padStart(2, '0')}:00:00Z`,
    league: {
      id: 140, name: 'La Liga', season: 2026, country: 'Spain', priority: 20,
      round: 'Regular Season - 5', round_label: 'Matchweek 5', round_kind: 'regular_season',
    },
    home: { id: id * 2, name: 'Home', score: 2, winner: true },
    away: { id: id * 2 + 1, name: 'Away', score: 1, winner: false },
    presentation_state: presentationState,
    clock: { minute: presentationState === 'playing' ? 62 : null, extra: null },
    status: { short: status, long: status },
    display: presentationState === 'playing' ? 'clock' : 'status',
    penalty: null,
    last_activity_at: '2026-08-23T13:00:00Z',
    events: [goEvent(undefined, id)],
  }
}

async function startPortal(t: TestContext,
  handler: RequestListener) {
  const upstream = createServer(handler)
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const app = express()
  app.use('/api/found-footy', createFoundFootyRouter({ apiUrl: `http://127.0.0.1:${upstreamPort}`, env: 'dev' }))
  const portal = createServer(app)
  const portalPort = await listen(portal)
  t.after(() => close(portal))
  return `http://127.0.0.1:${portalPort}/api/found-footy`
}

test('fixtures endpoint mirrors the public presentation contract and removes legacy interpretation', async t => {
  const source = goFixture()
  const base = await startPortal(t, (request, response) => {
    assert.equal(request.url, '/api/v1/fixtures')
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify([source]))
  })
  const response = await fetch(`${base}/fixtures`)
  assert.equal(response.status, 200)
  const body = await response.json() as { fixtures: Fixture[] }
  const fixture = body.fixtures[0]
  const event = fixture.events[0]
  assert.equal(fixture.id, 1)
  assert.equal(fixture.kickoff, source.kickoff)
  assert.equal(fixture.league.priority, 20)
  assert.equal(fixture.league.round_label, 'Matchweek 5')
  assert.equal(fixture.home.score, 2)
  assert.equal(fixture.last_activity_at, source.last_activity_at)
  assert.equal(event.kind, 'goal')
  assert.equal(event.presentation_state, 'searching')
  assert.equal(event.presentation.label, 'Penalty Goal')
  assert.equal(event.videos[0].share_id, 's_5b7b39d48133')
  assert.equal(event.videos[0].url, '/api/found-footy/video/s_5b7b39d48133')
  assert.equal('state' in fixture, false)
  assert.equal('round' in fixture.league, false)
  assert.equal('type' in event, false)
  assert.equal('phase' in event, false)
  assert.equal('_event_id' in event, false)
})

test('search passes through authoritative provenance as a flat fixture collection', async t => {
  const source = {
    ...goFixture(),
    search_match: {
      competition: false, home_team: false, away_team: false,
      events: [{ event_id: goEvent().id, player: true, assist: false }],
    },
  }
  const base = await startPortal(t, (request, response) => {
    assert.equal(request.url, '/api/v1/search?q=mbappe')
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify([source]))
  })
  const body = await (await fetch(`${base}/search?q=mbappe`)).json() as {
    fixtures: SearchFixture[]; totalFixtures: number
  }
  assert.equal(body.totalFixtures, 1)
  assert.equal(body.fixtures[0].events.length, 1)
  assert.deepEqual(body.fixtures[0].search_match, source.search_match)
  assert.equal('results' in body, false)
})

test('targeted fixture recovery forwards only validated IDs', async t => {
  const paths: string[] = []
  const base = await startPortal(t, (request, response) => {
    paths.push(request.url!)
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify([goFixture()]))
  })
  assert.equal((await fetch(`${base}/fixtures?ids=1`)).status, 200)
  assert.equal((await fetch(`${base}/fixtures?ids=invalid`)).status, 400)
  assert.deepEqual(paths, ['/api/v1/fixtures?ids=1'])
})

test('fixture update batcher coalesces bursty IDs', async () => {
  const batches: number[][] = []
  const batcher = createFixtureUpdateBatcher(async ids => { batches.push(ids) }, 10)
  batcher.add([1530158, 1530163])
  batcher.add([1530163, 1530170])
  await new Promise(resolve => setTimeout(resolve, 30))
  await batcher.flush()
  batcher.close()
  assert.deepEqual(batches, [[1530158, 1530163, 1530170]])
})

test('routes only the current Found Footy subjects', () => {
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.status'), 'fixture_status')
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.update'), 'fixture_update')
  assert.equal(foundFootyLiveTopic('found-footy.prod.event.update'), 'event_update')
  assert.equal(foundFootyLiveTopic('found-footy.prod.event.video'), null)
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.clock'), null)
})

test('event forwarding preserves both IDs and zero-clip completion', async () => {
  const source = goEvent(undefined, 1, 'complete')
  source.videos = []
  const event: FootyEvent = {
    id: source.id, fixture_id: source.fixture_id, kind: source.kind,
    presentation_state: source.presentation_state, minute: source.minute, extra: source.extra,
    team: source.team, player: source.player, assist: source.assist,
    presentation: source.presentation, videos: source.videos, debounce_count: source.debounce_count,
  }
  const sent: BridgeMessage[] = []
  const forward = createEventUpdateForwarder({
    fetchEvent: async () => event,
    fetchFixtures: async () => { throw new Error('unexpected parent read') },
    broadcast: message => sent.push(message), record: () => {},
  })
  await forward({ event_id: event.id, fixture_id: 1 })
  assert.deepEqual(sent, [{ type: 'event_update', event_id: event.id, fixture_id: 1, event }])
  assert.equal(isFootyLiveEvent(sent[0]), true)
})

for (const outcome of ['empty', 'failed'] as const) {
  test(`${outcome} event fetch recovers a complete parent instead of sending a deletion`, async () => {
    const sent: BridgeMessage[] = []
    const recovered = portalFixture()
    const forward = createEventUpdateForwarder({
      fetchEvent: async () => { if (outcome === 'failed') throw new Error('offline'); return null },
      fetchFixtures: async ids => { assert.deepEqual(ids, [1]); return [recovered] },
      broadcast: message => sent.push(message), record: () => {},
    })
    await forward({ event_id: goEvent().id, fixture_id: 1 })
    assert.deepEqual(sent, [{ type: 'fixture_update', fixture_ids: [1], fixtures: [recovered] }])
  })
}

function portalFixture(): Fixture {
  return {
    id: 1, kickoff: '2026-08-23T11:00:00Z', presentation_state: 'playing',
    clock: { minute: 62, extra: null }, status: { short: '2H', long: 'Second Half' }, display: 'clock',
    league: { id: 140, name: 'La Liga', country: 'Spain', season: 2026, priority: 20,
      round_label: 'Matchweek 5', round_kind: 'regular_season' },
    home: { id: 2, name: 'Home', score: 1, winner: null },
    away: { id: 3, name: 'Away', score: 0, winner: null },
    penalty: null, last_activity_at: '2026-08-23T11:10:00Z', events: [],
  }
}

test('failed event and parent recovery requests resynchronization', async () => {
  const sent: BridgeMessage[] = []
  const records: FootyDiagnostic[] = []
  const forward = createEventUpdateForwarder({
    fetchEvent: async () => null, fetchFixtures: async () => [],
    broadcast: message => sent.push(message), record: entry => records.push(entry),
  })
  await forward({ event_id: goEvent().id, fixture_id: 1 })
  assert.deepEqual(sent, [{ type: 'resync', reason: 'event-update-recovery-failed' }])
  assert.deepEqual(records.map(entry => [entry.stage, entry.outcome]), [
    ['targeted_event', 'recovery'], ['targeted_fixture', 'failed'],
  ])
})

test('stale event fetch from an earlier NATS generation is ignored', async () => {
  let current = true
  const sent: BridgeMessage[] = []
  const forward = createEventUpdateForwarder({
    fetchEvent: async () => { current = false; return null },
    fetchFixtures: async () => { throw new Error('must not recover stale data') },
    broadcast: message => sent.push(message), record: () => {},
  })
  await forward({ event_id: goEvent().id, fixture_id: 1 }, () => current)
  assert.deepEqual(sent, [])
})

test('real NATS to REST to SSE preserves direct event presentation and reconnect recovery', {
  skip: !process.env.NATS_TEST_URL,
  timeout: 25_000,
}, async t => {
  const { connect, JSONCodec } = await import('nats')
  const nc = await connect({
    servers: process.env.NATS_TEST_URL!,
    authenticator: await loadNatsAuthenticator(process.env.NATS_TEST_PUBLISHER_CREDS),
  })
  t.after(() => nc.close())
  const codec = JSONCodec()
  const sockets = new Set<Socket>()
  let allowConnection!: () => void
  const ready = new Promise<void>(resolve => { allowConnection = resolve })
  const broker = new URL(process.env.NATS_TEST_URL!)
  const relay = createTcpServer(async socket => {
    sockets.add(socket)
    socket.pause()
    await ready
    const remote = createConnection({ host: broker.hostname, port: Number(broker.port) })
    sockets.add(remote)
    socket.on('error', () => remote.destroy())
    remote.on('error', () => socket.destroy())
    socket.on('close', () => { sockets.delete(socket); remote.destroy() })
    remote.on('close', () => { sockets.delete(remote); socket.destroy() })
    socket.pipe(remote).pipe(socket)
    socket.resume()
  })
  await new Promise<void>(resolve => relay.listen(0, '127.0.0.1', resolve))
  t.after(() => { for (const socket of sockets) socket.destroy(); relay.close() })

  const relayPort = (relay.address() as AddressInfo).port
  const eventId = goEvent().id
  let sourceEvent = goEvent(eventId, 1, 'searching')
  sourceEvent.videos = []
  const sourceFixture = { ...goFixture(), events: [sourceEvent] }
  const paths: string[] = []
  const upstream = createServer((request, response) => {
    paths.push(request.url!)
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/healthz') response.end('{}')
    else if (request.url === `/api/v1/events?ids=${eventId}`) response.end(JSON.stringify([sourceEvent]))
    else response.end(JSON.stringify([{ ...sourceFixture, events: [sourceEvent] }]))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))

  const bridge = new AbortController()
  t.after(() => bridge.abort())
  const app = express()
  app.use(createFoundFootyRouter({
    apiUrl: `http://127.0.0.1:${upstreamPort}`,
    natsUrl: `nats://127.0.0.1:${relayPort}`,
    env: 'dev',
    signal: bridge.signal,
    natsCredsPath: process.env.NATS_TEST_CONSUMER_CREDS,
  }))
  const portal = createServer(app)
  const portalPort = await listen(portal)
  t.after(() => { portal.closeAllConnections(); return close(portal) })

  const streamAbort = new AbortController()
  const stream = await fetch(`http://127.0.0.1:${portalPort}/stream`, { signal: streamAbort.signal })
  t.after(() => streamAbort.abort())
  const reader = stream.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const next = async (type: string): Promise<Record<string, unknown>> => {
    while (!streamAbort.signal.aborted) {
      const boundary = buffer.indexOf('\n\n')
      if (boundary >= 0) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        if (!chunk.startsWith('data: ')) continue
        const message = JSON.parse(chunk.slice(6)) as Record<string, unknown>
        if (message.type === type) return message
        continue
      }
      const { value, done } = await reader.read()
      if (done) throw new Error('SSE ended')
      buffer += decoder.decode(value, { stream: true })
    }
    throw new Error('SSE aborted')
  }

  assert.equal((await next('connected')).type, 'connected')
  allowConnection()
  assert.equal((await next('resync')).reason, 'nats-connect')
  const snapshot = async () => {
    const response = await fetch(`http://127.0.0.1:${portalPort}/fixtures`)
    return (await response.json() as { fixtures: Fixture[] }).fixtures
  }
  let client = await snapshot()
  assert.equal(client[0].events[0].presentation_state, 'searching')

  sourceEvent = { ...sourceEvent, presentation_state: 'complete', phase: 'complete' }
  const publish = (subject: string) => nc.publish(subject, codec.encode({
    version: 1, subject, payload: { event_id: eventId, fixture_id: 1 },
  }))
  publish('found-footy.dev.event.video')
  publish('found-footy.dev.event.update')
  await nc.flush()
  const update = await next('event_update')
  assert.equal(isFootyLiveEvent(update), true)
  if (!isFootyLiveEvent(update)) throw new Error('invalid update')
  client = applyFootyLiveEvent(client, update)
  assert.equal(client[0].events[0].presentation_state, 'complete')
  assert.deepEqual(client[0].events[0].videos, [])
  assert.equal(client[0].last_activity_at, sourceFixture.last_activity_at)
  assert.equal(paths.filter(path => path.startsWith('/api/v1/events')).length, 1)
  assert.equal(paths.some(path => path.startsWith('/api/v1/fixtures?')), false)

  for (const socket of sockets) socket.destroy()
  assert.equal((await next('resync')).reason, 'nats-reconnect')
  client = await snapshot()
  assert.equal(client[0].events[0].presentation_state, 'complete')
  assert.equal(paths.filter(path => path === '/api/v1/fixtures').length, 2)
})

test('retained event route preserves historical context and probes media without downloading it', async t => {
  const eventId = '3b414e73-58ef-4e97-9733-41f546bda044'
  const shareId = 's_5b7b39d48133'
  const removed = {
    ...goEvent(eventId, 6, 'removed'),
    presentation: {
      ...goEvent(eventId, 6, 'removed').presentation,
      score_before: null,
      score_after: null,
    },
  }
  let garageRequests = 0
  const base = await startPortal(t, (request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === `/api/v1/events?ids=${eventId}`) response.end(JSON.stringify([removed]))
    else if (request.url === '/api/v1/fixtures?ids=6') response.end(JSON.stringify([{ ...goFixture(6, 'finished', 'FT'), events: [] }]))
    else if (request.url === `/api/v1/videos/${shareId}`) {
      response.statusCode = 302; response.setHeader('Location', '/garage/object.mp4'); response.end()
    } else if (request.url === '/garage/object.mp4') { garageRequests++; response.end('bytes') }
    else { response.statusCode = 404; response.end() }
  })
  const response = await fetch(`${base}/event/${eventId}?share_id=${shareId}`)
  assert.equal(response.status, 200)
  const body = await response.json() as { fixture: Fixture; media: { state: string } }
  assert.equal(body.fixture.id, 6)
  assert.equal(body.fixture.events[0].id, eventId)
  assert.equal(body.fixture.events[0].presentation_state, 'removed')
  assert.equal(body.fixture.events[0].presentation.score_after, null)
  assert.equal(body.media.state, 'available')
  assert.equal(garageRequests, 0)
})

test('diagnostics keep bounded storage and report suppressed records', () => {
  let now = 0
  const emitted: Array<{ suppressed: number }> = []
  const diagnostics = createFootyDiagnostics(entry => emitted.push(entry), () => now)
  for (let i = 0; i < 250; i++) diagnostics.record({ stage: 'client_apply', outcome: 'ignored' })
  assert.equal(diagnostics.snapshot().recent.length, 100)
  assert.equal(emitted.length, 60)
  now = 60_000
  diagnostics.record({ stage: 'client_apply', outcome: 'failed' })
  assert.equal(emitted[60].suppressed, 190)
})
