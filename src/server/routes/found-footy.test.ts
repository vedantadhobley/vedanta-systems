import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import test from 'node:test'

import express from 'express'

import { createFoundFootyRouter } from './found-footy'

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

function goFixture(id: number, state: string, status: string, lastActivityAt: string | null = null) {
  return {
    id,
    state,
    kickoff: `2026-08-23T${String(10 + id).padStart(2, '0')}:00:00Z`,
    league: { id: 1, name: 'Test League', season: 2026 },
    home: { id: id * 2, name: 'Home', score: null, winner: null },
    away: { id: id * 2 + 1, name: 'Away', score: null, winner: null },
    status: { short: status, long: status, elapsed: null, extra: null },
    penalty: null,
    last_activity_at: lastActivityAt,
    events: [],
  }
}

test('fixtures endpoint preserves monitor process buckets regardless of match status', async t => {
  const upstreamFixtures = [
    goFixture(1, 'active', 'pst'),
    goFixture(2, 'active', 'ns'),
    goFixture(3, 'completed', '2h'),
    goFixture(4, 'active', 'ft', '2026-08-23T13:00:00Z'),
    goFixture(5, 'completed', 'ft', '2026-08-23T13:00:00Z'),
  ]
  const upstream = createServer((request, response) => {
    if (request.url?.startsWith('/api/v1/fixtures')) {
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
    staging: Array<{ _id: number }>
    active: Array<{ _id: number; _last_activity?: string; fixture: { status: { short: string } } }>
    completed: Array<{ _id: number; _last_activity?: string; fixture: { status: { short: string } } }>
  }

  assert.deepEqual(body.staging.map(fixture => fixture._id), [])
  assert.deepEqual(body.active.map(fixture => fixture._id), [1, 2, 4])
  assert.deepEqual(body.completed.map(fixture => fixture._id), [3, 5])
  const terminalActive = body.active.find(fixture => fixture._id === 4)
  const terminalCompleted = body.completed.find(fixture => fixture._id === 5)
  assert.equal(terminalActive?.fixture.status.short, 'FT')
  assert.equal(terminalCompleted?.fixture.status.short, 'FT')
  assert.equal(terminalActive?._last_activity, '2026-08-23T13:00:00Z')
  assert.equal(terminalCompleted?._last_activity, '2026-08-23T13:00:00Z')
})
