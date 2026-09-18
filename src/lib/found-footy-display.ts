import type { Fixture, FootyEvent } from '@/types/found-footy'

// Compose backend-owned event presentation into the current visual grammar.
// Null score context is authoritative and must never fall back to final score.
export function formatEventTitle(fixture: Fixture, event: FootyEvent): string {
  const score = event.presentation.score_after
  const side = event.presentation.team_side
  if (event.kind !== 'goal' || !score) return `<<${event.team.name}>>`
  if (side === 'home') return `<<${fixture.home.name} (${score.home})>> - ${score.away} ${fixture.away.name}`
  if (side === 'away') return `${fixture.home.name} ${score.home} - <<(${score.away}) ${fixture.away.name}>>`
  return `${fixture.home.name} ${score.home} - ${score.away} ${fixture.away.name}`
}

export function formatEventSubtitle(event: FootyEvent): string {
  const time = event.extra ? `${event.minute}+${event.extra}'` : `${event.minute}'`
  const player = event.player?.name || 'Unknown'
  return event.assist?.name
    ? `${time} ${event.presentation.label} - <<${player}>> (${event.assist.name})`
    : `${time} ${event.presentation.label} - <<${player}>>`
}
