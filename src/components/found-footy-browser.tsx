import { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react'
import { RiCloseLine, RiCloseFill, RiShareBoxLine, RiShareBoxFill, RiDownload2Line, RiDownload2Fill, RiCheckFill, RiVidiconFill, RiScan2Line, RiHourglass2Line, RiHourglass2Fill, RiExpandUpDownLine, RiExpandUpDownFill, RiContractUpDownLine, RiContractUpDownFill, RiVolumeMuteLine, RiPlayFill, RiErrorWarningLine, RiArrowLeftSLine, RiArrowLeftSFill, RiArrowRightSLine, RiArrowRightSFill, RiArrowGoBackLine, RiArrowGoBackFill, RiArrowGoForwardLine, RiArrowGoForwardFill, RiSearchLine, RiSearchFill } from '@remixicon/react'
import type { Fixture, GoalEvent, RankedVideo, SearchDateGroup } from '@/types/found-footy'
import { cn } from '@/lib/utils'
import { useTimezone } from '@/contexts/timezone-context'
import { useTransientScrollSpace } from '@/lib/use-transient-scroll-space'
import {
  getFixturePresentationState,
  orderFixturesForPresentation,
} from '@/lib/found-footy-presentation'
import { formatFixtureIndicator } from '@/lib/found-footy-live'

/**
 * Generate event display title with <<highlighted>> markers around scoring team's score
 * Format: "Home X-(Y) Away" where scoring team's score is in parentheses and highlighted
 * Uses _score_after (score at moment of goal) and _scoring_team from the event
 */
function generateEventTitle(fixture: Fixture, event: GoalEvent): string {
  const { teams } = fixture

  // Non-scoring events (red card, missed penalty): no score line — just name the involved
  // team (highlighted). EventItem adds a kind-specific mark; _scoring_team carries which side
  // (carded offender / penalty taker). The subtitle's `detail` says which it is.
  if (event._kind === 'card' || event._kind === 'penalty-miss') {
    const team = event._scoring_team === 'home' ? teams.home.name : teams.away.name
    return `<<${team}>>`
  }

  // Use _score_after for the score at this moment, fallback to fixture goals
  const homeScore = event._score_after?.home ?? fixture.goals?.home ?? 0
  const awayScore = event._score_after?.away ?? fixture.goals?.away ?? 0
  
  // Use _scoring_team to determine which team scored
  const scoringTeamIsHome = event._scoring_team === 'home'
  
  if (scoringTeamIsHome) {
    // Home team scored - highlight home score with parentheses
    return `<<${teams.home.name} (${homeScore})>> - ${awayScore} ${teams.away.name}`
  } else {
    // Away team scored - highlight away score with parentheses
    return `${teams.home.name} ${homeScore} - <<(${awayScore}) ${teams.away.name}>>`
  }
}

// Display label for an event, from its semantic detail (+ _kind for non-scoring events). The
// shim carries the raw detail across the API; the display copy lives here (design.md: the
// backend derives phase/detail, the frontend renders it). The five events we surface today.
function formatEventDetail(detail: string, kind?: string): string {
  if (kind === 'card') return 'Red Card'
  if (kind === 'penalty-miss') return 'Penalty Miss'
  switch ((detail || '').toLowerCase()) {
    case 'normal goal':    return 'Goal'
    case 'penalty':        return 'Penalty Goal'
    case 'own goal':       return 'Own Goal'
    case 'red card':       return 'Red Card'
    case 'missed penalty': return 'Penalty Miss'
    default:               return detail || 'Goal'
  }
}

/**
 * Generate event display subtitle with <<highlighted>> markers around scorer name
 * Format: "45' Goal - <<Scorer Name>> (Assister Name)" or "45+2' Goal - <<Scorer Name>>"
 */
function generateEventSubtitle(event: GoalEvent): string {
  const timeStr = event.time.extra
    ? `${event.time.elapsed}+${event.time.extra}'`
    : `${event.time.elapsed}'`

  const eventType = formatEventDetail(event.detail, event._kind)
  const scorerName = event.player?.name || 'Unknown'
  const assistName = event.assist?.name
  
  if (assistName) {
    return `${timeStr} ${eventType} - <<${scorerName}>> (${assistName})`
  }
  return `${timeStr} ${eventType} - <<${scorerName}>>`
}

// Competition group label: "{country} - {name}". League only — NO round: fixtures within one
// league can span matchweeks on the same day, so round is a per-fixture property, not a group
// one. country is blank for some continental comps (UEFA CL / Super Cup — found-footy leaves it
// empty, not "World"), so fall back to name alone.
function competitionLabel(league: Fixture['league']): string {
  return league.country ? `${league.country} - ${league.name}` : league.name
}

// Matchweek/round for a fixture ROW. In the grouped view the header carries the league, so the
// row only shows the part that varies per fixture: "Regular Season - 5" -> "MW 5"; cup rounds
// ("Round of 64", "Final", "Group Stage") shown as-is; roundless comps -> "" (no line).
function formatRound(round: string | undefined): string {
  if (!round) return ''
  const m = round.match(/^Regular Season - (\d+)$/i)
  return m ? `Matchweek ${m[1]}` : round
}

// Synced pulse animation - all icons sync to wall clock
// Each icon calculates delay at mount: -(Date.now() % duration)
// This makes all icons appear to have started at the same epoch-aligned time
const PULSE_DURATION_MS = 2000

// Hook to get synced animation delay - calculated once at mount
function useSyncedPulseDelay(): string {
  const [delay] = useState(() => `-${Date.now() % PULSE_DURATION_MS}ms`)
  return delay
}

// Animated icons for scanning states - synced to wall clock
function ValidatingIcon({ className }: { className?: string }) {
  const delay = useSyncedPulseDelay()
  return <RiScan2Line className={cn("animate-pulse", className)} style={{ animationDelay: delay }} />
}

function ExtractingIcon({ className }: { className?: string }) {
  const delay = useSyncedPulseDelay()
  return <RiVidiconFill className={cn("animate-pulse", className)} style={{ animationDelay: delay }} />
}

// Icon for events with unknown player (no debouncing applied)
function UnknownPlayerIcon({ className }: { className?: string }) {
  return (
    <RiErrorWarningLine className={className} />
  )
}

// Check if player is unknown (null, undefined, or "Unknown")
function isUnknownPlayer(player: { name: string | null } | null | undefined): boolean {
  return !player?.name || player.name === 'Unknown'
}

// Extract the share_id from a clip URL (e.g. "s_8445a5f3a3dc" from ".../video/s_8445a5f3a3dc").
// The share_id is the stable, shareable unit — it self-upgrades to the current best clip
// (VAR-removed → 410, never-minted → 404), so a shared link never rots.
function getShareId(url: string): string {
  const match = url.match(/\/video\/(s_[a-f0-9]+)/i)
  return match?.[1] || ''
}

// Copy text to the clipboard, working in dev too. navigator.clipboard only exists in a secure
// context (HTTPS / localhost); dev is served over plain HTTP on the tailnet, where it's
// undefined — so fall back to the legacy execCommand textarea hack. Prod (HTTPS) uses the
// modern API.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Video info for modal and sharing
interface VideoInfo {
  url: string
  title: string
  subtitle: string
  eventId: string
}

// URL params for deep linking
interface InitialVideoParams {
  eventId: string
  shareId?: string  // clip share_id from ?s= — if provided, open that clip (self-upgrades)
}

interface FoundFootyBrowserProps {
  fixtures: Fixture[]
  dateIntent: 'live' | 'pinned'
  isLoading: boolean  // True until first SSE data received
  isChangingDate?: boolean  // True during date navigation (prevents scroll reset)
  initialVideo?: InitialVideoParams | null  // From URL params
  onPauseStream?: () => void   // Called when video modal opens
  onResumeStream?: () => void  // Called when video modal closes
  // Calendar navigation
  currentDate: string          // YYYY-MM-DD format
  navigableDates: string[]     // Dates the user can navigate to (descending). See FootyStreamContext.
  onGoToToday: () => void
  onPreviousDate: () => void
  onNextDate: () => void
  onNavigateToEvent?: (eventId: string) => Promise<boolean>  // Navigate to event's date (for shared links)
  // Search
  searchMode: boolean
  searchQuery: string
  searchResults: SearchDateGroup[]
  isSearching: boolean
  onEnterSearch: () => void
  onExitSearch: () => void
  onSearch: (query: string) => void
}

export function FoundFootyBrowser({ 
  fixtures,
  dateIntent,
  isLoading,
  isChangingDate,
  initialVideo,
  onPauseStream,
  onResumeStream,
  currentDate,
  navigableDates,
  onGoToToday,
  onPreviousDate,
  onNextDate,
  onNavigateToEvent,
  searchMode,
  searchQuery,
  searchResults,
  isSearching,
  onEnterSearch,
  onExitSearch,
  onSearch
}: FoundFootyBrowserProps) {
  const [expandedCompetition, setExpandedCompetition] = useState<number | null>(null)
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [videoModal, setVideoModal] = useState<VideoInfo | null>(null)
  const initialVideoProcessed = useRef(false)
  const initialVideoNavigated = useRef(false)  // Track if we've navigated to the event's date
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { spacerRef, preserveThroughNextLayout } = useTransientScrollSpace()
  
  const { mode, formatTime, getTimezoneAbbr, getDateForTimestamp, getToday } = useTimezone()
  
  // Format date for display (e.g., "Sat, Jan 25") - respects timezone mode
  const formatDateDisplay = useCallback((dateStr: string): string => {
    const date = new Date(dateStr + 'T12:00:00Z')
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: mode === 'utc' ? 'UTC' : undefined
    })
  }, [mode])
  
  // Check if viewing today (timezone-aware)
  const isToday = currentDate === getToday()
  const today = getToday()

  // Timezone-scoped search: filter staging fixtures to only those within viewable date range
  const { filteredSearchResults, filteredSearchCount } = useMemo(() => {
    if (!searchResults.length) return { filteredSearchResults: [] as SearchDateGroup[], filteredSearchCount: 0 }

    // Cutoff: max date in navigableDates (today or next future date with fixtures)
    const cutoffDate = navigableDates.length > 0
      ? navigableDates[0]  // Already sorted newest-first
      : today
    
    // Flatten, filter, and regroup by timezone-local date
    const groupMap = new Map<string, SearchDateGroup['fixtures']>()
    let count = 0
    
    for (const group of searchResults) {
      for (const fixture of group.fixtures) {
        const localDate = getDateForTimestamp(fixture.fixture.date)
        const isStaging = getFixturePresentationState(fixture) === 'upcoming'
        
        // Skip staging fixtures beyond the timezone-scoped cutoff
        if (isStaging && localDate > cutoffDate) continue
        
        count++
        const existing = groupMap.get(localDate)
        if (existing) {
          existing.push(fixture)
        } else {
          groupMap.set(localDate, [fixture])
        }
      }
    }
    
    // Sort groups by date descending (newest first)
    const sorted = [...groupMap.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, fixtures]) => ({
        date,
        fixtures: orderFixturesForPresentation(fixtures),
      }))
    
    return { filteredSearchResults: sorted, filteredSearchCount: count }
  }, [searchResults, navigableDates, today, getDateForTimestamp])

  // Check if we can navigate
  const currentIndex = navigableDates.indexOf(currentDate)
  const nextDateInList = navigableDates.find(d => d > currentDate)
  const canGoNext = currentIndex > 0 || (currentIndex === -1 && !!nextDateInList)
  const canGoPrevious = currentIndex < navigableDates.length - 1 || (currentIndex === -1 && navigableDates.some(d => d < currentDate))
  
  // Memoize close handler to prevent VideoModal re-renders
  const closeVideoModal = useCallback(() => {
    setVideoModal(null)
    // Resume SSE connection when video closes
    onResumeStream?.()
  }, [onResumeStream])
  
  // Open video modal and pause SSE to reduce memory pressure
  const openVideoModal = useCallback((info: VideoInfo) => {
    // Pause SSE connection when video opens
    onPauseStream?.()
    setVideoModal(info)
  }, [onPauseStream])

  const allFixtures = useMemo(() => orderFixturesForPresentation(fixtures), [fixtures])

  // Toggle fixture - close others
  const toggleFixture = useCallback((fixtureId: number) => {
    preserveThroughNextLayout()
    setExpandedFixture(prev => prev === fixtureId ? null : fixtureId)
    setExpandedEvent(null) // Close any open event
  }, [preserveThroughNextLayout])

  // Toggle event - close others
  const toggleEvent = useCallback((eventId: string) => {
    preserveThroughNextLayout()
    setExpandedEvent(prev => prev === eventId ? null : eventId)
  }, [preserveThroughNextLayout])

  // Toggle competition — one league open at a time (same accordion rule as fixtures/events).
  // Switching leagues resets the inner fixture/event accordion; their path belongs to the
  // league being collapsed.
  const toggleCompetition = useCallback((leagueId: number) => {
    preserveThroughNextLayout()
    setExpandedCompetition(prev => prev === leagueId ? null : leagueId)
    setExpandedFixture(null)
    setExpandedEvent(null)
  }, [preserveThroughNextLayout])

  // Handle navigating to the correct date for shared video links
  useEffect(() => {
    if (!initialVideo || initialVideoNavigated.current || !onNavigateToEvent) return
    
    // Mark as navigated immediately to prevent multiple calls
    initialVideoNavigated.current = true
    
    // Look up the event's date and navigate there
    onNavigateToEvent(initialVideo.eventId).then(found => {
      if (!found) {
        console.warn('[FoundFooty] Shared video event not found')
      }
    })
  }, [initialVideo, onNavigateToEvent])

  // Handle opening video from URL params (shared link) - runs after date navigation
  useEffect(() => {
    if (!initialVideo || allFixtures.length === 0 || initialVideoProcessed.current) return
    
    // Find the fixture and event in the current fixtures
    for (const fixture of allFixtures) {
      const event = fixture.events?.find(e => e._event_id === initialVideo.eventId)
      if (event) {
        // Mark as processed so we don't re-run on fixture updates
        initialVideoProcessed.current = true
        
        // Expand the fixture and event (and open their competition — collapsed by default)
        setExpandedCompetition(fixture.league.id)
        setExpandedFixture(fixture._id)
        setExpandedEvent(event._event_id)
        
        // If a share_id was provided, open that clip. The shared share_id may have been
        // SUPERSEDED (a better clip replaced it, so it's no longer among the event's current
        // videos) — but /video/:shareId still self-resolves to the current best clip, so open
        // the modal on the share_id URL directly rather than requiring an exact match against
        // the current list. (A never-minted / VAR-removed id will 404/410 at the <video> —
        // the rare edge; the common case is supersession, which upgrades cleanly.)
        // Defer modal opening to next frame to prevent UI freeze on slower devices.
        if (initialVideo.shareId) {
          const videos = event._s3_videos || []
          const matched = videos.find(v => getShareId(v.url) === initialVideo.shareId)
          const url = matched?.url || `/api/found-footy/video/${initialVideo.shareId}`
          // Use double rAF to ensure DOM has updated before opening modal
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Pause SSE before opening video modal
              onPauseStream?.()
              setVideoModal({
                url,
                title: generateEventTitle(fixture, event),
                subtitle: generateEventSubtitle(event),
                eventId: event._event_id
              })
            })
          })
        }
        break
      }
    }
  }, [initialVideo, allFixtures, onPauseStream])

  // Update URL when video modal changes - only after user interaction
  const hasOpenedVideoRef = useRef(false)
  useEffect(() => {
    if (videoModal) {
      hasOpenedVideoRef.current = true
      // Reflect the clip's share_id in the URL so it's shareable / survives refresh
      const shareId = getShareId(videoModal.url)
      const shareUrl = shareId
        ? `/workspace/found-footy?v=${videoModal.eventId}&s=${shareId}`
        : `/workspace/found-footy?v=${videoModal.eventId}`
      window.history.replaceState(null, '', shareUrl)
    } else if (hasOpenedVideoRef.current) {
      // Only reset URL if user previously opened a video
      window.history.replaceState(null, '', '/workspace/found-footy')
    }
  }, [videoModal])

  // Format kickoff time like "19:30 EST" - respects timezone toggle
  const formatKickoff = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    return `${formatTime(date)} ${getTimezoneAbbr()}`
  }, [formatTime, getTimezoneAbbr])

  // A live view carries every playing fixture across a date boundary. Pinned
  // views remain scoped to the explicitly selected timezone-local kickoff day.
  const currentFilteredFixtures = useMemo(
    () => orderFixturesForPresentation(allFixtures.filter(fixture => (
      dateIntent === 'live' && fixture.presentation_state === 'playing'
    ) || getDateForTimestamp(fixture.fixture.date) === currentDate)),
    [allFixtures, currentDate, dateIntent, getDateForTimestamp],
  )
  
  // Keep a ref of the last non-empty fixtures to show during date transitions
  // This prevents layout collapse when filtering returns 0 results during date change
  const lastFixturesRef = useRef<Fixture[]>([])
  
  // Update lastFixturesRef when we have new data, clear old ref to free memory
  useEffect(() => {
    if (!isChangingDate && currentFilteredFixtures.length > 0) {
      // Replace ref content entirely (don't accumulate)
      lastFixturesRef.current = currentFilteredFixtures
    } else if (isChangingDate) {
      // When starting a date change, we keep the old fixtures for display
      // but they'll be replaced when new data arrives
    }
  }, [isChangingDate, currentFilteredFixtures])
  
  // Close expanded fixture and video when date changes to prevent stale references
  useEffect(() => {
    setExpandedCompetition(null)
    setExpandedFixture(null)
    setExpandedEvent(null)
    // Don't close video modal - let user finish watching
  }, [currentDate])
  
  // During date change, show old fixtures to prevent layout collapse
  // Once new data arrives (isChangingDate becomes false), show new fixtures
  const allDateFixtures = isChangingDate && currentFilteredFixtures.length === 0 
    ? lastFixturesRef.current 
    : currentFilteredFixtures

  // Group fixtures by competition (league.id — country is unreliable, blank for UEFA comps).
  // WITHIN a group, fixtures keep allDateFixtures' status-primary order (live -> finished ->
  // upcoming). The GROUPS sort by league.id ASCENDING: API-Football numbers marquee comps low
  // (2 CL, 3 EL, 39 PL, 140 La Liga), so the big ones float up — and it's STABLE, which matters
  // because these are collapsible: the live badge signals action in place instead of sections
  // reshuffling under you. liveCount follows the explicit playing presentation state, not the
  // monitor's active transport bucket.
  const competitionGroups = useMemo(() => {
    const groups = new Map<number, { league: Fixture['league']; fixtures: Fixture[] }>()
    for (const f of allDateFixtures) {
      const id = f.league.id
      let grp = groups.get(id)
      if (!grp) { grp = { league: f.league, fixtures: [] }; groups.set(id, grp) }
      grp.fixtures.push(f)
    }
    return Array.from(groups.values())
      .map(g => ({
        ...g,
        liveCount: g.fixtures.filter(f => getFixturePresentationState(f) === 'playing').length,
        // A final can't be collapsed (see render). Match round EXACTLY "Final" so semis /
        // quarters don't qualify. Finals are ~always their single fixture.
        isFinal: g.fixtures.length > 0 && g.fixtures.every(f => (f.league?.round || '').trim().toLowerCase() === 'final'),
      }))
      .sort((a, b) => a.league.id - b.league.id)
  }, [allDateFixtures])

  // Check if we have any fixtures for this date
  const hasFixtures = allDateFixtures.length > 0

  return (
    <div className="font-mono" style={{ fontSize: 'var(--text-size-base)' }}>
      {/* System advisory */}
      <div className="mb-6 border border-corpo-border/50 bg-corpo-bg/50 p-4">
        <div className="space-y-2 text-corpo-text/60 text-sm font-light">
          <div className="text-corpo-text/40 uppercase tracking-wider text-xs">
            // SYSTEM ADVISORY
          </div>
          <p>
            Automated content aggregation system. Video feeds are not manually filtered.
            Content may include material unsuitable for all viewers. Viewer discretion advised.
          </p>
          <p className="text-corpo-text/40">
            No endorsement implied. All footage property of respective rights holders.
          </p>
        </div>
      </div>

      {/* Navigation bar - uses global .nav-btn CSS from header.tsx */}
      <div className="mb-4 flex items-center justify-between border border-corpo-border bg-corpo-bg/50 px-3 py-2">
        {searchMode ? (
          <>
            {/* Search mode: back button, input, clear */}
            <button
              onClick={onExitSearch}
              onTouchStart={() => {}}
              className="nav-btn flex items-center p-1"
              aria-label="Exit search"
            >
              <RiArrowLeftSLine className="icon-line w-5 h-5" />
              <RiArrowLeftSFill className="icon-fill w-5 h-5" />
            </button>
            
            <form
              className="flex-1 flex mx-2"
              onSubmit={(e) => {
                e.preventDefault()
                searchInputRef.current?.blur()
              }}
            >
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search teams, players..."
                className="flex-1 bg-transparent border-none outline-none text-corpo-text font-medium text-center placeholder:text-corpo-text/30 [&::-webkit-search-cancel-button]:hidden"
                style={{ fontSize: 'var(--text-size-base)' }}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </form>
            
            <button
              onMouseDown={(e) => {
                // Prevent button from stealing focus from input (keeps keyboard open on mobile)
                e.preventDefault()
              }}
              onClick={() => {
                onSearch('')
                searchInputRef.current?.focus()
              }}
              onTouchStart={() => {}}
              disabled={!searchQuery}
              className="nav-btn flex items-center p-1"
              aria-label="Clear search"
            >
              <RiCloseLine className="icon-line w-5 h-5" />
              <RiCloseFill className="icon-fill w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            {/* Normal mode: < Date with search/today icons > */}
            <button
              onClick={onPreviousDate}
              onTouchStart={() => {}}
              disabled={!canGoPrevious}
              className="nav-btn flex items-center p-1"
              aria-label="Previous date"
            >
              <RiArrowLeftSLine className="icon-line w-5 h-5" />
              <RiArrowLeftSFill className="icon-fill w-5 h-5" />
            </button>
            
            {/* Center group: search icon, date, today icon */}
            <div className="flex items-center gap-3">
              <button
                onClick={onEnterSearch}
                onTouchStart={() => {}}
                className="nav-btn flex items-center p-1"
                aria-label="Search"
              >
                <RiSearchLine className="icon-line w-4 h-4" />
                <RiSearchFill className="icon-fill w-4 h-4" />
              </button>
              <span className="text-corpo-text font-medium">
                {formatDateDisplay(currentDate)}
              </span>
              {isToday ? (
                <span className="p-1 text-lavender" aria-label="Currently on today">
                  <RiCheckFill className="w-4 h-4" />
                </span>
              ) : currentDate < today ? (
                <button
                  onClick={onGoToToday}
                  onTouchStart={() => {}}
                  className="nav-btn flex items-center p-1"
                  aria-label="Go to today"
                >
                  <RiArrowGoForwardLine className="icon-line w-4 h-4" />
                  <RiArrowGoForwardFill className="icon-fill w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={onGoToToday}
                  onTouchStart={() => {}}
                  className="nav-btn flex items-center p-1"
                  aria-label="Go to today"
                >
                  <RiArrowGoBackLine className="icon-line w-4 h-4" />
                  <RiArrowGoBackFill className="icon-fill w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Next button */}
            <button
              onClick={onNextDate}
              onTouchStart={() => {}}
              disabled={!canGoNext}
              className="nav-btn flex items-center p-1"
              aria-label="Next date"
            >
              <RiArrowRightSLine className="icon-line w-5 h-5" />
              <RiArrowRightSFill className="icon-fill w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Content: search results or normal fixture list */}
      {searchMode ? (
        <div>
          {isSearching ? (
            <div className="text-corpo-text/50 py-8 text-center">
              <span className="animate-pulse">Searching...</span>
            </div>
          ) : searchQuery.trim().length < 2 ? (
            <div className="text-corpo-text/40 py-8 text-center font-light">
              Type at least 2 characters to search
            </div>
          ) : filteredSearchResults.length === 0 ? (
            <div className="text-corpo-text/50 py-8 text-center">
              No results for "{searchQuery}"
            </div>
          ) : (
            <>
              <div className="text-lavender text-sm font-light mb-3 px-1">
                {filteredSearchCount} fixture{filteredSearchCount !== 1 ? 's' : ''} found
              </div>
              {filteredSearchResults.map((group, groupIndex) => (
                <div key={group.date} className={cn("mb-3", groupIndex > 0 && "mt-6")}>
                  {/* Date header */}
                  <div className="text-corpo-text/50 text-sm font-light mb-1 px-1 uppercase tracking-wider">
                    {formatDateDisplay(group.date)}
                  </div>
                  <div className="space-y-1">
                    {group.fixtures.map(fixture => {
                      const isPending = getFixturePresentationState(fixture) === 'upcoming'
                      return isPending ? (
                        <StagingFixtureItem
                          key={fixture._id}
                          fixture={fixture}
                          formatKickoff={formatKickoff}
                          searchTeamMatch={fixture._search?.teamMatch}
                        />
                      ) : (
                        <FixtureItem
                          key={fixture._id}
                          fixture={fixture}
                          isExpanded={expandedFixture === fixture._id}
                          expandedEvent={expandedEvent}
                          onToggle={() => toggleFixture(fixture._id)}
                          onToggleEvent={toggleEvent}
                          onOpenVideo={openVideoModal}
                          searchMatchedEventIds={fixture._search?.matchedEventIds}
                          searchTeamMatch={fixture._search?.teamMatch}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        /* Normal fixtures list for current date */
        <div className="space-y-1">
          {isLoading ? (
            <div className="text-corpo-text/50 py-8 text-center">
              <span className="animate-pulse">Loading fixtures...</span>
            </div>
          ) : !hasFixtures && !isChangingDate ? (
            <div className="text-corpo-text/50 py-8 text-center">
              No fixtures for {formatDateDisplay(currentDate)}
            </div>
          ) : (
            <>
              {competitionGroups.map(group => {
                const isFinal = group.isFinal
                const isOpen = isFinal || expandedCompetition === group.league.id
                return (
                  <div key={group.league.id}>
                    {isFinal ? (
                      /* Finals are never hidden — the filled down arrow, permanently (open + locked). No toggle. */
                      <div
                        className="w-full flex items-center gap-2 px-1 py-1.5"
                        style={{ fontSize: 'var(--text-size-base)' }}
                      >
                        <RiArrowRightSFill className="w-4 h-4 transition-none flex-shrink-0 text-lavender/70 rotate-90" />
                        <span className="flex-1 min-w-0 truncate text-lavender/70 font-light uppercase tracking-wider">
                          {competitionLabel(group.league)}
                        </span>
                        {group.liveCount > 0 && (
                          <span className="flex-shrink-0 text-xs font-light uppercase tracking-wider tabular-nums" style={{ color: '#e5484d' }}>
                            {group.liveCount} live
                          </span>
                        )}
                      </div>
                    ) : (
                      /* Competition header — collapsible; one league open at a time */
                      <button
                        onClick={() => toggleCompetition(group.league.id)}
                        onTouchStart={() => {}} // required for iOS :active (group-active) to fire
                        className="group w-full flex items-center gap-2 px-1 py-1.5 text-left transition-none"
                        style={{ fontSize: 'var(--text-size-base)' }}
                      >
                        {/* Line by default, Fill on hover/active — same pattern as the fixture
                            icons, but color held at lavender (no dim→bright). Rotates to point
                            down when open. */}
                        <RiArrowRightSLine className={cn(
                          "w-4 h-4 transition-none flex-shrink-0 text-lavender/70 group-hover:hidden group-active:hidden",
                          isOpen && "rotate-90"
                        )} />
                        <RiArrowRightSFill className={cn(
                          "w-4 h-4 transition-none flex-shrink-0 text-lavender/70 hidden group-hover:block group-active:block",
                          isOpen && "rotate-90"
                        )} />
                        <span className="flex-1 min-w-0 truncate text-lavender/70 font-light uppercase tracking-wider">
                          {competitionLabel(group.league)}
                        </span>
                        {group.liveCount > 0 && (
                          <span className="flex-shrink-0 text-xs font-light uppercase tracking-wider tabular-nums" style={{ color: '#e5484d' }}>
                            {group.liveCount} live
                          </span>
                        )}
                        <span className="flex-shrink-0 tabular-nums text-corpo-text/40 text-sm">
                          [{group.fixtures.length}]
                        </span>
                      </button>
                    )}
                    {isOpen && (
                      <div className="space-y-1 mt-1 mb-2">
                        {group.fixtures.map(fixture => {
                          // Check if fixture is still pending (not started)
                          const isPending = getFixturePresentationState(fixture) === 'upcoming'

                          return isPending ? (
                            <StagingFixtureItem
                              key={fixture._id}
                              fixture={fixture}
                              formatKickoff={formatKickoff}
                              roundOnly
                            />
                          ) : (
                            <FixtureItem
                              key={fixture._id}
                              fixture={fixture}
                              isExpanded={expandedFixture === fixture._id}
                              expandedEvent={expandedEvent}
                              onToggle={() => toggleFixture(fixture._id)}
                              onToggleEvent={toggleEvent}
                              onOpenVideo={openVideoModal}
                              roundOnly
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      <div ref={spacerRef} aria-hidden="true" />

      {/* Video Modal */}
      {videoModal && (
        <MemoizedVideoModal 
          url={videoModal.url} 
          title={videoModal.title}
          subtitle={videoModal.subtitle}
          eventId={videoModal.eventId}
          onClose={closeVideoModal} 
        />
      )}
    </div>
  )
}

// Staging fixture item - matches FixtureItem style but shows countdown to kickoff
interface StagingFixtureItemProps {
  fixture: Fixture
  formatKickoff: (dateStr: string) => string
  searchTeamMatch?: boolean
  roundOnly?: boolean   // grouped view: header owns the league, so the row shows only the matchweek
}

function StagingFixtureItem({ fixture, formatKickoff, searchTeamMatch, roundOnly }: StagingFixtureItemProps) {
  const [countdown, setCountdown] = useState<string>('')

  const { teams, fixture: fixtureInfo, league } = fixture
  const kickoffTime = formatKickoff(fixtureInfo.date)
  const competitionText = roundOnly
    ? formatRound(league?.round)
    : (league ? `${league.country} - ${league.name}${league.round ? ` (${league.round})` : ''}` : 'Unknown Competition')
  
  // Calculate and update countdown - synced to minute boundary
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null
    
    const updateCountdown = () => {
      const now = new Date()
      const kickoff = new Date(fixtureInfo.date)
      const diff = kickoff.getTime() - now.getTime()
      
      if (diff <= 0) {
        setCountdown('Starting...')
        return
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      
      if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m`)
      } else {
        setCountdown(`${minutes}m`)
      }
    }
    
    updateCountdown()
    
    // Calculate ms until next minute boundary
    const now = new Date()
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
    
    // First timeout syncs to minute boundary, then interval every 60s
    const timeoutId = setTimeout(() => {
      updateCountdown()
      intervalId = setInterval(updateCountdown, 60000)
    }, msUntilNextMinute)
    
    return () => {
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [fixtureInfo.date])

  return (
    <div className={cn("border border-corpo-border", searchTeamMatch && "shadow-[inset_2px_0_0_0_hsl(var(--lavender))]")}>
      <div
        className="group w-full flex items-center gap-2 px-3 py-2 text-left transition-none text-corpo-text hover:text-corpo-light"
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        {/* Hourglass icon for pending fixtures - filled on hover via CSS */}
        <RiHourglass2Line className="w-4 h-4 flex-shrink-0 text-corpo-text/50 group-hover:hidden" />
        <RiHourglass2Fill className="w-4 h-4 flex-shrink-0 text-corpo-text/50 hidden group-hover:block" />
        
        {/* Each row owns its right-hand content independently. The longer
            schedule must not reserve that width beside the team names. */}
        <span className="flex-1 flex flex-col min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate flex-1 min-w-0">
              <span>{teams.home.name}</span>
              <span className="text-corpo-text/50 mx-2">vs</span>
              <span>{teams.away.name}</span>
            </span>
            <span className="text-corpo-text/60 flex-shrink-0 font-light" title={fixture.status.long}>
              {formatFixtureIndicator(fixture)}
            </span>
          </span>
          <span className="flex items-baseline gap-2 min-w-0 text-sm font-light">
            {competitionText && (
              <span className={cn("truncate flex-1 min-w-0", competitionText === 'Final' ? "text-lavender" : "text-corpo-text/40")}>{competitionText}</span>
            )}
            <span className="ml-auto text-corpo-text/40 flex-shrink-0 tabular-nums">
              {kickoffTime}{countdown && ` · ${countdown}`}
            </span>
          </span>
        </span>
      </div>
    </div>
  )
}

// Date section header - UNUSED since calendar nav shows one day at a time
// Keeping for potential future use with week view
// interface DateSectionProps {
//   dateKey: string
//   date: Date
//   fixtureCount: number
//   formatDate: (date: Date) => string
//   children: React.ReactNode
// }
// function DateSection({ date, fixtureCount, formatDate, children }: DateSectionProps) { ... }

interface FixtureItemProps {
  fixture: Fixture
  isExpanded: boolean
  expandedEvent: string | null
  onToggle: () => void
  onToggleEvent: (eventId: string) => void
  onOpenVideo: (info: VideoInfo) => void
  searchMatchedEventIds?: string[]  // Event IDs that matched the search query
  searchTeamMatch?: boolean          // True if fixture matched via team name
  roundOnly?: boolean                // grouped view: row shows only the matchweek
}

function FixtureItem({ 
  fixture, 
  isExpanded, 
  expandedEvent, 
  onToggle, 
  onToggleEvent,
  onOpenVideo,
  searchMatchedEventIds,
  searchTeamMatch,
  roundOnly
}: FixtureItemProps) {
  
  const { teams, goals, score, events, league } = fixture
  const competitionText = roundOnly
    ? formatRound(league?.round)
    : (league ? `${league.country} - ${league.name}${league.round ? ` (${league.round})` : ''}` : 'Unknown Competition')
  const isLive = getFixturePresentationState(fixture) === 'playing'
  const hasScore = goals?.home != null && goals?.away != null
  const showPenaltyScore = hasScore && score?.penalty != null
  const isFinished = getFixturePresentationState(fixture) === 'finished'
  const homeWins = isFinished && teams.home.winner === true
  const awayWins = isFinished && teams.away.winner === true

  // Empty deferred fixtures have nothing to expand. This is data-driven; the
  // browser does not interpret provider status codes to decide interactivity.
  if (
    getFixturePresentationState(fixture) === 'deferred' &&
    events.length === 0 &&
    (goals?.home == null || goals.home === 0) &&
    (goals?.away == null || goals.away === 0)
  ) {
    return (
      <div className="border border-corpo-border">
        <div className="w-full flex items-center gap-2 px-3 py-2 text-corpo-text/50" style={{ fontSize: 'var(--text-size-base)' }}>
          {/* spacer keeps teams aligned with the other rows; no toggle — not clickable */}
          <span className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          {/* Teams with 'vs' (same layout as a not-started match) + competition subtitle */}
          <span className="flex-1 flex flex-col min-w-0">
            <span className="truncate flex items-center">
              <span>{teams.home.name}</span>
              <span className="text-corpo-text/50 mx-2">vs</span>
              <span>{teams.away.name}</span>
            </span>
            {competitionText && (
              <span className={cn("text-sm truncate font-light", competitionText === 'Final' ? "text-lavender" : "text-corpo-text/40")}>{competitionText}</span>
            )}
          </span>
          {/* Status on the right, where the kickoff time sits for a pending match */}
          <span
            className="flex-shrink-0 text-sm uppercase tracking-wider text-corpo-text/40"
            title={fixture.status.long}
          >
            {formatFixtureIndicator(fixture)}
          </span>
        </div>
      </div>
    )
  }

  // Sort events by _first_seen descending (most recent first)
  const sortedEvents = [...(events || [])].sort((a, b) => {
    const aTime = a._first_seen ? new Date(a._first_seen).getTime() : 0
    const bTime = b._first_seen ? new Date(b._first_seen).getTime() : 0
    return bTime - aTime
  })
  
  // Check if any event in this fixture is still scanning
  const hasActiveScanning = sortedEvents.some(e => !e._download_complete)
  const hasValidating = sortedEvents.some(e => !e._monitor_complete && !isUnknownPlayer(e.player))
  const hasExtracting = sortedEvents.some(e => e._monitor_complete && !e._download_complete)

  return (
    <div className={cn("border border-corpo-border", searchTeamMatch && "shadow-[inset_2px_0_0_0_hsl(var(--lavender))]")}>
      <button
        onClick={onToggle}
        className="group w-full flex items-center gap-2 px-3 py-2 text-left transition-none text-corpo-text hover:text-corpo-light active:text-lavender"
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        {/* Icons: Line version by default, Fill version on hover/active via CSS */}
        {isExpanded ? (
          <>
            <RiContractUpDownLine className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiContractUpDownFill className="w-4 h-4 transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        ) : (
          <>
            <RiExpandUpDownLine className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiExpandUpDownFill className="w-4 h-4 transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        )}
        
        {/* Fixture title with scanning indicator on right */}
        <span className="flex-1 flex flex-col min-w-0">
          <span className="truncate flex items-center">
            <span className={cn(homeWins && "text-lavender")}>{teams.home.name}</span>
            <span className="text-corpo-text/50 mx-2">
              {showPenaltyScore 
                ? `${goals.home} (${score.penalty!.home}) - (${score.penalty!.away}) ${goals.away}`
                : hasScore ? `${goals.home} - ${goals.away}` : 'vs'
              }
            </span>
            <span className={cn(awayWins && "text-lavender")}>{teams.away.name}</span>
          </span>
          {/* Competition line — full in search; just the matchweek in the grouped view */}
          {competitionText && (
            <span className={cn("text-sm truncate font-light", competitionText === 'Final' ? "text-lavender" : "text-corpo-text/40")}>{competitionText}</span>
          )}
          
        </span>
        
        {/* Status indicator - only show one icon at fixture level, priority: extracting > validating */}
        {hasActiveScanning && (
          <span className="text-lavender/70 flex-shrink-0">
            {hasExtracting ? (
              <ExtractingIcon className="w-4 h-4" />
            ) : hasValidating ? (
              <ValidatingIcon className="w-4 h-4" />
            ) : null}
          </span>
        )}
        
        {/* Search match indicator - icon with count, mirrors scanning indicator */}
        {searchMatchedEventIds && searchMatchedEventIds.length > 0 && (
          <span className="text-lavender flex items-center gap-1 flex-shrink-0">
            <RiSearchFill className="w-4 h-4" />
            <span className="text-sm font-light">{searchMatchedEventIds.length}</span>
          </span>
        )}
        
        {/* Status on far right */}
        <span className={cn(
          "text-corpo-text/60 flex-shrink-0 font-light",
          isLive && "text-lavender"
        )} title={fixture.status.long}>
          {formatFixtureIndicator(fixture)}
        </span>
      </button>

      {/* Events (goals) - collapsed content with vertical line */}
      {isExpanded && (
        <div className="ml-4 border-l border-corpo-border">
          {sortedEvents.length === 0 ? (
            <div className="pl-4 pr-3 py-3 text-corpo-text/40 font-light" style={{ fontSize: 'var(--text-size-base)' }}>
              No goals yet
            </div>
          ) : (
            <div>
              {sortedEvents.map(event => (
                <EventItem
                  key={event._event_id}
                  event={event}
                  fixture={fixture}
                  isExpanded={expandedEvent === event._event_id}
                  onToggle={() => onToggleEvent(event._event_id)}
                  onOpenVideo={onOpenVideo}
                  isSearchMatch={searchMatchedEventIds?.includes(event._event_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Helper to parse <<highlighted>> markers and render with lavender color
function HighlightedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(<<.+?>>)/g)
  
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const match = part.match(/^<<(.+?)>>$/)
        if (match) {
          return <span key={i} className="text-lavender">{match[1]}</span>
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

interface EventItemProps {
  event: GoalEvent
  fixture: Fixture
  isExpanded: boolean
  onToggle: () => void
  onOpenVideo: (info: VideoInfo) => void
  isSearchMatch?: boolean
}

function EventItem({ event, fixture, isExpanded, onToggle, onOpenVideo, isSearchMatch }: EventItemProps) {
  
  // Get videos - prefer ranked _s3_videos, fall back to legacy _s3_urls
  const rankedVideos: (RankedVideo | { url: string; rank: number; perceptual_hash?: string })[] = event._s3_videos 
    ? [...event._s3_videos].sort((a, b) => a.rank - b.rank)  // Sort by rank (1 = best)
    : event._s3_urls?.map((url, idx) => ({ url, rank: idx + 1, perceptual_hash: undefined })) || []
  
  const videoCount = rankedVideos.length
  
  // Scanning states:
  // - _monitor_complete = false: Debounce/validating (event just detected, waiting for stability)
  // - _monitor_complete = true && _download_complete = false: Extracting clips from Twitter
  // - Both true: All scanning complete
  // - Unknown player: No debouncing, goes straight to extraction
  const hasUnknownPlayer = isUnknownPlayer(event.player)
  const isValidating = !event._monitor_complete && !hasUnknownPlayer
  const isExtracting = event._monitor_complete === true && !event._download_complete
  const isStillScanning = isValidating || isExtracting

  // Use generated display strings for video modal
  const videoTitle = generateEventTitle(fixture, event)
  const videoSubtitle = generateEventSubtitle(event)

  // Create VideoInfo for a specific video
  const makeVideoInfo = (video: typeof rankedVideos[0]): VideoInfo => ({
    url: video.url,
    title: videoTitle,
    subtitle: videoSubtitle,
    eventId: event._event_id
  })

  return (
    <div className={cn(isSearchMatch && "shadow-[inset_2px_0_0_0_hsl(var(--lavender))]")}>
      {/* Event header - two lines: title and subtitle */}
      <button
        onClick={onToggle}
        className="group w-full flex items-center gap-2 px-3 py-2 text-left transition-none text-corpo-text hover:text-corpo-light active:text-lavender"
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        {/* Icons: Line version by default, Fill version on hover/active via CSS */}
        {isExpanded ? (
          <>
            <RiContractUpDownLine className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiContractUpDownFill className="w-4 h-4 transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        ) : (
          <>
            <RiExpandUpDownLine className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiExpandUpDownFill className="w-4 h-4 transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        )}
        
        {/* Two-line content: title on top, subtitle below */}
        <div className="flex-1 min-w-0">
          {/* Title line: score at moment of goal (or carded team for a red card) */}
          <div className="flex items-center gap-2">
            {event._kind === 'card' && (
              <span
                className="inline-block flex-shrink-0"
                style={{ width: '10px', height: '14px', background: '#e5484d' }}
                title="Red card"
              />
            )}
            {event._kind === 'penalty-miss' && (
              <span className="inline-flex flex-shrink-0" title="Penalty missed">
                <RiCloseFill className="w-3.5 h-3.5" style={{ color: '#e5484d' }} />
              </span>
            )}
            <span className="truncate">
              <HighlightedText text={generateEventTitle(fixture, event)} />
            </span>
            {/* Status indicators - right of title */}
            {hasUnknownPlayer && (
              <span className="text-corpo-text/50 flex-shrink-0" title="Unknown player - no debouncing">
                <UnknownPlayerIcon className="w-4 h-4" />
              </span>
            )}
            {isStillScanning && (
              <span className="text-lavender/70 flex-shrink-0" title={isValidating ? "Validating event..." : "Extracting clips..."}>
                {isValidating ? (
                  <ValidatingIcon className="w-4 h-4" />
                ) : (
                  <ExtractingIcon className="w-4 h-4" />
                )}
              </span>
            )}
          </div>
          {/* Subtitle line: time, player, assist - with <<highlighted>> scorer */}
          <div className="text-corpo-text/50 truncate text-sm">
            <HighlightedText text={generateEventSubtitle(event)} />
          </div>
        </div>
        
        {/* Clip count on far right */}
        <span className={cn(
          "tabular-nums flex-shrink-0 mt-0.5",
          videoCount > 0 ? "text-corpo-text/60" : "text-corpo-text/30"
        )}>
          [{videoCount}]
        </span>
      </button>

      {/* Videos - collapsed content */}
      {isExpanded && (
        <div className="ml-4">
          <div className="pl-4 pr-3 py-2" style={{ fontSize: 'var(--text-size-base)' }}>
            {/* 
              Three states:
              1. isStillScanning + no clips: Still scanning, clips may appear
              2. !isStillScanning + no clips: Scan complete, no clips found  
              3. Has clips: Show them (with optional "still scanning" indicator)
            */}
            {isValidating && videoCount === 0 ? (
              // State 1a: Validating - event just detected, checking if real
              <div className="flex items-center gap-2 text-lavender/70">
                <ValidatingIcon className="w-4 h-4" />
                <span>validating...</span>
              </div>
            ) : isExtracting && videoCount === 0 ? (
              // State 1b: Extracting - actively fetching clips from Twitter
              <div className="flex items-center gap-2 text-lavender/70">
                <ExtractingIcon className="w-4 h-4" />
                <span>extracting...</span>
              </div>
            ) : videoCount === 0 ? (
              // State 2: Scan complete, nothing found
              <span className="text-corpo-text/40">no clips found</span>
            ) : (
              // State 3: We have clips
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  {rankedVideos.map((video) => (
                    <ClipButton 
                      key={video.url} 
                      index={video.rank}
                      isBest={video.rank === 1}
                      onClick={() => onOpenVideo(makeVideoInfo(video))}
                    />
                  ))}
                </div>
                {/* Still scanning indicator AFTER clips - shows status text in dropdown */}
                {isStillScanning && (
                  <div className="flex items-center gap-2 text-lavender/60 text-sm">
                    {isValidating ? (
                      <>
                        <ValidatingIcon className="w-3.5 h-3.5" />
                        <span>validating...</span>
                      </>
                    ) : (
                      <>
                        <ExtractingIcon className="w-3.5 h-3.5" />
                        <span>extracting...</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface ClipButtonProps {
  index: number
  isBest?: boolean
  onClick: () => void
}

function ClipButton({ index, isBest, onClick }: ClipButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={`Play clip ${index}${isBest ? ', best available clip' : ''}`}
      className={cn(
        "w-7 h-7 border flex items-center justify-center transition-none font-mono leading-none",
        "hover:border-corpo-light hover:text-corpo-light",
        "active:border-lavender active:text-lavender active:bg-lavender/10",
        isBest
          ? "border-lavender/50 text-lavender"  // Highlight best clip
          : "border-corpo-border text-corpo-text/60"
      )}
      style={{ fontSize: 'var(--text-size-base)' }}
    >
      <span className="relative" style={{ top: '-1px' }}>{index}</span>
    </button>
  )
}

interface VideoModalProps {
  url: string
  title: string
  subtitle: string
  eventId: string
  onClose: () => void
}

type PlaybackStatus =
  | 'initializing'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'autoplay-blocked'
  | 'false-playing'
  | 'media-error'

const MemoizedVideoModal = memo(function VideoModal({ url, title, subtitle, eventId, onClose }: VideoModalProps) {
  const [copied, setCopied] = useState(false)
  const [isMuted, setIsMuted] = useState(true) // Always start muted — never takes audio focus, never appears on lockscreen
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('initializing')
  const [controlsEnabled, setControlsEnabled] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mountedAtRef = useRef(performance.now())
  const lastCurrentTimeRef = useRef(0)
  const lastProgressAtRef = useRef(performance.now())
  const automaticRecoveryAttemptedRef = useRef(false)
  const startupProgressObservedRef = useRef(false)
  const bufferingRef = useRef(false)
  const seekInProgressRef = useRef(false)
  const playAttemptIDRef = useRef(0)

  const invalidatePlaybackAttempts = useCallback(() => {
    playAttemptIDRef.current++
  }, [])

  // Set both the current and default mute state as soon as React binds the
  // element. WebKit makes its autoplay decision during media initialization,
  // before passive effects run, so muting only in useEffect is too late on
  // some iPhones. The JSX `muted` prop keeps later renders consistent.
  const bindVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video
    if (video) {
      video.defaultMuted = true
      video.muted = true
    }
  }, [])

  const attemptPlayback = useCallback(async (video: HTMLVideoElement, trigger: string) => {
    const attemptID = ++playAttemptIDRef.current
    setPlaybackStatus('initializing')
    try {
      await video.play()
    } catch (error) {
      // A recovery pause intentionally rejects an older pending play promise.
      // Only the newest attempt may change the visible playback state.
      if (attemptID !== playAttemptIDRef.current) return
      const reason = error instanceof DOMException
        ? `${error.name}: ${error.message}`
        : String(error)
      console.warn('[FoundFooty] video playback attempt failed', {
        trigger,
        reason,
        readyState: video.readyState,
        networkState: video.networkState,
        muted: video.muted,
      })
      setPlaybackStatus('autoplay-blocked')
    }
  }, [])

  // Start every clip muted. `autoPlay` handles the normal path; the explicit
  // play call gives us a promise so a blocked attempt becomes visible instead
  // of silently leaving a frozen player.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.defaultMuted = true
    video.muted = true
    setIsMuted(true)
    setPlaybackStatus('initializing')
    setControlsEnabled(false)
    mountedAtRef.current = performance.now()
    lastCurrentTimeRef.current = 0
    lastProgressAtRef.current = performance.now()
    automaticRecoveryAttemptedRef.current = false
    startupProgressObservedRef.current = false
    bufferingRef.current = false
    seekInProgressRef.current = false
    void attemptPlayback(video, 'mount')

    // Native controls and the custom unmute affordance share one mute state.
    // Persist volume only while audible so a native mute does not overwrite the
    // user's last useful volume.
    const handleVolumeChange = () => {
      setIsMuted(video.muted)
      if (!video.muted) {
        localStorage.setItem('footy-video-volume', video.volume.toString())
      }
    }
    
    video.addEventListener('volumechange', handleVolumeChange)
    return () => {
      invalidatePlaybackAttempts()
      video.removeEventListener('volumechange', handleVolumeChange)
      video.muted = true
      video.pause()
    }
  }, [url, attemptPlayback, invalidatePlaybackAttempts])

  // Some browsers resolve play() and report `paused=false` without advancing
  // the timeline. Detect only that narrow startup failure. Normal buffering is
  // excluded until future media is buffered and the network is no longer
  // loading. Once playback advances or native controls are visible, the
  // browser owns transport and this watchdog cannot mutate it.
  useEffect(() => {
    const watchdog = window.setInterval(() => {
      const video = videoRef.current
      if (!video || document.hidden || video.ended || controlsEnabled) return

      const now = performance.now()
      const currentTime = video.currentTime

      // A paused timeline is obeying the user. Loading, buffering, and seeking
      // are insufficient data, not playback failures. Reset the deadline so a
      // later transition into an eligible state starts a fresh observation.
      if (
        video.paused ||
        video.seeking ||
        seekInProgressRef.current ||
        bufferingRef.current ||
        video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
        video.networkState === HTMLMediaElement.NETWORK_LOADING
      ) {
        lastCurrentTimeRef.current = currentTime
        lastProgressAtRef.current = now
        return
      }

      if (currentTime > lastCurrentTimeRef.current + 0.05) {
        lastCurrentTimeRef.current = currentTime
        lastProgressAtRef.current = now
        startupProgressObservedRef.current = true
        setPlaybackStatus('playing')
        return
      }

      // A readyState can still overstate usable data. Require a contiguous
      // buffered range ahead of the playhead before calling a stationary
      // startup false-playing.
      let bufferedAhead = 0
      for (let index = 0; index < video.buffered.length; index++) {
        const start = video.buffered.start(index)
        const end = video.buffered.end(index)
        if (start <= currentTime + 0.05 && end >= currentTime) {
          bufferedAhead = end - currentTime
          break
        }
      }

      if (bufferedAhead < 0.75 || startupProgressObservedRef.current) {
        lastProgressAtRef.current = now
        return
      }

      if (now - lastProgressAtRef.current < 4000) return

      if (video.muted && !automaticRecoveryAttemptedRef.current) {
        automaticRecoveryAttemptedRef.current = true
        lastProgressAtRef.current = now
        video.pause()
        void attemptPlayback(video, 'frozen-autoplay-recovery')
        return
      }

      setPlaybackStatus(status =>
        status === 'media-error' || status === 'autoplay-blocked'
          ? status
          : 'false-playing'
      )
    }, 500)

    return () => window.clearInterval(watchdog)
  }, [url, controlsEnabled, attemptPlayback])
  
  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Build a shareable URL from the clip's stable share_id (self-upgrades to the current best
  // clip; 410 if VAR-removed, 404 if never minted). Falls back to event-only if absent.
  const getShareUrl = () => {
    const shareId = getShareId(url)
    const baseUrl = window.location.origin
    return shareId
      ? `${baseUrl}/workspace/found-footy?v=${eventId}&s=${shareId}`
      : `${baseUrl}/workspace/found-footy?v=${eventId}`
  }

  const handleShare = async () => {
    const ok = await copyToClipboard(getShareUrl())
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } else {
      console.error('[FoundFooty] clipboard copy failed')
    }
  }

  const handleDownload = () => {
    // Filesystem-safe name from the event title (e.g. "Fiorentina-1-0-Benevento.mp4"); the
    // shim also sets Content-Disposition, which is authoritative.
    const base = (title || 'clip').replace(/<<|>>/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'clip'
    const filename = `${base}.mp4`
    const downloadUrl = `${url.replace('/video/', '/download/')}?filename=${encodeURIComponent(filename)}`
    // Programmatic same-origin anchor click: with the attachment header it downloads in place,
    // no new tab (the old window.open('_blank') behavior).
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent click from bubbling

    const video = videoRef.current
    if (!video) return

    const savedVolume = localStorage.getItem('footy-video-volume')
    const targetVolume = savedVolume !== null ? parseFloat(savedVolume) : 1

    video.muted = false
    video.volume = targetVolume
    setIsMuted(false)
    if (video.paused) void attemptPlayback(video, 'unmute')
  }

  const handlePlayRecovery = (e: React.MouseEvent) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return

    automaticRecoveryAttemptedRef.current = true
    lastCurrentTimeRef.current = video.currentTime
    lastProgressAtRef.current = performance.now()
    if (playbackStatus === 'media-error') video.load()
    // Reset only a session already proven false-playing. A rejected autoplay
    // needs a direct gesture-bound play(), not another unconditional pause.
    if (playbackStatus === 'false-playing') video.pause()
    void attemptPlayback(video, 'user-recovery')
  }

  // Keep the player visually clean until the user deliberately asks for the
  // browser controls. Prevent the first revealing click from also becoming a
  // native pause/play action. The short mount guard retains the existing iOS
  // protection against a delayed tap on the clip button bleeding into the
  // newly-mounted video element.
  const handleShowControls = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (controlsEnabled) return
    e.preventDefault()
    if (performance.now() - mountedAtRef.current < 300) return
    setControlsEnabled(true)
  }

  // Desktop users expect transport controls to surface when they move the
  // pointer over the picture. Touch movement is usually scrolling or a gesture,
  // so mobile keeps the deliberate-tap contract above. Checking the event's
  // actual pointer type also handles hybrid laptops without classifying the
  // whole device as either "desktop" or "mobile".
  const handlePointerMove = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (controlsEnabled || e.pointerType !== 'mouse') return
    setControlsEnabled(true)
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Title/subtitle and buttons row */}
        <div className="flex items-end justify-between gap-4 mb-2">
          {/* Title and subtitle - left side */}
          <div className="font-mono min-w-0">
            {/* Title: score at moment */}
            <div 
              className="text-corpo-text"
              style={{ fontSize: 'var(--text-size-base)' }}
            >
              <HighlightedText text={title} />
            </div>
            {/* Subtitle: goal details */}
            <div 
              className="text-corpo-text/50 text-sm font-light"
            >
              <HighlightedText text={subtitle} />
            </div>
          </div>

          {/* Action buttons - right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Share button */}
          <button
            onClick={handleShare}
            onTouchStart={() => {}} // Required for iOS :active to work
            className={copied ? "p-1 text-lavender" : "nav-btn p-1"}
            aria-label="Copy share link"
          >
            {copied ? (
              <RiCheckFill className="w-5 h-5" />
            ) : (
              <>
                <RiShareBoxLine className="icon-line w-5 h-5" />
                <RiShareBoxFill className="icon-fill w-5 h-5" />
              </>
            )}
          </button>
          {/* Download button */}
          <button
            onClick={handleDownload}
            onTouchStart={() => {}} // Required for iOS :active to work
            className="nav-btn p-1"
            aria-label="Download video"
          >
            <RiDownload2Line className="icon-line w-5 h-5" />
            <RiDownload2Fill className="icon-fill w-5 h-5" />
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            onTouchStart={() => {}} // Required for iOS :active to work
            className="nav-btn p-1"
            aria-label="Close video"
          >
            <RiCloseLine className="icon-line w-6 h-6" />
            <RiCloseFill className="icon-fill w-6 h-6" />
          </button>
          </div>
        </div>
        
        {/* Video player with unmute overlay - outer div has black bg to mask any flicker */}
        <div className="relative bg-black overflow-hidden">
          <video
            key={url} // Stable key prevents re-mounting on state changes
            ref={bindVideoRef}
            autoPlay
            muted={isMuted}
            src={url}
            controls={controlsEnabled}
            playsInline
            tabIndex={0}
            preload="auto"
            crossOrigin="anonymous"
            disableRemotePlayback // Hide Chromecast button
            className="w-full border border-corpo-border block"
            style={{ maxHeight: '80vh', backgroundColor: '#000' }}
            onClick={handleShowControls}
            onPointerMove={handlePointerMove}
            onFocus={() => setControlsEnabled(true)}
            onPlaying={() => {
              bufferingRef.current = false
              lastCurrentTimeRef.current = videoRef.current?.currentTime ?? 0
              lastProgressAtRef.current = performance.now()
              setPlaybackStatus('playing')
            }}
            onTimeUpdate={e => {
              bufferingRef.current = false
              if (e.currentTarget.currentTime > lastCurrentTimeRef.current + 0.05) {
                startupProgressObservedRef.current = true
              }
              lastCurrentTimeRef.current = e.currentTarget.currentTime
              lastProgressAtRef.current = performance.now()
              setPlaybackStatus('playing')
            }}
            onPause={() => setPlaybackStatus(status =>
              status === 'autoplay-blocked' || status === 'false-playing' || status === 'media-error'
                ? status
                : 'paused'
            )}
            onWaiting={e => {
              bufferingRef.current = true
              lastCurrentTimeRef.current = e.currentTarget.currentTime
              lastProgressAtRef.current = performance.now()
              setPlaybackStatus(status =>
                status === 'autoplay-blocked' || status === 'false-playing' || status === 'media-error'
                  ? status
                  : 'buffering'
              )
            }}
            onCanPlay={e => {
              bufferingRef.current = false
              lastCurrentTimeRef.current = e.currentTarget.currentTime
              lastProgressAtRef.current = performance.now()
            }}
            onSeeking={e => {
              seekInProgressRef.current = true
              lastCurrentTimeRef.current = e.currentTarget.currentTime
              lastProgressAtRef.current = performance.now()
            }}
            onSeeked={e => {
              seekInProgressRef.current = false
              lastCurrentTimeRef.current = e.currentTarget.currentTime
              lastProgressAtRef.current = performance.now()
            }}
            onError={e => {
              const mediaError = e.currentTarget.error
              console.error('[FoundFooty] video media error', {
                code: mediaError?.code,
                message: mediaError?.message,
                networkState: e.currentTarget.networkState,
              })
              setPlaybackStatus('media-error')
            }}
          />
          {(playbackStatus === 'autoplay-blocked' || playbackStatus === 'false-playing' || playbackStatus === 'media-error') && (
            <button
              onClick={handlePlayRecovery}
              onTouchStart={() => {}}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 text-corpo-text"
              aria-label={playbackStatus === 'media-error' ? 'Retry video' : 'Play video'}
            >
              <span className="flex items-center gap-2 border border-corpo-border bg-black/80 px-3 py-2 font-mono text-sm text-corpo-text hover:border-lavender hover:text-lavender active:border-lavender active:text-lavender">
                <RiPlayFill className="w-5 h-5" />
                {playbackStatus === 'media-error' ? 'retry video' : 'play video'}
              </span>
            </button>
          )}
          {/* Unmute button overlay - square to bottom-left corner */}
          {isMuted === true && (
            <button
              onClick={handleUnmute}
              onTouchStart={() => {}} // Required for iOS :active to work
              className="absolute bottom-2 left-2 z-20 p-1.5 rounded bg-black/70 text-corpo-text/70 hover:text-corpo-text active:text-lavender transition-colors"
              aria-label="Unmute video"
            >
              <RiVolumeMuteLine className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
// Custom comparison - only re-render if url/title/subtitle/eventId change (ignore onClose function reference)
}, (prevProps, nextProps) => {
  return prevProps.url === nextProps.url &&
         prevProps.title === nextProps.title &&
         prevProps.subtitle === nextProps.subtitle &&
         prevProps.eventId === nextProps.eventId
})
