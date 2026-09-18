import type {
  Fixture,
  FixtureStatusProjection,
  FixturesResponse,
  FootyDateIntent,
  FootyEvent,
  SearchResponse,
  SharedEventTargetResponse,
} from '@/types/found-footy'
import { orderFixturesForPresentation } from '@/lib/found-footy-presentation'

export type FootyLiveEvent =
  | { type: 'fixture_status'; fixtures: FixtureStatusProjection[] }
  | { type: 'fixture_update'; fixture_ids: number[]; fixtures: Fixture[] }
  | { type: 'event_update'; fixture_id: number; event_id: string; event: FootyEvent }

export interface EventRecovery {
  fixtureId: number
  eventId: string
  after: number
}

export function hasEvent(fixtures: readonly Fixture[], fixtureId: number, eventId: string): boolean {
  return fixtures.some(fixture => fixture.id === fixtureId && fixture.events.some(event => event.id === eventId))
}

export function applyFixtureStatus(
  fixtures: readonly Fixture[],
  projections: readonly FixtureStatusProjection[],
): Fixture[] {
  if (projections.length === 0) return [...fixtures]
  const byId = new Map(projections.map(projection => [projection.fixture_id, projection]))
  return fixtures.map(fixture => {
    const projection = byId.get(fixture.id)
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
  const retained = fixtures.filter(fixture => !requested.has(fixture.id))
  return orderFixturesForPresentation([...retained, ...replacements])
}

export function replaceEvent(
  fixtures: readonly Fixture[],
  fixtureId: number,
  eventId: string,
  replacement: FootyEvent,
): Fixture[] {
  return fixtures.map(fixture => {
    if (fixture.id !== fixtureId || !fixture.events.some(event => event.id === eventId)) return fixture
    return {
      ...fixture,
      events: fixture.events.map(event => event.id === eventId ? replacement : event),
    }
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
    case 'event_update':
      // Event updates change an existing row only. Missing membership requires
      // an authoritative parent fixture read; appending here would invent order.
      return replaceEvent(fixtures, event.fixture_id, event.event_id, event.event)
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

  const targetEvent = target.fixture.events.find(event => event.id === target.eventId)
  const existing = fixtures.find(fixture => fixture.id === target.fixture.id)
  if (!existing) return orderFixturesForPresentation([...fixtures, target.fixture])
  if (!targetEvent) return [...fixtures]

  const merged: Fixture = {
    ...existing,
    events: existing.events.some(event => event.id === target.eventId)
      ? existing.events.map(event => event.id === target.eventId ? targetEvent : event)
      : target.fixture.events,
  }
  return fixtures.map(fixture => fixture.id === merged.id ? merged : fixture)
}

export function isFixturesResponse(value: unknown): value is FixturesResponse {
  if (!value || typeof value !== 'object') return false
  const fixtures = (value as { fixtures?: unknown }).fixtures
  return Array.isArray(fixtures) && fixtures.every(isFixture)
}

export function isSearchResponse(value: unknown): value is SearchResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return Array.isArray(response.fixtures) && response.fixtures.every(isSearchFixture) &&
    typeof response.query === 'string' && Number.isSafeInteger(response.totalFixtures)
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
    Number.isSafeInteger(fixture.id) &&
    typeof fixture.kickoff === 'string' &&
    ['playing', 'finished', 'upcoming', 'deferred'].includes(fixture.presentation_state || '') &&
    ['clock', 'status'].includes(fixture.display || '') &&
    isClock(fixture.clock) &&
    isStatus(fixture.status) &&
    isLeague(fixture.league) &&
    isSide(fixture.home) &&
    isSide(fixture.away) &&
    (fixture.penalty === null || isScore(fixture.penalty)) &&
    (fixture.last_activity_at === null || typeof fixture.last_activity_at === 'string') &&
    Array.isArray(fixture.events) && fixture.events.every(isFootyEvent)
  )
}

function isSearchFixture(value: unknown): boolean {
  if (!isFixture(value)) return false
  const match = (value as unknown as { search_match?: unknown }).search_match
  if (!match || typeof match !== 'object') return false
  const search = match as Record<string, unknown>
  return typeof search.competition === 'boolean' && typeof search.home_team === 'boolean' &&
    typeof search.away_team === 'boolean' && Array.isArray(search.events) &&
    search.events.every(candidate => {
      if (!candidate || typeof candidate !== 'object') return false
      const event = candidate as Record<string, unknown>
      return typeof event.event_id === 'string' && typeof event.player === 'boolean' &&
        typeof event.assist === 'boolean'
    })
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
  if (event.type === 'event_update') {
    return (
      Number.isSafeInteger(event.fixture_id) &&
      Number(event.fixture_id) > 0 &&
      typeof event.event_id === 'string' &&
      isFootyEvent(event.event) && event.event.id === event.event_id &&
      event.event.fixture_id === event.fixture_id
    )
  }
  return false
}

// Every asynchronous REST read records a cursor. Replay later live updates;
// when the bounded history cannot prove ordering, discard REST and resync.
export function createFootyLiveJournal(limit = 200) {
  let revision = 0
  const entries: Array<{ revision: number; event: FootyLiveEvent }> = []
  return {
    revision: () => revision,
    record(event: FootyLiveEvent) {
      entries.push({ revision: ++revision, event })
      if (entries.length > limit) entries.shift()
      return revision
    },
    missingEvents(fixtures: readonly Fixture[], after: number): EventRecovery[] {
      const missing = new Map<string, EventRecovery>()
      for (const { revision: at, event } of entries) {
        if (at <= after) continue
        if (event.type === 'event_update') {
          const key = `${event.fixture_id}:${event.event_id}`
          missing.set(key, { fixtureId: event.fixture_id, eventId: event.event_id, after: at - 1 })
        }
        if (event.type === 'fixture_update') {
          for (const fixtureId of event.fixture_ids) {
            for (const [key, recovery] of missing) {
              if (recovery.fixtureId === fixtureId) missing.delete(key)
            }
          }
        }
      }
      return [...missing.values()].filter(({ fixtureId, eventId }) => !hasEvent(fixtures, fixtureId, eventId))
    },
    replay(fixtures: readonly Fixture[], after: number): Fixture[] | null {
      if (entries.length && after < entries[0].revision - 1) return null
      return entries.filter(entry => entry.revision > after)
        .reduce((current, entry) => applyFootyLiveEvent(current, entry.event), [...fixtures])
    },
  }
}

export async function recoverFootyParent(
  fixtureId: number,
  load: () => Promise<unknown>,
  journal: ReturnType<typeof createFootyLiveJournal>,
  after = journal.revision(),
): Promise<Fixture | null> {
  const response = await load()
  if (!isFixturesResponse(response) || response.fixtures.length !== 1 || response.fixtures[0].id !== fixtureId) {
    throw new Error('parent fixture missing or invalid')
  }
  const replayed = journal.replay(response.fixtures, after)
  if (!replayed) throw new Error('parent recovery replay overflow')
  // A later authoritative fixture removal wins over this older REST read.
  return replayed.find(fixture => fixture.id === fixtureId) || null
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

function isFootyEvent(value: unknown): value is FootyEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<FootyEvent>
  return typeof event.id === 'string' && Number.isSafeInteger(event.fixture_id) &&
    ['goal', 'red_card', 'missed_penalty', 'other'].includes(event.kind || '') &&
    ['unidentified', 'confirming', 'searching', 'complete', 'removed'].includes(event.presentation_state || '') &&
    typeof event.minute === 'number' && (event.extra === null || typeof event.extra === 'number') &&
    isPlayer(event.team) && (event.player === null || isPlayer(event.player)) &&
    (event.assist === null || isPlayer(event.assist)) && isEventPresentation(event.presentation) &&
    Number.isSafeInteger(event.debounce_count) && Array.isArray(event.videos) &&
    event.videos.every(isVideo)
}

function isEventPresentation(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const presentation = value as Record<string, unknown>
  return typeof presentation.label === 'string' &&
    (presentation.team_side === null || presentation.team_side === 'home' || presentation.team_side === 'away') &&
    (presentation.score_before === null || isScore(presentation.score_before)) &&
    (presentation.score_after === null || isScore(presentation.score_after))
}

function isVideo(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const video = value as Record<string, unknown>
  return typeof video.share_id === 'string' && typeof video.url === 'string' &&
    Number.isSafeInteger(video.rank) && typeof video.verified === 'boolean' &&
    (video.extracted_minute === null || typeof video.extracted_minute === 'number') &&
    typeof video.popularity === 'number' && typeof video.width === 'number' &&
    typeof video.height === 'number' && typeof video.duration_ms === 'number'
}

function isLeague(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const league = value as Record<string, unknown>
  return typeof league.id === 'number' && typeof league.name === 'string' &&
    typeof league.season === 'number' && typeof league.country === 'string' &&
    typeof league.priority === 'number' && typeof league.round_label === 'string' &&
    ['regular_season', 'final', 'other', 'unknown'].includes(String(league.round_kind))
}

function isSide(value: unknown): boolean {
  if (!isPlayer(value)) return false
  const side = value as Record<string, unknown>
  return (side.score === null || typeof side.score === 'number') &&
    (side.winner === null || typeof side.winner === 'boolean')
}

function isPlayer(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const player = value as Record<string, unknown>
  return typeof player.id === 'number' && typeof player.name === 'string'
}

function isScore(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const score = value as Record<string, unknown>
  return typeof score.home === 'number' && typeof score.away === 'number'
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
