// Portal-facing Found Footy resources. These mirror the producer's public
// presentation contract; the BFF changes transport URLs but not football meaning.

export interface ScoreContext {
  home: number
  away: number
}

export interface Team {
  id: number
  name: string
  score: number | null
  winner: boolean | null
}

export interface Player {
  id: number
  name: string
}

export type FixturePresentationState = 'playing' | 'finished' | 'upcoming' | 'deferred'
export type FixtureDisplay = 'clock' | 'status'
export type FootyDateIntent = 'live' | 'pinned'

export interface FixtureClock {
  minute: number | null
  extra: number | null
}

export interface FixtureStatus {
  long: string
  short: string
}

export interface FixtureStatusProjection {
  fixture_id: number
  presentation_state: FixturePresentationState
  clock: FixtureClock
  status: FixtureStatus
  display: FixtureDisplay
}

export type EventKind = 'goal' | 'red_card' | 'missed_penalty' | 'other'
export type EventPresentationState = 'unidentified' | 'confirming' | 'searching' | 'complete' | 'removed'
export type TeamSide = 'home' | 'away'

export interface EventPresentation {
  label: string
  team_side: TeamSide | null
  score_before: ScoreContext | null
  score_after: ScoreContext | null
}

export interface FootyVideo {
  share_id: string
  url: string
  rank: number
  verified: boolean
  extracted_minute: number | null
  popularity: number
  width: number
  height: number
  duration_ms: number
}

export interface FootyEvent {
  id: string
  fixture_id: number
  kind: EventKind
  presentation_state: EventPresentationState
  minute: number
  extra: number | null
  team: Player
  player: Player | null
  assist: Player | null
  presentation: EventPresentation
  debounce_count: number
  videos: FootyVideo[]
}

export type LeagueRoundKind = 'regular_season' | 'final' | 'other' | 'unknown'

export interface League {
  id: number
  name: string
  season: number
  country: string
  priority: number
  round_label: string
  round_kind: LeagueRoundKind
}

export interface Fixture {
  id: number
  kickoff: string
  presentation_state: FixturePresentationState
  clock: FixtureClock
  status: FixtureStatus
  display: FixtureDisplay
  league: League
  home: Team
  away: Team
  penalty: ScoreContext | null
  last_activity_at: string | null
  events: FootyEvent[]
}

export interface FixturesResponse {
  fixtures: Fixture[]
}

export type SharedMediaState = 'available' | 'removed' | 'unknown'

export interface SharedTargetMedia {
  share_id: string
  state: SharedMediaState
}

export interface SharedEventTarget {
  eventId: string
  found: true
  date: string
  kickoff: string
  fixture: Fixture
  media: SharedTargetMedia | null
}

export interface SharedEventTargetNotFound {
  eventId: string
  found: false
}

export type SharedEventTargetResponse = SharedEventTarget | SharedEventTargetNotFound

export interface SearchEventMatch {
  event_id: string
  player: boolean
  assist: boolean
}

export interface SearchMatch {
  competition: boolean
  home_team: boolean
  away_team: boolean
  events: SearchEventMatch[]
}

export interface SearchFixture extends Fixture {
  search_match: SearchMatch
}

export interface SearchDateGroup {
  date: string
  fixtures: SearchFixture[]
}

export interface SearchResponse {
  fixtures: SearchFixture[]
  query: string
  totalFixtures: number
}
