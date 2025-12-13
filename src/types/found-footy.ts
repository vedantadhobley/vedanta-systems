// Types for Found Footy data from MongoDB

export interface Team {
  id: number
  name: string
  logo?: string
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
  detail: string // 'Normal Goal', 'Penalty', 'Own Goal'
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
  _score_before: ScoreContext
  _score_after: ScoreContext
  _scoring_team: 'home' | 'away'
  _twitter_search: string
  _discovered_videos: DiscoveredVideo[]
  _s3_urls: string[]          // Legacy: flat array of URLs
  _s3_videos?: RankedVideo[]  // New: ranked videos with metadata
  _perceptual_hashes: string[]
  _monitor_complete: boolean
  _twitter_complete: boolean
  _removed: boolean
  _first_seen: string
  _twitter_completed_at?: string
}

export interface FixtureStatus {
  long: string   // 'Match Finished', 'First Half', etc.
  short: string  // 'FT', '1H', '2H', 'HT', 'NS', etc.
  elapsed: number | null
  extra: number | null  // Added time (e.g., 90+5 has extra=5)
}

export interface Fixture {
  _id: number  // fixture.id
  fixture: {
    id: number
    referee: string | null
    timezone: string
    date: string  // ISO date string
    timestamp: number
    status: FixtureStatus
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
    halftime: ScoreContext
    fulltime: ScoreContext
    extratime: ScoreContext | null
    penalty: ScoreContext | null
  }
  events: GoalEvent[]
  
  // Activity tracking
  _last_activity?: string
}

// SSE Event types
export type SSEEventType = 'initial' | 'active_update' | 'completed_update' | 'heartbeat' | 'error'

export interface SSEEvent {
  type: SSEEventType
  fixtures?: Fixture[]
  completedFixtures?: Fixture[]
  fixture?: Fixture | null
  fixtureId?: number
  operationType?: 'insert' | 'update' | 'replace' | 'delete'
  timestamp?: string
  message?: string
}

// API response types
export interface FixturesResponse {
  staging: Fixture[]
  active: Fixture[]
  completed: Fixture[]
}
