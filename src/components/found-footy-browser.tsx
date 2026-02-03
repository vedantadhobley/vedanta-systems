import { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react'
import { RiCloseLine, RiCloseFill, RiShareBoxLine, RiShareBoxFill, RiDownload2Line, RiDownload2Fill, RiCheckFill, RiVidiconFill, RiScan2Line, RiHourglass2Line, RiHourglass2Fill, RiExpandUpDownLine, RiExpandUpDownFill, RiContractUpDownLine, RiContractUpDownFill, RiVolumeMuteLine, RiErrorWarningLine, RiArrowLeftSLine, RiArrowLeftSFill, RiArrowRightSLine, RiArrowRightSFill, RiArrowGoBackLine, RiArrowGoBackFill, RiArrowGoForwardLine, RiArrowGoForwardFill } from '@remixicon/react'
import type { Fixture, GoalEvent, RankedVideo } from '@/types/found-footy'
import { cn } from '@/lib/utils'
import { useTimezone } from '@/contexts/timezone-context'

/**
 * Generate event display title with <<highlighted>> markers around scoring team's score
 * Format: "Home X-(Y) Away" where scoring team's score is in parentheses and highlighted
 * Uses _score_after (score at moment of goal) and _scoring_team from the event
 */
function generateEventTitle(fixture: Fixture, event: GoalEvent): string {
  const { teams } = fixture
  
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

/**
 * Generate event display subtitle with <<highlighted>> markers around scorer name
 * Format: "45' Goal - <<Scorer Name>> (Assister Name)" or "45+2' Goal - <<Scorer Name>>"
 */
function generateEventSubtitle(event: GoalEvent): string {
  const timeStr = event.time.extra 
    ? `${event.time.elapsed}+${event.time.extra}'` 
    : `${event.time.elapsed}'`
  
  const eventType = event.detail || event.type || 'Goal'
  const scorerName = event.player?.name || 'Unknown'
  const assistName = event.assist?.name
  
  if (assistName) {
    return `${timeStr} ${eventType} - <<${scorerName}>> (${assistName})`
  }
  return `${timeStr} ${eventType} - <<${scorerName}>>`
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

// Extract content hash from video URL (e.g., "0235165c" from "..._0235165c.mp4")
function getVideoHash(url: string): string {
  const match = url.match(/_([a-f0-9]{8})\.mp4$/i)
  return match?.[1] || ''
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
  hash?: string  // Content hash from URL - if provided, open specific video
}

interface FoundFootyBrowserProps {
  stagingFixtures: Fixture[]
  fixtures: Fixture[]
  completedFixtures: Fixture[]
  isConnected: boolean
  isLoading: boolean  // True until first SSE data received
  isChangingDate?: boolean  // True during date navigation (prevents scroll reset)
  lastUpdate: Date | null
  initialVideo?: InitialVideoParams | null  // From URL params
  onPauseStream?: () => void   // Called when video modal opens
  onResumeStream?: () => void  // Called when video modal closes
  // Calendar navigation
  currentDate: string          // YYYY-MM-DD format
  availableDates: string[]     // List of dates with fixtures (descending order)
  onDateChange: (date: string) => void
  onGoToToday: () => void
  onPreviousDate: () => void
  onNextDate: () => void
  onNavigateToEvent?: (eventId: string) => Promise<boolean>  // Navigate to event's date (for shared links)
}

export function FoundFootyBrowser({ 
  stagingFixtures,
  fixtures, 
  completedFixtures, 
  isConnected: _isConnected,
  isLoading,
  isChangingDate,
  initialVideo,
  onPauseStream,
  onResumeStream,
  currentDate,
  availableDates,
  onDateChange: _onDateChange,  // Kept for future date picker
  onGoToToday,
  onPreviousDate,
  onNextDate,
  onNavigateToEvent
}: FoundFootyBrowserProps) {
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [videoModal, setVideoModal] = useState<VideoInfo | null>(null)
  const initialVideoProcessed = useRef(false)
  const initialVideoNavigated = useRef(false)  // Track if we've navigated to the event's date
  
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
  
  // Navigation: all past dates + today + only the next future date with fixtures
  const availableDatesInMode = useMemo(() => {
    const sortedDates = [...availableDates].sort()
    
    // All past dates and today
    const pastAndToday = sortedDates.filter(d => d <= today)
    
    // Only the first future date after today
    const nextFuture = sortedDates.find(d => d > today)
    
    const dates = [...pastAndToday]
    if (nextFuture) {
      dates.push(nextFuture)
    }
    
    return dates.sort().reverse() // Newest first
  }, [availableDates, today])
  
  // Check if we can navigate
  const currentIndex = availableDatesInMode.indexOf(currentDate)
  const nextDateInList = availableDatesInMode.find(d => d > currentDate)
  const canGoNext = currentIndex > 0 || (currentIndex === -1 && !!nextDateInList)
  const canGoPrevious = currentIndex < availableDatesInMode.length - 1 || (currentIndex === -1 && availableDatesInMode.some(d => d < currentDate))
  
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

  // Custom sort: fixtures with _last_activity first (by activity DESC), then fixtures without (by kickoff ASC)
  const sortFixturesCustom = (fixtureList: Fixture[]) => {
    const withActivity = fixtureList.filter(f => f._last_activity)
    const withoutActivity = fixtureList.filter(f => !f._last_activity)
    
    // Sort with activity by _last_activity descending
    withActivity.sort((a, b) => {
      const aTime = new Date(a._last_activity!).getTime()
      const bTime = new Date(b._last_activity!).getTime()
      return bTime - aTime
    })
    
    // Sort without activity by fixture.date ascending
    withoutActivity.sort((a, b) => {
      const aTime = new Date(a.fixture.date).getTime()
      const bTime = new Date(b.fixture.date).getTime()
      return aTime - bTime
    })
    
    return [...withActivity, ...withoutActivity]
  }

  // Staging fixtures already sorted by kickoff time ascending from API
  const sortedFixtures = sortFixturesCustom([...fixtures])
  const sortedCompleted = sortFixturesCustom([...completedFixtures])
  
  // All fixtures for deep linking search (staging + active + completed)
  const allFixtures = [...stagingFixtures, ...sortedFixtures, ...sortedCompleted]

  // Toggle fixture - close others
  const toggleFixture = useCallback((fixtureId: number) => {
    setExpandedFixture(prev => prev === fixtureId ? null : fixtureId)
    setExpandedEvent(null) // Close any open event
  }, [])

  // Toggle event - close others
  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvent(prev => prev === eventId ? null : eventId)
  }, [])

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
        
        // Expand the fixture and event
        setExpandedFixture(fixture._id)
        setExpandedEvent(event._event_id)
        
        // If hash provided, try to find and open that specific video
        // Defer modal opening to next frame to prevent UI freeze on slower devices
        if (initialVideo.hash) {
          const videos = event._s3_videos || []
          // Find video by content hash in URL
          const video = videos.find(v => getVideoHash(v.url) === initialVideo.hash)
          
          if (video) {
            // Use double rAF to ensure DOM has updated before opening modal
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // Pause SSE before opening video modal
                onPauseStream?.()
                setVideoModal({
                  url: video.url,
                  title: generateEventTitle(fixture, event),
                  subtitle: generateEventSubtitle(event),
                  eventId: event._event_id
                })
              })
            })
          }
          // If hash not found, video was removed - just show expanded event (no modal)
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
      // Use content hash from video URL for sharing
      const hash = getVideoHash(videoModal.url)
      const shareUrl = hash 
        ? `/workspace/found-footy?v=${videoModal.eventId}&h=${hash}`
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
  }, [mode, formatTime, getTimezoneAbbr])

  // Filter fixtures to only those matching currentDate in the current timezone mode
  const filterFixturesByDate = useCallback((fixtureList: Fixture[]) => {
    return fixtureList.filter(f => getDateForTimestamp(f.fixture.date) === currentDate)
  }, [getDateForTimestamp, currentDate])
  
  // All fixtures for this date, filtered by timezone and sorted
  const filteredStaging = useMemo(() => filterFixturesByDate(stagingFixtures), [filterFixturesByDate, stagingFixtures])
  const filteredActive = useMemo(() => filterFixturesByDate(sortedFixtures), [filterFixturesByDate, sortedFixtures])
  const filteredCompleted = useMemo(() => filterFixturesByDate(sortedCompleted), [filterFixturesByDate, sortedCompleted])
  
  const currentFilteredFixtures = sortFixturesCustom([...filteredStaging, ...filteredActive, ...filteredCompleted])
  
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
    setExpandedFixture(null)
    setExpandedEvent(null)
    // Don't close video modal - let user finish watching
  }, [currentDate])
  
  // During date change, show old fixtures to prevent layout collapse
  // Once new data arrives (isChangingDate becomes false), show new fixtures
  const allDateFixtures = isChangingDate && currentFilteredFixtures.length === 0 
    ? lastFixturesRef.current 
    : currentFilteredFixtures

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

      {/* Calendar navigation - uses global .nav-btn CSS from header.tsx */}
      <div className="mb-4 flex items-center justify-between border border-corpo-border bg-corpo-bg/50 px-3 py-2">
        {/* Previous button */}
        <button
          onClick={onPreviousDate}
          onTouchStart={() => {}} // Required for iOS :active to work
          disabled={!canGoPrevious}
          className="nav-btn flex items-center p-1"
          aria-label="Previous date"
        >
          <RiArrowLeftSLine className="icon-line w-5 h-5" />
          <RiArrowLeftSFill className="icon-fill w-5 h-5" />
        </button>
        
        {/* Current date display and Today button */}
        <div className="flex items-center gap-3">
          <span className="text-corpo-text font-medium">
            {formatDateDisplay(currentDate)}
          </span>
          {isToday ? (
            <span className="p-1 text-lavender" aria-label="Currently on today">
              <RiCheckFill className="w-4 h-4" />
            </span>
          ) : currentDate < today ? (
            // Viewing past: arrow points forward to today
            <button
              onClick={onGoToToday}
              onTouchStart={() => {}} // Required for iOS :active to work
              className="nav-btn flex items-center p-1"
              aria-label="Go to today"
            >
              <RiArrowGoForwardLine className="icon-line w-4 h-4" />
              <RiArrowGoForwardFill className="icon-fill w-4 h-4" />
            </button>
          ) : (
            // Viewing future: arrow points back to today
            <button
              onClick={onGoToToday}
              onTouchStart={() => {}} // Required for iOS :active to work
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
          onTouchStart={() => {}} // Required for iOS :active to work
          disabled={!canGoNext}
          className="nav-btn flex items-center p-1"
          aria-label="Next date"
        >
          <RiArrowRightSLine className="icon-line w-5 h-5" />
          <RiArrowRightSFill className="icon-fill w-5 h-5" />
        </button>
      </div>

      {/* Fixtures list for current date */}
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
            {allDateFixtures.map(fixture => {
              // Check if fixture is still pending (not started)
              const isPending = fixture.fixture.status.short === 'NS'
              
              return isPending ? (
                <StagingFixtureItem
                  key={fixture._id}
                  fixture={fixture}
                  formatKickoff={formatKickoff}
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
                />
              )
            })}
          </>
        )}
      </div>

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
}

function StagingFixtureItem({ fixture, formatKickoff }: StagingFixtureItemProps) {
  const [countdown, setCountdown] = useState<string>('')
  
  const { teams, fixture: fixtureInfo, league } = fixture
  const kickoffTime = formatKickoff(fixtureInfo.date)
  
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
    <div className="border border-corpo-border">
      <div
        className="group w-full flex items-center gap-2 px-3 py-2 text-left transition-none text-corpo-text hover:text-corpo-light"
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        {/* Hourglass icon for pending fixtures - filled on hover via CSS */}
        <RiHourglass2Line className="w-4 h-4 flex-shrink-0 text-corpo-text/50 group-hover:hidden" />
        <RiHourglass2Fill className="w-4 h-4 flex-shrink-0 text-corpo-text/50 hidden group-hover:block" />
        
        {/* Fixture info - two lines like active fixtures */}
        <span className="flex-1 flex flex-col min-w-0">
          {/* Teams with vs in middle (matching active fixture style without score) */}
          <span className="truncate flex items-center">
            <span>{teams.home.name}</span>
            <span className="text-corpo-text/50 mx-2">vs</span>
            <span>{teams.away.name}</span>
          </span>
          {/* Competition name with country and round */}
          <span className="text-corpo-text/40 text-sm truncate font-light">
            {league ? `${league.country} - ${league.name}${league.round ? ` (${league.round})` : ''}` : 'Unknown Competition'}
          </span>
        </span>
        
        {/* Kickoff time stacked - time on top, countdown below */}
        <span className="text-corpo-text/60 flex-shrink-0 text-right font-light flex flex-col items-end">
          <span className="tabular-nums">{kickoffTime}</span>
          <span className="text-corpo-text/40 text-sm">{countdown}</span>
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
}

function FixtureItem({ 
  fixture, 
  isExpanded, 
  expandedEvent, 
  onToggle, 
  onToggleEvent,
  onOpenVideo 
}: FixtureItemProps) {
  
  const { teams, goals, score, fixture: fixtureInfo, events, league } = fixture
  const isLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(fixtureInfo.status.short)
  // Only show elapsed time for statuses where game is actively playing
  const showElapsedTime = ['1H', '2H', 'ET', 'LIVE'].includes(fixtureInfo.status.short)
  
  // Check if this is a penalty shootout (in progress 'P' or completed 'PEN')
  const showPenaltyScore = ['P', 'PEN'].includes(fixtureInfo.status.short) && score?.penalty
  
  // Determine winner for highlighting (only for completed matches)
  // Use teams.winner from API - this correctly handles penalty shootouts
  // where goals are tied but there's still a winner
  const isCompleted = ['FT', 'AET', 'PEN', 'AWD', 'WO'].includes(fixtureInfo.status.short)
  const homeWins = isCompleted && teams.home.winner === true
  const awayWins = isCompleted && teams.away.winner === true
  
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
    <div className="border border-corpo-border">
      {/* Fixture header */}
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
                ? `${goals?.home ?? 0} (${score.penalty!.home}) - (${score.penalty!.away}) ${goals?.away ?? 0}`
                : `${goals?.home ?? 0} - ${goals?.away ?? 0}`
              }
            </span>
            <span className={cn(awayWins && "text-lavender")}>{teams.away.name}</span>
          </span>
          {/* Competition name with country and round */}
          <span className="text-corpo-text/40 text-sm truncate font-light">
            {league ? `${league.country} - ${league.name}${league.round ? ` (${league.round})` : ''}` : 'Unknown Competition'}
          </span>
          
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
        
        {/* Status on far right */}
        <span className={cn(
          "text-corpo-text/60 flex-shrink-0 font-light",
          isLive && "text-lavender"
        )}>
          {showElapsedTime
            ? (fixtureInfo.status.extra 
                ? `${fixtureInfo.status.elapsed}+${fixtureInfo.status.extra}'`
                : `${fixtureInfo.status.elapsed}'`)
            : fixtureInfo.status.short}
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
}

function EventItem({ event, fixture, isExpanded, onToggle, onOpenVideo }: EventItemProps) {
  
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
    <div>
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
          {/* Title line: score at moment of goal - with <<highlighted>> scoring team and icon */}
          <div className="flex items-center gap-2">
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

const MemoizedVideoModal = memo(function VideoModal({ url, title, subtitle, eventId, onClose }: VideoModalProps) {
  const [copied, setCopied] = useState(false)
  const [isMuted, setIsMuted] = useState<boolean | null>(null) // null = not yet determined
  const [controlsEnabled, setControlsEnabled] = useState(false) // Start with controls hidden
  const videoRef = useRef<HTMLVideoElement>(null)
  const mountedAtRef = useRef(Date.now())
  const lastUnmuteRef = useRef(0) // Timestamp of last unmute click
  
  // Enable controls on first user interaction with the video
  // Ignores events in first 300ms to prevent tap "bleed-through" from the fixture card
  // Also ignores events within 300ms of unmute button click
  const enableControls = useCallback(() => {
    const now = Date.now()
    if (!controlsEnabled && 
        now - mountedAtRef.current > 300 && 
        now - lastUnmuteRef.current > 300) {
      setControlsEnabled(true)
    }
  }, [controlsEnabled])
  
  // Cleanup video resources on unmount AND when URL changes
  useEffect(() => {
    const video = videoRef.current
    
    return () => {
      // CRITICAL: Aggressively release video resources
      // iOS Safari is notorious for holding onto video memory
      if (video) {
        // Stop playback
        video.pause()
        // Clear all sources
        video.removeAttribute('src')
        while (video.firstChild) {
          video.removeChild(video.firstChild)
        }
        // Force browser to release media resources
        video.load()
      }
    }
  }, [url]) // Re-run cleanup when URL changes
  
  // Handle autoplay - try unmuted first, fall back to muted if browser blocks
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    const savedVolume = localStorage.getItem('footy-video-volume')
    const targetVolume = savedVolume !== null ? parseFloat(savedVolume) : 1
    
    // Try to play unmuted first (works if user has interacted with page)
    video.muted = false
    video.volume = targetVolume
    setIsMuted(false)
    
    const playPromise = video.play()
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay was blocked - play muted instead
        video.muted = true
        setIsMuted(true)
        video.play().catch(() => {})
      })
    }
    
    // Save volume when changed
    const handleVolumeChange = () => {
      if (!video.muted) {
        localStorage.setItem('footy-video-volume', video.volume.toString())
      }
    }
    
    video.addEventListener('volumechange', handleVolumeChange)
    return () => video.removeEventListener('volumechange', handleVolumeChange)
  }, [])
  
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

  // Build shareable URL using content hash from video URL
  const getShareUrl = () => {
    const hash = getVideoHash(url)
    const baseUrl = window.location.origin
    return hash 
      ? `${baseUrl}/workspace/found-footy?v=${eventId}&h=${hash}`
      : `${baseUrl}/workspace/found-footy?v=${eventId}`
  }

  const handleShare = async () => {
    const shareUrl = getShareUrl()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDownload = () => {
    // Use download endpoint which sets Content-Disposition: attachment
    // This works on iOS and forces download instead of playing
    const downloadUrl = url.replace('/video/', '/download/')
    window.open(downloadUrl, '_blank')
  }

  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent click from bubbling
    lastUnmuteRef.current = Date.now() // Prevent enableControls for 300ms
    
    const video = videoRef.current
    if (!video) return
    
    const savedVolume = localStorage.getItem('footy-video-volume')
    const targetVolume = savedVolume !== null ? parseFloat(savedVolume) : 1
    
    video.muted = false
    video.volume = targetVolume
    setIsMuted(false)
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
            ref={videoRef}
            src={url}
            controls={controlsEnabled}
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            disableRemotePlayback // Hide Chromecast button
            className="w-full border border-corpo-border block"
            style={{ maxHeight: '80vh', backgroundColor: '#000' }}
            onMouseEnter={enableControls}
            onClick={enableControls}
          />
          {/* Unmute button overlay - square to bottom-left corner */}
          {isMuted === true && (
            <button
              onClick={handleUnmute}
              onTouchStart={() => {}} // Required for iOS :active to work
              className="absolute bottom-2 left-2 p-1.5 rounded bg-black/70 text-corpo-text/70 hover:text-corpo-text active:text-lavender transition-colors"
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