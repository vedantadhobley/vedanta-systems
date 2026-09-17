import type { Fixture, FixturePresentationState } from '@/types/found-footy'

export type { FixturePresentationState } from '@/types/found-footy'

export function getFixturePresentationState(fixture: Fixture): FixturePresentationState {
  return fixture.presentation_state
}

// Schedule distance, not a match clock. Show whole minutes on either side of
// kickoff; suppress negative zero during the first overdue minute.
export function formatKickoffCountdown(kickoff: string, now = Date.now()): string {
  const diff = Date.parse(kickoff) - now
  if (!Number.isFinite(diff)) return ''

  const totalMinutes = Math.floor(Math.abs(diff) / 60_000)
  const sign = diff < 0 && totalMinutes > 0 ? '−' : ''
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${sign}${hours > 0 ? `${hours}h ` : ''}${minutes}m`
}

function compareFixtureIdentity(a: Fixture, b: Fixture): number {
  return a.fixture.date.localeCompare(b.fixture.date) || a._id - b._id
}

function sortByActivity<T extends Fixture>(fixtures: T[]): T[] {
  const withActivity = fixtures
    .filter(fixture => fixture._last_activity)
    .sort((a, b) => (
      Date.parse(b._last_activity!) - Date.parse(a._last_activity!) || compareFixtureIdentity(a, b)
    ))
  const withoutActivity = fixtures
    .filter(fixture => !fixture._last_activity)
    .sort(compareFixtureIdentity)

  return [...withActivity, ...withoutActivity]
}

function sortByKickoff<T extends Fixture>(fixtures: T[]): T[] {
  return fixtures.sort(compareFixtureIdentity)
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
