import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  EventPresentationState,
  Fixture,
  FixturePresentationState,
  FixtureStatusProjection,
  FootyEvent,
} from '@/types/found-footy'
import {
  applyFixtureStatus,
  applyFootyLiveEvent,
  createFootyLiveJournal,
  dateIntentForSelection,
  formatFixtureIndicator,
  isFixturesResponse,
  isFootyLiveEvent,
  isSearchResponse,
  isSharedEventTargetResponse,
  mergeSharedTargetFixture,
  recoverFootyParent,
  replaceEvent,
  replaceFixturesById,
  resolveRecoveryDate,
} from './found-footy-live'
import { formatEventSubtitle, formatEventTitle } from './found-footy-display'

function event(id = 'a4dbb584-bda7-4495-8eea-0736d252bcf0', fixtureId = 1,
  state: EventPresentationState = 'searching'): FootyEvent {
  return {
    id,
    fixture_id: fixtureId,
    kind: 'goal',
    presentation_state: state,
    minute: 10,
    extra: null,
    team: { id: 2, name: 'Home' },
    player: { id: 10, name: 'Scorer' },
    assist: null,
    presentation: {
      label: 'Goal', team_side: 'home',
      score_before: { home: 0, away: 0 }, score_after: { home: 1, away: 0 },
    },
    debounce_count: 3,
    videos: [],
  }
}

function fixture(id: number, state: FixturePresentationState, status = 'NS',
  lastActivity: string | null = null): Fixture {
  return {
    id,
    kickoff: `2026-08-30T${String(10 + id).padStart(2, '0')}:00:00Z`,
    presentation_state: state,
    clock: { minute: null, extra: null },
    status: { short: status, long: status },
    display: 'status',
    league: {
      id: 1, name: 'League', country: '', season: 2026, priority: 1,
      round_label: 'Matchweek 1', round_kind: 'regular_season',
    },
    home: { id: id * 2, name: 'Home', score: null, winner: null },
    away: { id: id * 2 + 1, name: 'Away', score: null, winner: null },
    penalty: null,
    last_activity_at: lastActivity,
    events: [],
  }
}

function projection(fixtureId: number, short: string, display: 'clock' | 'status',
  minute: number | null): FixtureStatusProjection {
  return {
    fixture_id: fixtureId,
    presentation_state: 'playing',
    clock: { minute, extra: null },
    status: { short, long: short },
    display,
  }
}

test('accepts the direct public shape and rejects the legacy adapter shape', () => {
  const current = fixture(1, 'playing', '2H')
  current.events = [event()]
  assert.equal(isFixturesResponse({ fixtures: [current] }), true)
  assert.equal(isFixturesResponse({ fixtures: [{ _id: 1, fixture: { date: current.kickoff } }] }), false)
  assert.equal(isFixturesResponse({ fixtures: [{ ...current, league: { ...current.league, priority: undefined } }] }), false)
})

test('patches clocks and period labels inline without changing order', () => {
  let rows = [fixture(1, 'playing', '1H'), fixture(2, 'playing', '1H')]
  rows = applyFixtureStatus(rows, [projection(2, '1H', 'clock', 45)])
  assert.deepEqual(rows.map(item => item.id), [1, 2])
  assert.equal(formatFixtureIndicator(rows[1]), "45'")
  rows = applyFixtureStatus(rows, [projection(2, 'HT', 'status', 45)])
  assert.equal(formatFixtureIndicator(rows[1]), 'HT')
  rows = applyFixtureStatus(rows, [projection(2, '2H', 'clock', 46)])
  assert.equal(formatFixtureIndicator(rows[1]), "46'")
})

test('patches ET to BT to ET without interpreting provider status codes', () => {
  let rows = [fixture(1, 'playing', 'ET')]
  rows = applyFixtureStatus(rows, [projection(1, 'ET', 'clock', 105)])
  rows = applyFixtureStatus(rows, [projection(1, 'BT', 'status', 105)])
  assert.equal(formatFixtureIndicator(rows[0]), 'BT')
  rows = applyFixtureStatus(rows, [projection(1, 'ET', 'clock', 106)])
  assert.equal(formatFixtureIndicator(rows[0]), "106'")
})

test('targeted kickoff, finish, and postponed resumption replacements regroup fixtures', () => {
  let rows = [fixture(1, 'upcoming'), fixture(2, 'upcoming')]
  rows = replaceFixturesById(rows, [1], [fixture(1, 'playing', '1H', '2026-08-30T14:00:00Z')])
  assert.deepEqual(rows.map(item => [item.id, item.presentation_state]), [[1, 'playing'], [2, 'upcoming']])
  rows = replaceFixturesById(rows, [1], [fixture(1, 'finished', 'FT', '2026-08-30T15:00:00Z')])
  assert.deepEqual(rows.map(item => [item.id, item.presentation_state]), [[1, 'finished'], [2, 'upcoming']])
  rows = replaceFixturesById([...rows, fixture(3, 'deferred', 'PST')], [3], [fixture(3, 'upcoming')])
  assert.equal(rows.find(item => item.id === 3)?.presentation_state, 'upcoming')
})

test('event.update replaces existing data but never appends an unordered event', () => {
  const source = fixture(1, 'playing', '2H', '2026-08-30T11:10:00Z')
  source.events = [event()]
  const complete = { ...event(), presentation_state: 'complete' as const }
  const replaced = replaceEvent([source], 1, complete.id, complete)
  assert.equal(replaced[0].events[0].presentation_state, 'complete')
  assert.equal(replaced[0].last_activity_at, source.last_activity_at)

  const missing = event('3b414e73-58ef-4e97-9733-41f546bda044')
  const unchanged = replaceEvent(replaced, 1, missing.id, missing)
  assert.equal(unchanged[0].events.length, 1)
})

test('presentation state and video presence remain independent', () => {
  const source = fixture(1, 'playing')
  source.events = [event()]
  const completeWithoutClips = { ...event(), presentation_state: 'complete' as const, videos: [] }
  const updated = applyFootyLiveEvent([source], {
    type: 'event_update', fixture_id: 1, event_id: completeWithoutClips.id, event: completeWithoutClips,
  })
  assert.equal(updated[0].events[0].presentation_state, 'complete')
  assert.deepEqual(updated[0].events[0].videos, [])
})

test('renders backend event meaning without inventing score context or team side', () => {
  const source = fixture(1, 'finished', 'FT')
  source.home.score = 4
  source.away.score = 3
  const ambiguous = event()
  ambiguous.presentation = {
    label: 'Goal', team_side: null, score_before: null, score_after: null,
  }
  assert.equal(formatEventTitle(source, ambiguous), '<<Home>>')
  assert.equal(formatEventTitle(source, {
    ...ambiguous,
    kind: 'red_card',
    presentation: { ...ambiguous.presentation, label: 'Red Card' },
  }), '<<Home>>')
  assert.equal(formatEventSubtitle(ambiguous), "10' Goal - <<Scorer>>")
})

test('live validation rejects mismatched and legacy event updates', () => {
  const update = { type: 'event_update', fixture_id: 1, event_id: event().id, event: event() }
  assert.equal(isFootyLiveEvent(update), true)
  assert.equal(isFootyLiveEvent({ ...update, event_id: 'different' }), false)
  assert.equal(isFootyLiveEvent({ ...update, type: 'event_video' }), false)
  assert.equal(isFootyLiveEvent({ ...update, event: { _event_id: event().id } }), false)
})

test('search validation requires direct producer provenance', () => {
  const source = fixture(1, 'finished')
  const direct = {
    ...source,
    search_match: { competition: false, home_team: true, away_team: false, events: [] },
  }
  assert.equal(isSearchResponse({ fixtures: [direct], query: 'home', totalFixtures: 1 }), true)
  assert.equal(isSearchResponse({ results: [{ fixtures: [direct] }], query: 'home', totalFixtures: 1 }), false)
  assert.equal(isSearchResponse({ fixtures: [{ ...source, _search: {} }], query: 'home', totalFixtures: 1 }), false)
})

test('retained targets merge direct event presentation without mutating the snapshot', () => {
  const current = fixture(1, 'finished', 'FT')
  const targetFixture = fixture(1, 'finished', 'FT')
  targetFixture.events = [{ ...event(), presentation_state: 'removed' }]
  const target = {
    eventId: event().id, found: true as const, date: '2026-08-30', kickoff: targetFixture.kickoff,
    fixture: targetFixture, media: { share_id: 's_5b7b39d48133', state: 'removed' as const },
  }
  const merged = mergeSharedTargetFixture([current], target)
  assert.equal(merged[0].events[0].presentation_state, 'removed')
  assert.equal(current.events.length, 0)
  assert.equal(isSharedEventTargetResponse(target), true)
})

test('journal flags a missing event until an authoritative fixture update supersedes it', () => {
  const journal = createFootyLiveJournal()
  const cursor = journal.revision()
  const update = { type: 'event_update' as const, fixture_id: 1, event_id: event().id, event: event() }
  journal.record(update)
  assert.deepEqual(journal.missingEvents([], cursor), [{ fixtureId: 1, eventId: event().id, after: 0 }])
  journal.record({ type: 'fixture_update', fixture_ids: [1], fixtures: [] })
  assert.deepEqual(journal.missingEvents([], cursor), [])
})

test('parent recovery replaces from a complete fixture and replays newer event updates', async () => {
  const journal = createFootyLiveJournal()
  const source = fixture(1, 'playing')
  source.events = [event()]
  const cursor = journal.revision()
  const completed = { ...event(), presentation_state: 'complete' as const }
  journal.record({ type: 'event_update', fixture_id: 1, event_id: completed.id, event: completed })
  const recovered = await recoverFootyParent(1, async () => ({ fixtures: [source] }), journal, cursor)
  assert.equal(recovered?.events[0].presentation_state, 'complete')
})

test('parent recovery never invents a missing event and honors authoritative removal', async () => {
  const journal = createFootyLiveJournal()
  const cursor = journal.revision()
  journal.record({ type: 'event_update', fixture_id: 1, event_id: event().id, event: event() })
  const absent = await recoverFootyParent(1, async () => ({ fixtures: [fixture(1, 'playing')] }), journal, cursor)
  assert.deepEqual(absent?.events, [])

  const removalJournal = createFootyLiveJournal()
  const removalCursor = removalJournal.revision()
  removalJournal.record({ type: 'fixture_update', fixture_ids: [1], fixtures: [] })
  assert.equal(await recoverFootyParent(1, async () => ({ fixtures: [sourceWithEvent()] }), removalJournal, removalCursor), null)
})

function sourceWithEvent(): Fixture {
  const source = fixture(1, 'playing')
  source.events = [event()]
  return source
}

test('wake recovery follows live intent and preserves pinned intent', () => {
  assert.equal(resolveRecoveryDate('live', '2026-08-29', '2026-08-30'), '2026-08-30')
  assert.equal(resolveRecoveryDate('pinned', '2026-08-29', '2026-08-30'), '2026-08-29')
  assert.equal(dateIntentForSelection('2026-08-30', '2026-08-30'), 'live')
  assert.equal(dateIntentForSelection('2026-08-29', '2026-08-30'), 'pinned')
})
