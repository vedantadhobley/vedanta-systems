import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import test from 'node:test'

import express from 'express'
import type { Fixture } from '../../types/found-footy'

import { createFixtureUpdateBatcher, createFoundFootyRouter, foundFootyLiveTopic } from './found-footy'

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

test('routes the three FF-077 subjects and removes the legacy fixture.clock path', () => {
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.status'), 'fixture_status')
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.update'), 'fixture_update')
  assert.equal(foundFootyLiveTopic('found-footy.prod.event.video'), 'event_video')
  assert.equal(foundFootyLiveTopic('found-footy.prod.fixture.clock'), null)
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
