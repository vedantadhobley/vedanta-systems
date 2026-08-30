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
