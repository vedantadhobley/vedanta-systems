import assert from 'node:assert/strict'
import test from 'node:test'

import type { Fixture, FixturePresentationState } from '@/types/found-footy'
import {
  getFixturePresentationState,
  orderFixturesForPresentation,
} from './found-footy-presentation'

function fixture(
  id: number,
  presentationState: FixturePresentationState,
  kickoff: string,
  lastActivity?: string,
  status = 'opaque-provider-value',
): Fixture {
  return {
    _id: id,
    state: 'active',
    presentation_state: presentationState,
    clock: { minute: null, extra: null },
    status: { long: status, short: status },
    display: 'status',
    _last_activity: lastActivity,
    fixture: {
      id,
      referee: null,
      timezone: 'UTC',
      date: kickoff,
      timestamp: Date.parse(kickoff) / 1000,
    },
    league: {
      id: 1,
      name: 'Test League',
      country: '',
      logo: '',
      flag: '',
      season: 2026,
      round: '',
    },
    teams: {
      home: { id: id * 2, name: 'Home' },
      away: { id: id * 2 + 1, name: 'Away' },
    },
    goals: { home: null, away: null },
    score: { penalty: null },
    events: [],
  }
}

test('uses backend presentation_state without interpreting the provider status', () => {
  for (const presentationState of ['playing', 'finished', 'upcoming', 'deferred'] as const) {
    assert.equal(
      getFixturePresentationState(fixture(1, presentationState, '2026-08-23T12:00:00Z', undefined, 'same-code')),
      presentationState,
    )
  }
})

test('orders presentation groups and recency from backend fields', () => {
  const deferred = fixture(1, 'deferred', '2026-08-23T11:00:00Z', '2026-08-23T15:00:00Z')
  const upcoming = fixture(2, 'upcoming', '2026-08-23T14:00:00Z')
  const finished = fixture(3, 'finished', '2026-08-23T10:00:00Z', '2026-08-23T13:00:00Z')
  const playing = fixture(4, 'playing', '2026-08-23T12:00:00Z', '2026-08-23T12:30:00Z')

  assert.deepEqual(
    orderFixturesForPresentation([deferred, upcoming, finished, playing]).map(item => item._id),
    [4, 3, 2, 1],
  )
})

test('keeps terminal fixtures stable when processing state retires', () => {
  const terminalObservedAt = '2026-08-23T13:00:00Z'
  const otherFinished = fixture(2, 'finished', '2026-08-23T10:00:00Z', '2026-08-23T12:30:00Z')
  const activeSnapshot = fixture(1, 'finished', '2026-08-23T11:00:00Z', terminalObservedAt)
  const completedSnapshot = { ...activeSnapshot, state: 'completed' as const }

  assert.deepEqual(orderFixturesForPresentation([activeSnapshot, otherFinished]).map(item => item._id), [1, 2])
  assert.deepEqual(orderFixturesForPresentation([otherFinished, completedSnapshot]).map(item => item._id), [1, 2])
})

test('uses deterministic kickoff and id tie breakers for equal activity', () => {
  const activity = '2026-08-23T13:00:00Z'
  const later = fixture(3, 'playing', '2026-08-23T12:00:00Z', activity)
  const first = fixture(1, 'playing', '2026-08-23T11:00:00Z', activity)
  const second = fixture(2, 'playing', '2026-08-23T11:00:00Z', activity)

  assert.deepEqual(orderFixturesForPresentation([later, second, first]).map(item => item._id), [1, 2, 3])
})
