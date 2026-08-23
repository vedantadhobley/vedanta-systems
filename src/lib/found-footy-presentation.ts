import type { Fixture } from '@/types/found-footy'

export type FixturePresentationState = 'playing' | 'finished' | 'upcoming' | 'deferred'

const PLAYING = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'])
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO'])
const UPCOMING = new Set(['NS', 'TBD'])
const DEFERRED = new Set(['PST', 'CANC', 'SUSP', 'INT', 'ABD'])

const TERMINAL_DEFERRED_LABELS: Record<string, string> = {
  PST: 'Postponed',
  CANC: 'Cancelled',
  ABD: 'Abandoned',
}

function statusOf(fixture: Fixture): string {
  return (fixture.fixture.status.short || '').toUpperCase()
}

export function getFixturePresentationState(fixture: Fixture): FixturePresentationState {
  const status = statusOf(fixture)
  if (PLAYING.has(status)) return 'playing'
  if (FINISHED.has(status)) return 'finished'
  if (UPCOMING.has(status)) return 'upcoming'
  if (DEFERRED.has(status)) return 'deferred'

  // Unknown provider statuses must not create a false live badge. Keep them
  // visible at the end until the taxonomy is deliberately extended.
  return 'deferred'
}

export function getTerminalDeferredLabel(fixture: Fixture): string | null {
  return TERMINAL_DEFERRED_LABELS[statusOf(fixture)] ?? null
}

function sortByActivity<T extends Fixture>(fixtures: T[]): T[] {
  const withActivity = fixtures
    .filter(fixture => fixture._last_activity)
    .sort((a, b) => Date.parse(b._last_activity!) - Date.parse(a._last_activity!))
  const withoutActivity = fixtures
    .filter(fixture => !fixture._last_activity)
    .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date))

  return [...withActivity, ...withoutActivity]
}

function sortByKickoff<T extends Fixture>(fixtures: T[]): T[] {
  return fixtures.sort((a, b) => a.fixture.date.localeCompare(b.fixture.date))
}

export function orderFixturesForPresentation<T extends Fixture>(fixtures: readonly T[]): T[] {
  const unique = new Map<number, T>()
  for (const fixture of fixtures) unique.set(fixture._id, fixture)

  const grouped: Record<FixturePresentationState, T[]> = {
    playing: [],
    finished: [],
    upcoming: [],
    deferred: [],
  }

  for (const fixture of unique.values()) {
    grouped[getFixturePresentationState(fixture)].push(fixture)
  }

  return [
    ...sortByActivity(grouped.playing),
    ...sortByActivity(grouped.finished),
    ...sortByKickoff(grouped.upcoming),
    ...sortByKickoff(grouped.deferred),
  ]
}

export function sortFixturesByActivity<T extends Fixture>(fixtures: readonly T[]): T[] {
  return sortByActivity([...fixtures])
}
