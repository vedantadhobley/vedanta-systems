import type { Fixture } from '../../types/found-footy'
import type { EventProjection } from '../../lib/found-footy-event'
import type { FootyLiveEvent } from '../../lib/found-footy-live'
import type { FootyDiagnostic } from '../../lib/found-footy-diagnostics'

export type FoundFootyLiveTopic = 'fixture_status' | 'fixture_update' | 'event_update'

export function foundFootyLiveTopic(subject: string): FoundFootyLiveTopic | null {
  const match = /^found-footy\.(dev|prod)\.(fixture\.status|fixture\.update|event\.update)$/.exec(subject)
  return match ? match[2].replace('.', '_') as FoundFootyLiveTopic : null
}

export function createFixtureUpdateBatcher(
  onBatch: (ids: number[]) => Promise<void>,
  delayMs = 250,
) {
  const pending = new Set<number>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let active: Promise<void> | null = null
  const flush = async (): Promise<void> => {
    if (timer) clearTimeout(timer)
    timer = null
    // A timer and a following status/event can both request a flush. Recheck
    // after each await so concurrent callers never overtake an active batch.
    while (active) await active
    if (!pending.size) return
    const ids = [...pending].sort((a, b) => a - b)
    pending.clear()
    active = onBatch(ids).finally(() => { active = null })
    await active
  }
  return {
    add(ids: readonly number[]) {
      for (const id of ids) if (Number.isSafeInteger(id) && id > 0) pending.add(id)
      if (!timer && pending.size) timer = setTimeout(() => { void flush() }, delayMs)
    },
    flush,
    close() {
      if (timer) clearTimeout(timer)
      timer = null
      pending.clear()
    },
  }
}

export type BridgeMessage = FootyLiveEvent | { type: 'resync'; reason: string }

export function createEventUpdateForwarder(deps: {
  fetchEvent: (eventId: string, fixtureId: number) => Promise<EventProjection | null>
  fetchFixtures: (fixtureIds: number[]) => Promise<Fixture[]>
  broadcast: (message: BridgeMessage) => void
  record: (entry: FootyDiagnostic) => void
}) {
  return async (payload: { event_id?: unknown; fixture_id?: unknown }, isCurrent = () => true) => {
    const eventId = payload.event_id
    const fixtureId = payload.fixture_id
    if (typeof eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId) ||
      typeof fixtureId !== 'number' || !Number.isSafeInteger(fixtureId) || fixtureId <= 0) {
      deps.record({ stage: 'targeted_event', outcome: 'ignored', reason: 'invalid-ids' })
      deps.broadcast({ type: 'resync', reason: 'invalid-event-update' })
      return
    }
    const ids = { event_id: eventId, fixture_id: fixtureId }
    const stale = () => {
      if (isCurrent()) return false
      deps.record({ ...ids, stage: 'targeted_event', outcome: 'ignored', reason: 'connection-changed' })
      return true
    }
    try {
      const event = await deps.fetchEvent(eventId, fixtureId)
      if (stale()) return
      if (!event || event._event_id !== eventId) throw new Error('empty-or-mismatched-event')
      deps.record({ ...ids, stage: 'targeted_event', outcome: 'fetched' })
      deps.broadcast({ type: 'event_update', ...ids, event })
    } catch {
      if (stale()) return
      // An absent/failed event read is ambiguous. Only a complete fixture read
      // may remove its events; never send a null event as a deletion patch.
      deps.record({ ...ids, stage: 'targeted_event', outcome: 'recovery', reason: 'empty-or-failed-read' })
      try {
        const fixtures = await deps.fetchFixtures([fixtureId])
        if (stale()) return
        if (fixtures.length !== 1 || fixtures[0]._id !== fixtureId) throw new Error('missing-parent')
        deps.record({ ...ids, stage: 'targeted_fixture', outcome: 'fetched' })
        deps.broadcast({ type: 'fixture_update', fixture_ids: [fixtureId], fixtures })
      } catch {
        if (stale()) return
        deps.record({ ...ids, stage: 'targeted_fixture', outcome: 'failed' })
        deps.broadcast({ type: 'resync', reason: 'event-update-recovery-failed' })
      }
    }
  }
}
