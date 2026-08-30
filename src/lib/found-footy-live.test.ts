import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  Fixture,
  FixturePresentationState,
  FixtureStatusProjection,
  GoalEvent,
} from '@/types/found-footy'
import {
  applyFixtureStatus,
  dateIntentForSelection,
  formatFixtureIndicator,
  isFixturesResponse,
  replaceEventVideo,
  replaceFixturesById,
  resolveRecoveryDate,
} from './found-footy-live'

function fixture(
  id: number,
  presentationState: FixturePresentationState,
  status = 'NS',
  lastActivity?: string,
): Fixture {
  return {
    _id: id,
    state: presentationState === 'upcoming' ? 'staging' : 'active',
    presentation_state: presentationState,
    clock: { minute: null, extra: null },
    status: { short: status, long: status },
    display: 'status',
    fixture: {
      id,
      referee: null,
      timezone: 'UTC',
      date: `2026-08-30T${String(10 + id).padStart(2, '0')}:00:00Z`,
      timestamp: 0,
    },
    league: { id: 1, name: 'League', country: '', logo: '', flag: '', season: 2026, round: '' },
    teams: {
      home: { id: id * 2, name: 'Home', winner: null },
      away: { id: id * 2 + 1, name: 'Away', winner: null },
    },
    goals: { home: null, away: null },
    score: { penalty: null },
    events: [],
    _last_activity: lastActivity,
  }
}

function statusProjection(
  fixtureId: number,
  short: string,
  display: 'clock' | 'status',
  minute: number | null,
): FixtureStatusProjection {
  return {
    fixture_id: fixtureId,
    presentation_state: 'playing',
    clock: { minute, extra: null },
    status: { short, long: short },
    display,
  }
}

test('accepts the breaking FF-077 snapshot and rejects the legacy nested clock shape', () => {
  const current = fixture(1, 'playing', '2H')
  current.clock = { minute: 62, extra: null }
  current.display = 'clock'
  assert.equal(isFixturesResponse({ fixtures: [current] }), true)

  const legacy = structuredClone(current) as unknown as Record<string, unknown>
  delete legacy.presentation_state
  delete legacy.clock
  delete legacy.status
  delete legacy.display
  const nestedFixture = legacy.fixture as Record<string, unknown>
  nestedFixture.status = { short: '2H', long: 'Second Half', elapsed: 62, extra: null }
  assert.equal(isFixturesResponse({ fixtures: [legacy] }), false)
})

test('patches inline clock movement without changing fixture order', () => {
  const fixtures = [fixture(1, 'playing', '1H'), fixture(2, 'playing', '1H')]
  const patched = applyFixtureStatus(fixtures, [statusProjection(2, '1H', 'clock', 44)])

  assert.deepEqual(patched.map(item => item._id), [1, 2])
  assert.equal(formatFixtureIndicator(patched[1]), "44'")
})

test('patches 1H to HT to 2H entirely through the inline status projection', () => {
  let fixtures = [fixture(1, 'playing', '1H')]
  fixtures = applyFixtureStatus(fixtures, [statusProjection(1, '1H', 'clock', 45)])
  assert.equal(formatFixtureIndicator(fixtures[0]), "45'")

  fixtures = applyFixtureStatus(fixtures, [statusProjection(1, 'HT', 'status', 45)])
  assert.equal(formatFixtureIndicator(fixtures[0]), 'HT')

  fixtures = applyFixtureStatus(fixtures, [statusProjection(1, '2H', 'clock', 46)])
  assert.equal(formatFixtureIndicator(fixtures[0]), "46'")
})

test('patches ET to BT to ET without interpreting those status codes', () => {
  let fixtures = [fixture(1, 'playing', 'ET')]
  fixtures = applyFixtureStatus(fixtures, [statusProjection(1, 'ET', 'clock', 105)])
  fixtures = applyFixtureStatus(fixtures, [statusProjection(1, 'BT', 'status', 105)])
  assert.equal(formatFixtureIndicator(fixtures[0]), 'BT')
  fixtures = applyFixtureStatus(fixtures, [statusProjection(1, 'ET', 'clock', 106)])
  assert.equal(formatFixtureIndicator(fixtures[0]), "106'")
})

test('targeted kickoff, final whistle, and postponed resumption replacements regroup fixtures', () => {
  const other = fixture(2, 'upcoming', 'NS')
  let fixtures = [fixture(1, 'upcoming', 'NS'), other]

  const kickedOff = fixture(1, 'playing', '1H', '2026-08-30T14:00:00Z')
  fixtures = replaceFixturesById(fixtures, [1], [kickedOff])
  assert.deepEqual(fixtures.map(item => [item._id, item.presentation_state]), [[1, 'playing'], [2, 'upcoming']])

  const final = fixture(1, 'finished', 'FT', '2026-08-30T15:00:00Z')
  fixtures = replaceFixturesById(fixtures, [1], [final])
  assert.deepEqual(fixtures.map(item => [item._id, item.presentation_state]), [[1, 'finished'], [2, 'upcoming']])

  const postponed = fixture(3, 'deferred', 'PST')
  fixtures = replaceFixturesById([...fixtures, postponed], [3], [fixture(3, 'upcoming', 'NS')])
  assert.equal(fixtures.find(item => item._id === 3)?.presentation_state, 'upcoming')
})

test('targeted event.video replaces only the indicated event projection', () => {
  const target = {
    _event_id: 'event-1',
    _s3_urls: ['/old'],
    _s3_videos: [{ url: '/old', perceptual_hash: '', resolution_score: 1, popularity: 0, rank: 1 }],
    _monitor_complete: true,
    _download_complete: false,
    _removed: false,
  } as GoalEvent
  const untouched = { ...target, _event_id: 'event-2' }
  const source = fixture(1, 'playing', '2H')
  source.events = [target, untouched]

  const [patched] = replaceEventVideo([source], 1, 'event-1', {
    _event_id: 'event-1',
    _s3_urls: ['/new'],
    _download_complete: true,
  })

  assert.deepEqual(patched.events[0]._s3_urls, ['/new'])
  assert.equal(patched.events[0]._download_complete, true)
  assert.equal(patched.events[1], untouched)
})

test('recovery advances a live view after wake while preserving a pinned date', () => {
  assert.equal(resolveRecoveryDate('live', '2026-08-29', '2026-08-30'), '2026-08-30')
  assert.equal(resolveRecoveryDate('pinned', '2026-08-29', '2026-08-30'), '2026-08-29')
  assert.equal(dateIntentForSelection('2026-08-30', '2026-08-30'), 'live')
  assert.equal(dateIntentForSelection('2026-08-29', '2026-08-30'), 'pinned')
})
