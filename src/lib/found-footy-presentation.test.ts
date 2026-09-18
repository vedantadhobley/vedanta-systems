import assert from 'node:assert/strict'
import test from 'node:test'

import type { Fixture, FixturePresentationState } from '@/types/found-footy'
import {
  formatKickoffCountdown,
  getFixturePresentationState,
  orderFixturesForPresentation,
} from './found-footy-presentation'

test('counts whole minutes before and after scheduled kickoff without negative zero', () => {
  const kickoff = '2026-09-16T18:00:00Z'
  for (const [offset, expected] of [
    [-3_660_000, '1h 1m'], [-60_000, '1m'], [-59_999, '0m'], [0, '0m'],
    [59_999, '0m'], [60_000, '−1m'], [3_600_000, '−1h 0m'],
  ] as const) {
    assert.equal(formatKickoffCountdown(kickoff, Date.parse(kickoff) + offset), expected)
  }
  assert.equal(formatKickoffCountdown('invalid', Date.parse(kickoff)), '')
})

function fixture(
  id: number,
  presentationState: FixturePresentationState,
  kickoff: string,
  lastActivity: string | null = null,
  status = 'opaque-provider-value',
): Fixture {
  return {
    id,
    kickoff,
    presentation_state: presentationState,
    clock: { minute: null, extra: null },
    status: { long: status, short: status },
    display: 'status',
    last_activity_at: lastActivity,
    league: {
      id: 1, name: 'Test League', country: '', season: 2026, priority: 10,
      round_label: '', round_kind: 'unknown',
    },
    home: { id: id * 2, name: 'Home', score: null, winner: null },
    away: { id: id * 2 + 1, name: 'Away', score: null, winner: null },
    penalty: null,
    events: [],
  }
}

test('uses backend presentation_state without interpreting provider status', () => {
  for (const state of ['playing', 'finished', 'upcoming', 'deferred'] as const) {
    assert.equal(getFixturePresentationState(fixture(1, state, '2026-08-23T12:00:00Z')), state)
  }
})

test('orders groups and recency from explicit backend fields', () => {
  const rows = [
    fixture(1, 'deferred', '2026-08-23T11:00:00Z', '2026-08-23T15:00:00Z'),
    fixture(2, 'upcoming', '2026-08-23T14:00:00Z'),
    fixture(3, 'finished', '2026-08-23T10:00:00Z', '2026-08-23T13:00:00Z'),
    fixture(4, 'playing', '2026-08-23T12:00:00Z', '2026-08-23T12:30:00Z'),
  ]
  assert.deepEqual(orderFixturesForPresentation(rows).map(item => item.id), [4, 3, 2, 1])
})

test('uses deterministic kickoff and id tie breakers for equal activity', () => {
  const activity = '2026-08-23T13:00:00Z'
  const rows = [
    fixture(3, 'playing', '2026-08-23T12:00:00Z', activity),
    fixture(2, 'playing', '2026-08-23T11:00:00Z', activity),
    fixture(1, 'playing', '2026-08-23T11:00:00Z', activity),
  ]
  assert.deepEqual(orderFixturesForPresentation(rows).map(item => item.id), [1, 2, 3])
})
