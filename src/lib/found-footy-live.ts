import type {
  Fixture,
  FixtureStatusProjection,
  FixturesResponse,
  FootyDateIntent,
  GoalEvent,
  SharedEventTargetResponse,
} from '@/types/found-footy'
import { orderFixturesForPresentation } from '@/lib/found-footy-presentation'

export type EventVideoPatch = Partial<GoalEvent> & { _event_id: string }

export type FootyLiveEvent =
  | { type: 'fixture_status'; fixtures: FixtureStatusProjection[] }
  | { type: 'fixture_update'; fixture_ids: number[]; fixtures: Fixture[] }
  | { type: 'event_video'; fixture_id: number; event_id: string; event: EventVideoPatch | null }

export function applyFixtureStatus(
  fixtures: readonly Fixture[],
  projections: readonly FixtureStatusProjection[],
): Fixture[] {
  if (projections.length === 0) return [...fixtures]
  const byId = new Map(projections.map(projection => [projection.fixture_id, projection]))
  return fixtures.map(fixture => {
    const projection = byId.get(fixture._id)
    if (!projection) return fixture
    return {
      ...fixture,
      presentation_state: projection.presentation_state,
      clock: projection.clock,
      status: projection.status,
      display: projection.display,
    }
  })
}

export function replaceFixturesById(
  fixtures: readonly Fixture[],
  requestedIds: readonly number[],
  replacements: readonly Fixture[],
): Fixture[] {
  const requested = new Set(requestedIds)
  const retained = fixtures.filter(fixture => !requested.has(fixture._id))
  return orderFixturesForPresentation([...retained, ...replacements])
}

export function replaceEventVideo(
  fixtures: readonly Fixture[],
  fixtureId: number,
  eventId: string,
  replacement: EventVideoPatch | null,
): Fixture[] {
  return fixtures.map(fixture => {
    if (fixture._id !== fixtureId) return fixture

    let found = false
    const events = fixture.events.flatMap(event => {
      if (event._event_id !== eventId) return [event]
      found = true
      return replacement ? [{ ...event, ...replacement }] : []
    })

    if (!found) return fixture
    return { ...fixture, events }
  })
}

export function applyFootyLiveEvent(fixtures: readonly Fixture[], event: FootyLiveEvent): Fixture[] {
  switch (event.type) {
    case 'fixture_status':
      // The producer guarantees that these projections remain in one
      // presentation group, so preserve the exact array order.
      return applyFixtureStatus(fixtures, event.fixtures)
    case 'fixture_update':
      return replaceFixturesById(fixtures, event.fixture_ids, event.fixtures)
    case 'event_video':
      return replaceEventVideo(fixtures, event.fixture_id, event.event_id, event.event)
  }
}

export function formatFixtureIndicator(fixture: Fixture): string {
  if (fixture.display === 'clock' && fixture.clock.minute !== null) {
    const extra = fixture.clock.extra === null ? '' : `+${fixture.clock.extra}`
    return `${fixture.clock.minute}${extra}'`
  }
  return fixture.status.short
}

export function resolveRecoveryDate(intent: FootyDateIntent, currentDate: string, today: string): string {
  return intent === 'live' ? today : currentDate
}

export function dateIntentForSelection(selectedDate: string, today: string): FootyDateIntent {
  return selectedDate === today ? 'live' : 'pinned'
}

export function mergeSharedTargetFixture(
  fixtures: readonly Fixture[],
  target: SharedEventTargetResponse | null,
): Fixture[] {
  if (!target?.found) return [...fixtures]

  const targetEvent = target.fixture.events.find(event => event._event_id === target.eventId)
  const existing = fixtures.find(fixture => fixture._id === target.fixture._id)
  if (!existing) return orderFixturesForPresentation([...fixtures, target.fixture])
  if (!targetEvent) return [...fixtures]

  const merged: Fixture = {
    ...existing,
    events: [
      ...existing.events.filter(event => event._event_id !== target.eventId),
      targetEvent,
    ],
  }
  return fixtures.map(fixture => fixture._id === merged._id ? merged : fixture)
}

export function isFixturesResponse(value: unknown): value is FixturesResponse {
  if (!value || typeof value !== 'object') return false
  const fixtures = (value as { fixtures?: unknown }).fixtures
  if (!Array.isArray(fixtures)) return false
  return fixtures.every(isFixture)
}

export function isSharedEventTargetResponse(value: unknown): value is SharedEventTargetResponse {
  if (!value || typeof value !== 'object') return false
  const target = value as Record<string, unknown>
  if (typeof target.eventId !== 'string' || typeof target.found !== 'boolean') return false
  if (target.found === false) return true
  if (
    typeof target.date !== 'string' ||
    typeof target.kickoff !== 'string' ||
    !isFixture(target.fixture)
  ) return false
  if (target.media === null) return true
  if (!target.media || typeof target.media !== 'object') return false
  const media = target.media as Record<string, unknown>
  return typeof media.share_id === 'string' &&
    ['available', 'removed', 'unknown'].includes(String(media.state))
}

function isFixture(value: unknown): value is Fixture {
  if (!value || typeof value !== 'object') return false
  const fixture = value as Partial<Fixture>
  return (
    typeof fixture._id === 'number' &&
    !!fixture.fixture &&
    typeof fixture.fixture.date === 'string' &&
    ['playing', 'finished', 'upcoming', 'deferred'].includes(fixture.presentation_state || '') &&
    ['clock', 'status'].includes(fixture.display || '') &&
    isClock(fixture.clock) &&
    isStatus(fixture.status) &&
    Array.isArray(fixture.events)
  )
}

export function isFootyLiveEvent(value: unknown): value is FootyLiveEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Record<string, unknown>
  if (event.type === 'fixture_status') {
    return Array.isArray(event.fixtures) && event.fixtures.every(isStatusProjection)
  }
  if (event.type === 'fixture_update') {
    return (
      Array.isArray(event.fixture_ids) &&
      event.fixture_ids.every(id => Number.isSafeInteger(id)) &&
      Array.isArray(event.fixtures) &&
      event.fixtures.every(isFixture)
    )
  }
  if (event.type === 'event_video') {
    return (
      Number.isSafeInteger(event.fixture_id) &&
      typeof event.event_id === 'string' &&
      (event.event === null || (
        !!event.event &&
        typeof event.event === 'object' &&
        (event.event as { _event_id?: unknown })._event_id === event.event_id
      ))
    )
  }
  return false
}

function isStatusProjection(value: unknown): value is FixtureStatusProjection {
  if (!value || typeof value !== 'object') return false
  const projection = value as Partial<FixtureStatusProjection>
  return (
    Number.isSafeInteger(projection.fixture_id) &&
    ['playing', 'finished', 'upcoming', 'deferred'].includes(projection.presentation_state || '') &&
    ['clock', 'status'].includes(projection.display || '') &&
    isClock(projection.clock) &&
    isStatus(projection.status)
  )
}

function isClock(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const clock = value as { minute?: unknown; extra?: unknown }
  return (clock.minute === null || typeof clock.minute === 'number') &&
    (clock.extra === null || typeof clock.extra === 'number')
}

function isStatus(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const status = value as { short?: unknown; long?: unknown }
  return typeof status.short === 'string' && typeof status.long === 'string'
}
