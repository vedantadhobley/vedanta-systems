// Portal-facing Found Footy resource types produced by the Pattern-B adapter.

export interface Team {
  id: number
  name: string
  logo?: string
  winner?: boolean | null  // true = won, false = lost, null = draw or not yet determined
}

export interface Player {
  id: number | null
  name: string | null
}

export interface ScoreContext {
  home: number
  away: number
}

export interface DiscoveredVideo {
  video_page_url: string
  tweet_url: string
}

// Ranked video with quality/popularity scoring
export interface RankedVideo {
  url: string
  perceptual_hash: string
  resolution_score: number  // width * height
  popularity: number        // duplicate count
  rank: number              // 1 = best
}

export interface GoalEvent {
  type: 'Goal'
  // Non-scoring searchable events. 'card' = red card, 'penalty-miss' = missed penalty. Both
  // carry clips and the detected->searching->complete lifecycle exactly like goals — the only
  // difference is no score line (and the title names the involved team, not a scoreline).
  _kind?: 'goal' | 'card' | 'penalty-miss'
  detail: string // 'Normal Goal' | 'Penalty' | 'Own Goal' — or 'Red Card' / 'Missed Penalty' for non-scoring kinds
  time: {
    elapsed: number
    extra: number | null
  }
  team: Team
  player: Player
  assist: Player
  comments: string | null
  
  // Enhanced fields (prefixed with _)
  _event_id: string
  _display_title: string      // "Real Madrid (1) - 2 Manchester City"
  _display_subtitle: string   // "28' - Rodrygo"
  _score_before: ScoreContext | null
  _score_after: ScoreContext | null
  _scoring_team: 'home' | 'away'
  _twitter_search: string
  _discovered_videos: DiscoveredVideo[]
  _s3_urls: string[]          // Legacy: flat array of URLs
  _s3_videos?: RankedVideo[]  // New: ranked videos with metadata
  _perceptual_hashes: string[]
  _monitor_complete: boolean
  _download_complete: boolean
  _removed: boolean
  _first_seen: string
  _download_completed_at?: string
}

export type FixturePresentationState = 'playing' | 'finished' | 'upcoming' | 'deferred'
export type FixtureDisplay = 'clock' | 'status'
export type FixtureProcessState = 'staging' | 'active' | 'completed'
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

export interface Fixture {
  _id: number  // fixture.id
  state: FixtureProcessState
  presentation_state: FixturePresentationState
  clock: FixtureClock
  status: FixtureStatus
  display: FixtureDisplay
  fixture: {
    id: number
    referee: string | null
    timezone: string
    date: string  // ISO date string
    timestamp: number
    venue?: {
      id: number
      name: string
      city: string
    }
  }
  league: {
    id: number
    name: string
    country: string
    logo: string
    flag: string
    season: number
    round: string
  }
  teams: {
    home: Team
    away: Team
  }
  goals: {
    home: number | null
    away: number | null
  }
  score: {
    penalty: ScoreContext | null
  }
  events: GoalEvent[]
  
  // Activity tracking
  _last_activity?: string
}

// API response types
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

// Search result types
export interface SearchMeta {
  teamMatch: boolean
  matchedEventIds: string[]
  matchCount: number
}

export interface SearchFixture extends Fixture {
  _search: SearchMeta
}

export interface SearchDateGroup {
  date: string
  fixtures: SearchFixture[]
}

export interface SearchResponse {
  results: SearchDateGroup[]
  query: string
  totalFixtures: number
}
