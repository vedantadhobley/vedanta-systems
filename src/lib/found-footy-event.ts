import type { Fixture, GoalEvent } from '../types/found-footy'

// Complete event-local data. Score labels and the legacy display timestamp
// require fixture context and are derived identically for snapshots and SSE.
export type EventProjection = Omit<GoalEvent,
  '_display_title' | '_display_subtitle' | '_score_before' | '_score_after' |
  '_scoring_team' | '_first_seen'>

export function withEventContext(
  fixture: { teams: Fixture['teams']; fixture: Pick<Fixture['fixture'], 'date'> },
  projections: readonly EventProjection[],
): GoalEvent[] {
  let home = 0
  let away = 0
  const chronological = [...projections].sort((a, b) =>
    a.time.elapsed - b.time.elapsed || (a.time.extra || 0) - (b.time.extra || 0))
  const contexts = new Map<string, GoalEvent>()
  for (const event of chronological) {
    const side = event.team.id === fixture.teams.home.id ? 'home' : 'away'
    const goal = !event._kind || event._kind === 'goal'
    const before = goal ? { home, away } : null
    const after = goal ? {
      home: home + (side === 'home' ? 1 : 0),
      away: away + (side === 'away' ? 1 : 0),
    } : null
    if (after && !event._removed) {
      home = after.home
      away = after.away
    }
    contexts.set(event._event_id, {
      ...event,
      _scoring_team: side,
      _score_before: before,
      _score_after: after,
      _display_title: after ? (side === 'home'
        ? `${fixture.teams.home.name} (${after.home}) - ${after.away} ${fixture.teams.away.name}`
        : `${fixture.teams.home.name} ${after.home} - (${after.away}) ${fixture.teams.away.name}`) : '',
      _display_subtitle: goal
        ? `${event.time.elapsed}${event.time.extra ? `+${event.time.extra}` : ''}' - ${event.player.name || 'Unknown'}`
        : '',
      _first_seen: new Date(new Date(fixture.fixture.date).getTime() +
        (event.time.elapsed + (event.time.extra || 0)) * 60_000).toISOString(),
    })
  }
  return projections.map(event => contexts.get(event._event_id)!)
}
