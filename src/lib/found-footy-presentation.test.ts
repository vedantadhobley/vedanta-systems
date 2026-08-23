import assert from 'node:assert/strict'
import test from 'node:test'

import type { Fixture } from '@/types/found-footy'
import {
  getFixturePresentationState,
  getTerminalDeferredLabel,
  orderFixturesForPresentation,
} from './found-footy-presentation'

function fixture(
  id: number,
  status: string,
  kickoff: string,
  lastActivity?: string,
): Fixture {
  return {
    _id: id,
    _last_activity: lastActivity,
    fixture: {
      id,
      referee: null,
      timezone: 'UTC',
      date: kickoff,
      timestamp: Date.parse(kickoff) / 1000,
      status: { long: status, short: status, elapsed: null, extra: null },
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
    score: {
      halftime: { home: 0, away: 0 },
      fulltime: { home: 0, away: 0 },
      extratime: null,
      penalty: null,
    },
    events: [],
  }
}

test('classifies provider statuses into explicit presentation states', () => {
  for (const status of ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE']) {
    assert.equal(getFixturePresentationState(fixture(1, status, '2026-08-23T12:00:00Z')), 'playing')
  }
  for (const status of ['FT', 'AET', 'PEN', 'AWD', 'WO']) {
    assert.equal(getFixturePresentationState(fixture(1, status, '2026-08-23T12:00:00Z')), 'finished')
  }
  for (const status of ['NS', 'TBD']) {
    assert.equal(getFixturePresentationState(fixture(1, status, '2026-08-23T12:00:00Z')), 'upcoming')
  }
  for (const status of ['PST', 'CANC', 'SUSP', 'INT', 'ABD', 'UNKNOWN']) {
    assert.equal(getFixturePresentationState(fixture(1, status, '2026-08-23T12:00:00Z')), 'deferred')
  }
})

test('keeps deferred fixtures behind playing, finished, and upcoming fixtures', () => {
  const postponed = fixture(1, 'PST', '2026-08-23T11:00:00Z', '2026-08-23T15:00:00Z')
  const upcoming = fixture(2, 'NS', '2026-08-23T14:00:00Z')
  const finished = fixture(3, 'FT', '2026-08-23T10:00:00Z', '2026-08-23T13:00:00Z')
  const playing = fixture(4, '2H', '2026-08-23T12:00:00Z', '2026-08-23T12:30:00Z')

  assert.deepEqual(
    orderFixturesForPresentation([postponed, upcoming, finished, playing]).map(item => item._id),
    [4, 3, 2, 1],
  )
})

test('shows terminal deferred labels without flattening suspended fixtures', () => {
  assert.equal(getTerminalDeferredLabel(fixture(1, 'PST', '2026-08-23T12:00:00Z')), 'Postponed')
  assert.equal(getTerminalDeferredLabel(fixture(2, 'CANC', '2026-08-23T12:00:00Z')), 'Cancelled')
  assert.equal(getTerminalDeferredLabel(fixture(3, 'ABD', '2026-08-23T12:00:00Z')), 'Abandoned')
  assert.equal(getTerminalDeferredLabel(fixture(4, 'SUSP', '2026-08-23T12:00:00Z')), null)
})
