import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createServer as createTcpServer, createConnection, type Socket } from 'node:net'
import { createServer, type Server } from 'node:http'
import test from 'node:test'

import express from 'express'
import type { Fixture } from '../../types/found-footy'

import { createFixtureUpdateBatcher, createFoundFootyRouter, foundFootyLiveTopic } from './found-footy'
import { createEventUpdateForwarder, type BridgeMessage } from './found-footy-live-bridge'
import { applyFootyLiveEvent, isFootyLiveEvent } from '../../lib/found-footy-live'
import { createFootyDiagnostics, type FootyDiagnostic } from '../../lib/found-footy-diagnostics'
import { loadNatsAuthenticator } from '../nats-auth'
import type { EventProjection } from '../../lib/found-footy-event'

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
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}

function goFixture(
  id: number,
  state: 'staging' | 'active' | 'completed',
  presentationState: 'playing' | 'finished' | 'upcoming' | 'deferred',
  status: string,
  lastActivityAt: string | null = null,
) {
  return {
    id,
    state,
    kickoff: `2026-08-23T${String(10 + id).padStart(2, '0')}:00:00Z`,
    league: { id: 1, name: 'Test League', season: 2026 },
    home: { id: id * 2, name: 'Home', score: 2, winner: true },
    away: { id: id * 2 + 1, name: 'Away', score: 1, winner: false },
    presentation_state: presentationState,
    clock: { minute: presentationState === 'playing' ? 62 : null, extra: null },
    status: { short: status, long: status },
    display: presentationState === 'playing' ? 'clock' : 'status',
    penalty: id === 5 ? { home: 4, away: 3 } : null,
    last_activity_at: lastActivityAt,
    events: [],
  }
}

test('fixtures endpoint exposes the breaking FF-077 presentation shape as one collection', async t => {
  const upstreamFixtures = [
    goFixture(1, 'active', 'deferred', 'PST'),
    goFixture(2, 'active', 'upcoming', 'NS'),
    goFixture(3, 'completed', 'playing', '2H'),
    goFixture(4, 'active', 'finished', 'FT', '2026-08-23T13:00:00Z'),
    goFixture(5, 'completed', 'finished', 'PEN', '2026-08-23T13:00:00Z'),
  ]
  const upstream = createServer((request, response) => {
    if (request.url === '/api/v1/fixtures') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(upstreamFixtures))
      return
    }
    response.statusCode = 404
    response.end()
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))

  const app = express()
  app.use('/api/found-footy', createFoundFootyRouter({
    apiUrl: `http://127.0.0.1:${upstreamPort}`,
    env: 'dev',
  }))
  const portal = createServer(app)
  const portalPort = await listen(portal)
  t.after(() => close(portal))

  const response = await fetch(`http://127.0.0.1:${portalPort}/api/found-footy/fixtures`)
  assert.equal(response.status, 200)
  const body = await response.json() as {
    fixtures: Array<Fixture & { fixture: Fixture['fixture'] & { status?: unknown } }>
  }

  assert.deepEqual(body.fixtures.map(fixture => fixture._id), [1, 2, 3, 4, 5])
  const terminal = body.fixtures.find(fixture => fixture._id === 4)!
  assert.equal(terminal.state, 'active')
  assert.equal(terminal.presentation_state, 'finished')
  assert.deepEqual(terminal.clock, { minute: null, extra: null })
  assert.deepEqual(terminal.status, { short: 'FT', long: 'FT' })
  assert.equal(terminal.display, 'status')
  assert.equal(terminal.fixture.status, undefined)
  assert.equal(terminal._last_activity, '2026-08-23T13:00:00Z')
  assert.equal(terminal.teams.home.winner, true)
  assert.deepEqual(body.fixtures.find(fixture => fixture._id === 5)?.score.penalty, { home: 4, away: 3 })
})

test('fixture update batcher unions bursty IDs before one targeted fetch', async () => {
  const batches: number[][] = []
  const batcher = createFixtureUpdateBatcher(async ids => { batches.push(ids) }, 10)
  batcher.add([1530158, 1530163])
  batcher.add([1530163, 1530170])
  await new Promise(resolve => setTimeout(resolve, 30))
  await batcher.flush()
  batcher.close()

  assert.deepEqual(batches, [[1530158, 1530163, 1530170]])
})

test('routes fixture status/update and event.update without either legacy subject', () => {
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.status'), 'fixture_status')
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.update'), 'fixture_update')
  assert.equal(foundFootyLiveTopic('found-footy.prod.event.update'), 'event_update')
  assert.equal(foundFootyLiveTopic('found-footy.prod.event.video'), null)
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.clock'), null)
})

test('targeted fixture recovery forwards only validated IDs to the producer', async t => {
  const paths: string[] = []
  const upstream = createServer((request, response) => {
    paths.push(request.url!)
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify([goFixture(1, 'active', 'playing', '2H')]))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const app = express()
  app.use(createFoundFootyRouter({ apiUrl: `http://127.0.0.1:${upstreamPort}` }))
  const portal = createServer(app)
  const portalPort = await listen(portal)
  t.after(() => close(portal))
  const response = await fetch(`http://127.0.0.1:${portalPort}/fixtures?ids=1`)
  assert.equal(response.status, 200)
  assert.equal(((await response.json()) as { fixtures: Fixture[] }).fixtures[0]._id, 1)
  assert.equal((await fetch(`http://127.0.0.1:${portalPort}/fixtures?ids=invalid`)).status, 400)
  assert.deepEqual(paths, ['/api/v1/fixtures?ids=1'])
})

test('event forwarding preserves both IDs and carries complete zero-clip completion for client insertion', async () => {
  const eventId = 'a4dbb584-bda7-4495-8eea-0736d252bcf0'
  const event: EventProjection = {
    type: 'Goal', _kind: 'penalty-miss', detail: 'Missed Penalty',
    time: { elapsed: 90, extra: 4 }, team: { id: 2, name: 'Home' },
    player: { id: 10, name: 'Scorer' }, assist: { id: null, name: null }, comments: null,
    _event_id: eventId, _s3_urls: [], _s3_videos: [], _twitter_search: '',
    _discovered_videos: [], _perceptual_hashes: [], _monitor_complete: true,
    _download_complete: true, _removed: false,
  }
  const sent: BridgeMessage[] = []
  const forward = createEventUpdateForwarder({
    fetchEvent: async (id, parent) => { assert.equal(id, eventId); assert.equal(parent, 1); return event },
    fetchFixtures: async () => { throw new Error('unexpected parent read') },
    broadcast: message => sent.push(message), record: () => {},
  })
  await forward({ event_id: eventId, fixture_id: 1 })
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0], { type: 'event_update', event_id: eventId, fixture_id: 1, event })
  assert.equal(isFootyLiveEvent(sent[0]), true)
})

for (const outcome of ['empty', 'failed'] as const) {
  test(`${outcome} event fetch recovers an authoritative fixture without emitting deletion`, async () => {
    const sent: BridgeMessage[] = []
    const recovered = { _id: 1, events: [], _last_activity: 'unchanged' } as unknown as Fixture
    const forward = createEventUpdateForwarder({
      fetchEvent: async () => { if (outcome === 'failed') throw new Error('offline'); return null },
      fetchFixtures: async ids => { assert.deepEqual(ids, [1]); return [recovered] },
      broadcast: message => sent.push(message), record: () => {},
    })
    await forward({ event_id: 'a4dbb584-bda7-4495-8eea-0736d252bcf0', fixture_id: 1 })
    assert.deepEqual(sent, [{ type: 'fixture_update', fixture_ids: [1], fixtures: [recovered] }])
  })
}

test('failed event and parent recovery sends resync and records each failure', async () => {
  const sent: BridgeMessage[] = []
  const records: FootyDiagnostic[] = []
  const forward = createEventUpdateForwarder({
    fetchEvent: async () => null, fetchFixtures: async () => [],
    broadcast: message => sent.push(message), record: entry => records.push(entry),
  })
  await forward({ event_id: 'a4dbb584-bda7-4495-8eea-0736d252bcf0', fixture_id: 1 })
  assert.deepEqual(sent, [{ type: 'resync', reason: 'event-update-recovery-failed' }])
  assert.deepEqual(records.map(entry => [entry.stage, entry.outcome]), [
    ['targeted_event', 'recovery'], ['targeted_fixture', 'failed'],
  ])
})

test('diagnostics bound storage and log rate while reporting suppression', () => {
  let now = 0
  const emitted: Array<{ suppressed: number }> = []
  const diagnostics = createFootyDiagnostics(entry => emitted.push(entry), () => now)
  for (let i = 0; i < 250; i++) diagnostics.record({ stage: 'client_apply', outcome: 'ignored' })
  assert.equal(diagnostics.snapshot().recent.length, 100)
  assert.equal(emitted.length, 60)
  assert.equal(diagnostics.snapshot().suppressed, 190)
  now = 60_000
  diagnostics.record({ stage: 'client_apply', outcome: 'failed' })
  assert.equal(emitted[60].suppressed, 190)
})

test('stale event fetch from an earlier NATS connection is ignored', async () => {
  let current = true
  const messages: BridgeMessage[] = []
  const diagnostics: FootyDiagnostic[] = []
  const forward = createEventUpdateForwarder({
    fetchEvent: async () => { current = false; return null },
    fetchFixtures: async () => { throw new Error('stale fetch must not recover') },
    broadcast: message => messages.push(message), record: entry => diagnostics.push(entry),
  })
  await forward({ event_id: 'a4dbb584-bda7-4495-8eea-0736d252bcf0', fixture_id: 1 }, () => current)
  assert.deepEqual(messages, [])
  assert.equal(diagnostics[0].outcome, 'ignored')
})

test('real NATS to REST to SSE to client: hard cutover, zero-clip completion, and reconnect', {
  skip: !process.env.NATS_TEST_URL,
  timeout: 25_000,
}, async t => {
  const { connect, JSONCodec } = await import('nats')
  const nc = await connect({ servers: process.env.NATS_TEST_URL!,
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
  const eventId = 'a4dbb584-bda7-4495-8eea-0736d252bcf0'
  let event = { ...goEvent(eventId, 1, 'searching', 20), type: 'missed penalty' }
  const fixture = { ...goFixture(1, 'active', 'playing', '2H', '2026-08-23T11:20:00Z'), events: [event] }
  const paths: string[] = []
  const upstream = createServer((request, response) => {
    paths.push(request.url!)
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/healthz') response.end('{}')
    else if (request.url === `/api/v1/events?ids=${eventId}`) response.end(JSON.stringify([event]))
    else response.end(JSON.stringify([{ ...fixture, events: [event] }]))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const bridge = new AbortController()
  t.after(() => bridge.abort())
  const app = express()
  app.use(createFoundFootyRouter({ apiUrl: `http://127.0.0.1:${upstreamPort}`,
    natsUrl: `nats://127.0.0.1:${relayPort}`, env: 'dev', signal: bridge.signal,
    natsCredsPath: process.env.NATS_TEST_CONSUMER_CREDS }))
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
  assert.equal(client[0].events[0]._download_complete, false)
  client[0].events = [] // Simulate the separately confirmed missing-event defect.
  event = { ...event, phase: 'complete' }
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
  assert.equal(client[0].events[0]._download_complete, true)
  assert.deepEqual(client[0].events[0]._s3_urls, [])
  assert.equal(client[0]._last_activity, fixture.last_activity_at)
  assert.equal(paths.filter(path => path.startsWith('/api/v1/events')).length, 1)
  assert.equal(paths.some(path => path.startsWith('/api/v1/fixtures?')), false)
  for (const socket of sockets) socket.destroy()
  assert.equal((await next('resync')).reason, 'nats-reconnect')
  client = await snapshot()
  assert.equal(client[0].events[0]._download_complete, true)
  assert.equal(paths.filter(path => path === '/api/v1/fixtures').length, 2)
})

const retainedEventId = '3b414e73-58ef-4e97-9733-41f546bda044'
const retainedShareId = 's_5b7b39d48133'

function goEvent(
  id: string,
  fixtureId: number,
  phase: 'detected' | 'searching' | 'complete' | 'removed',
  minute: number,
) {
  return {
    id,
    fixture_id: fixtureId,
    type: 'goal',
    detail: 'Normal Goal',
    minute,
    extra: null,
    team: { id: fixtureId * 2, name: 'Home' },
    player: { id: 10, name: 'Scorer' },
    assist: null,
    videos: [],
    phase,
    debounce_count: phase === 'removed' ? 0 : 3,
  }
}

test('retained event route returns an out-of-window fixture and probes media without following it', async t => {
  const fixture = {
    ...goFixture(6, 'completed', 'finished', 'FT', '2026-08-23T17:00:00Z'),
    events: [goEvent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 6, 'complete', 20)],
  }
  const removed = goEvent(retainedEventId, 6, 'removed', 10)
  let garageRequests = 0

  const upstream = createServer((request, response) => {
    if (request.url === `/api/v1/events?ids=${retainedEventId}`) {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify([removed]))
      return
    }
    if (request.url === '/api/v1/fixtures?ids=6') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify([fixture]))
      return
    }
    if (request.url === `/api/v1/videos/${retainedShareId}`) {
      response.statusCode = 302
      response.setHeader('Location', '/garage/object.mp4')
      response.end()
      return
    }
    if (request.url === '/garage/object.mp4') {
      garageRequests++
      response.end('video bytes')
      return
    }
    response.statusCode = 404
    response.end()
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))

  const app = express()
  app.use('/api/found-footy', createFoundFootyRouter({ apiUrl: `http://127.0.0.1:${upstreamPort}` }))
  const portal = createServer(app)
  const portalPort = await listen(portal)
  t.after(() => close(portal))

  const response = await fetch(
    `http://127.0.0.1:${portalPort}/api/found-footy/event/${retainedEventId}?share_id=${retainedShareId}`,
  )
  assert.equal(response.status, 200)
  const body = await response.json() as {
    found: boolean
    fixture: Fixture
    media: { share_id: string; state: string }
  }
  assert.equal(body.found, true)
  assert.equal(body.fixture._id, 6)
  assert.equal(body.media.state, 'available')
  assert.equal(garageRequests, 0)

  const target = body.fixture.events.find(event => event._event_id === retainedEventId)!
  const surviving = body.fixture.events.find(event => event._event_id !== retainedEventId)!
  assert.equal(target._removed, true)
  assert.deepEqual(target._score_after, { home: 1, away: 0 })
  assert.deepEqual(surviving._score_after, { home: 1, away: 0 })
})

test('retained event route distinguishes removed and unknown media while preserving context', async t => {
  const fixture = goFixture(6, 'completed', 'finished', 'FT')
  const event = goEvent(retainedEventId, 6, 'complete', 10)
  let mediaStatus = 410
  const upstream = createServer((request, response) => {
    if (request.url?.startsWith('/api/v1/events?ids=')) {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify([event]))
      return
    }
    if (request.url === '/api/v1/fixtures?ids=6') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify([fixture]))
      return
    }
    if (request.url?.startsWith('/api/v1/videos/')) {
      response.statusCode = mediaStatus
      response.end()
      return
    }
    response.statusCode = 404
    response.end()
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))

  const app = express()
  app.use('/api/found-footy', createFoundFootyRouter({ apiUrl: `http://127.0.0.1:${upstreamPort}` }))
  const portal = createServer(app)
  const portalPort = await listen(portal)
  t.after(() => close(portal))
  const eventUrl = `http://127.0.0.1:${portalPort}/api/found-footy/event/${retainedEventId}`
  const url = `http://127.0.0.1:${portalPort}/api/found-footy/event/${retainedEventId}?share_id=${retainedShareId}`

  const eventOnly = await fetch(eventUrl)
  assert.equal(eventOnly.status, 200)
  assert.equal(((await eventOnly.json()) as { media: unknown }).media, null)

  const removed = await fetch(url)
  assert.equal(removed.status, 200)
  assert.equal(((await removed.json()) as { media: { state: string } }).media.state, 'removed')

  mediaStatus = 404
  const unknown = await fetch(url)
  assert.equal(unknown.status, 200)
  assert.equal(((await unknown.json()) as { media: { state: string } }).media.state, 'unknown')
})

test('retained event route separates missing resources, invalid input, and upstream failure', async t => {
  let upstreamStatus = 200
  const upstream = createServer((request, response) => {
    if (request.url?.startsWith('/api/v1/events?ids=')) {
      response.statusCode = upstreamStatus
      response.setHeader('Content-Type', 'application/json')
      response.end(upstreamStatus === 200 ? '[]' : '{"error":"failed"}')
      return
    }
    response.statusCode = 404
    response.end()
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))

  const app = express()
  app.use('/api/found-footy', createFoundFootyRouter({ apiUrl: `http://127.0.0.1:${upstreamPort}` }))
  const portal = createServer(app)
  const portalPort = await listen(portal)
  t.after(() => close(portal))
  const base = `http://127.0.0.1:${portalPort}/api/found-footy/event`

  assert.equal((await fetch(`${base}/not-a-uuid`)).status, 400)
  assert.equal((await fetch(`${base}/${retainedEventId}?share_id=bad`)).status, 400)
  assert.equal((await fetch(`${base}/${retainedEventId}`)).status, 404)

  upstreamStatus = 500
  assert.equal((await fetch(`${base}/${retainedEventId}`)).status, 502)
})
