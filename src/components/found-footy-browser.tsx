import { useState, useCallback, useEffect, useRef } from 'react'
import { RiCloseLine, RiCloseFill, RiShareBoxLine, RiShareBoxFill, RiDownload2Line, RiDownload2Fill, RiCheckLine, RiVidiconFill, RiScan2Line, RiHourglass2Line, RiHourglass2Fill, RiExpandUpDownLine, RiExpandUpDownFill, RiContractUpDownLine, RiContractUpDownFill, RiVolumeMuteLine, RiVolumeUpFill } from '@remixicon/react'
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

// Animated icons for scanning states
function ValidatingIcon({ className }: { className?: string }) {
  return (
    <RiScan2Line className={cn("animate-pulse", className)} />
  )
}

function ExtractingIcon({ className }: { className?: string }) {
  return (
    <RiVidiconFill className={cn("animate-pulse", className)} />
  )
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
  lastUpdate: Date | null
  initialVideo?: InitialVideoParams | null  // From URL params
}

export function FoundFootyBrowser({ 
  stagingFixtures,
  fixtures, 
  completedFixtures, 
  isConnected: _isConnected,
  initialVideo
}: FoundFootyBrowserProps) {
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [videoModal, setVideoModal] = useState<VideoInfo | null>(null)
  const initialVideoProcessed = useRef(false)
  const { mode, formatTime, getTimezoneAbbr } = useTimezone()

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

  // Handle opening video from URL params (shared link) - only run once
  useEffect(() => {
    if (!initialVideo || allFixtures.length === 0 || initialVideoProcessed.current) return
    
    // Find the fixture and event
    for (const fixture of allFixtures) {
      const event = fixture.events?.find(e => e._event_id === initialVideo.eventId)
      if (event) {
        // Mark as processed so we don't re-run on fixture updates
        initialVideoProcessed.current = true
        
        // Expand the fixture and event
        setExpandedFixture(fixture._id)
        setExpandedEvent(event._event_id)
        
        // If hash provided, try to find and open that specific video
        if (initialVideo.hash) {
          const videos = event._s3_videos || []
          // Find video by content hash in URL
          const video = videos.find(v => getVideoHash(v.url) === initialVideo.hash)
          
          if (video) {
            setVideoModal({
              url: video.url,
              title: generateEventTitle(fixture, event),
              subtitle: generateEventSubtitle(event),
              eventId: event._event_id
            })
          }
          // If hash not found, video was removed - just show expanded event (no modal)
        }
        break
      }
    }
  }, [initialVideo, allFixtures])

  // Update URL when video modal changes - only after user interaction
  const hasOpenedVideoRef = useRef(false)
  useEffect(() => {
    if (videoModal) {
      hasOpenedVideoRef.current = true
      // Use content hash from video URL for sharing
      const hash = getVideoHash(videoModal.url)
      const shareUrl = hash 
        ? `/projects/found-footy?v=${videoModal.eventId}&h=${hash}`
        : `/projects/found-footy?v=${videoModal.eventId}`
      window.history.replaceState(null, '', shareUrl)
    } else if (hasOpenedVideoRef.current) {
      // Only reset URL if user previously opened a video
      window.history.replaceState(null, '', '/projects/found-footy')
    }
  }, [videoModal])

  // Format kickoff time like "19:30 EST" - respects timezone toggle
  const formatKickoff = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    return `${formatTime(date)} ${getTimezoneAbbr()}`
  }, [mode, formatTime, getTimezoneAbbr])

  // Format date like "Tuesday 17 December"
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  }

  // Group ALL fixtures (staging + active + completed) by date
  const allFixturesForGrouping = [...stagingFixtures, ...sortedFixtures, ...sortedCompleted]
  const fixturesByDate = allFixturesForGrouping.reduce((acc, fixture) => {
    // Use fixture.date for grouping (the kickoff date)
    const dateStr = fixture.fixture?.date
    if (!dateStr) return acc
    
    const date = new Date(dateStr)
    const dateKey = date.toISOString().split('T')[0]
    
    if (!acc[dateKey]) {
      acc[dateKey] = { date, fixtures: [] }
    }
    acc[dateKey].fixtures.push(fixture)
    return acc
  }, {} as Record<string, { date: Date; fixtures: Fixture[] }>)

  // Sort fixtures within each date group: started fixtures (_last_activity) above upcoming
  Object.keys(fixturesByDate).forEach(dateKey => {
    fixturesByDate[dateKey].fixtures = sortFixturesCustom(fixturesByDate[dateKey].fixtures)
  })

  // Sort dates descending (most recent first)
  const sortedDates = Object.keys(fixturesByDate).sort((a, b) => b.localeCompare(a))

  // Check if we have any fixtures at all
  const hasFixtures = sortedDates.length > 0

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

      {/* Fixtures list with date separators */}
      <div className="space-y-1">
        {!hasFixtures ? (
          <div className="text-corpo-text/50 py-8 text-center">
            No fixtures available
          </div>
        ) : (
          <>
            {/* All fixtures grouped by date */}
            {sortedDates.map(dateKey => {
              const dateFixtures = fixturesByDate[dateKey].fixtures
              const fixtureCount = dateFixtures.length
              
              return (
                <DateSection
                  key={dateKey}
                  dateKey={dateKey}
                  date={fixturesByDate[dateKey].date}
                  fixtureCount={fixtureCount}
                  formatDate={formatDate}
                >
                  {dateFixtures.map(fixture => {
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
                        onOpenVideo={(info) => setVideoModal(info)}
                      />
                    )
                  })}
                </DateSection>
              )
            })}
          </>
        )}
      </div>

      {/* Video Modal */}
      {videoModal && (
        <VideoModal 
          url={videoModal.url} 
          title={videoModal.title}
          subtitle={videoModal.subtitle}
          eventId={videoModal.eventId}
          onClose={() => setVideoModal(null)} 
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
  const [isHovered, setIsHovered] = useState(false)
  const [countdown, setCountdown] = useState<string>('')
  const recentTouchRef = useRef(false)
  
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
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-none",
          isHovered ? "text-corpo-light" : "text-corpo-text"
        )}
        style={{ fontSize: 'var(--text-size-base)' }}
        onMouseEnter={() => { if (!recentTouchRef.current) setIsHovered(true) }}
        onMouseLeave={() => { if (!recentTouchRef.current) setIsHovered(false) }}
        onTouchStart={() => { recentTouchRef.current = true; setIsHovered(false) }}
        onTouchEnd={() => { setIsHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
      >
        {/* Hourglass icon for pending fixtures */}
        {isHovered ? (
          <RiHourglass2Fill className="w-4 h-4 flex-shrink-0 text-corpo-text/50" />
        ) : (
          <RiHourglass2Line className="w-4 h-4 flex-shrink-0 text-corpo-text/50" />
        )}
        
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

// Date section header (non-collapsible)
interface DateSectionProps {
  dateKey: string
  date: Date
  fixtureCount: number
  formatDate: (date: Date) => string
  children: React.ReactNode
}

function DateSection({ date, fixtureCount, formatDate, children }: DateSectionProps) {
  return (
    <div className="mt-12 first:mt-0">
      {/* Date header */}
      <div
        className="flex items-center gap-2 pt-4 pb-1 text-corpo-text/50 font-light"
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        <span>{formatDate(date)}</span>
        <span className="text-corpo-text/30">({fixtureCount})</span>
      </div>
      
      {/* Fixtures */}
      <div className="space-y-1">
        {children}
      </div>
    </div>
  )
}

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
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const recentTouchRef = useRef(false)
  
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
  const hasActiveScanning = sortedEvents.some(e => !e._twitter_complete)
  const hasValidating = sortedEvents.some(e => !e._monitor_complete)
  const hasExtracting = sortedEvents.some(e => e._monitor_complete && !e._twitter_complete)

  return (
    <div className="border border-corpo-border">
      {/* Fixture header */}
      <button
        onClick={onToggle}
        onMouseEnter={() => { if (!recentTouchRef.current) setIsHovered(true) }}
        onMouseLeave={() => { if (!recentTouchRef.current) { setIsHovered(false); setIsActive(false) } }}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        onTouchStart={() => { recentTouchRef.current = true; setIsActive(true); setIsHovered(false) }}
        onTouchEnd={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
        onTouchCancel={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-none",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text"
        )}
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        {isExpanded ? (
          isActive || isHovered ? (
            <RiContractUpDownFill 
              className={cn(
                "w-4 h-4 transition-none flex-shrink-0",
                isActive ? "text-lavender" : "text-corpo-light"
              )} 
            />
          ) : (
            <RiContractUpDownLine 
              className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50" 
            />
          )
        ) : (
          isActive || isHovered ? (
            <RiExpandUpDownFill 
              className={cn(
                "w-4 h-4 transition-none flex-shrink-0",
                isActive ? "text-lavender" : "text-corpo-light"
              )} 
            />
          ) : (
            <RiExpandUpDownLine 
              className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50" 
            />
          )
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
        
        {/* Scanning indicator */}
        {hasActiveScanning && (
          <span className="text-lavender/70 flex-shrink-0">
            {hasValidating ? (
              <ValidatingIcon className="w-4 h-4" />
            ) : hasExtracting ? (
              <ExtractingIcon className="w-4 h-4" />
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
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const recentTouchRef = useRef(false)
  
  // Get videos - prefer ranked _s3_videos, fall back to legacy _s3_urls
  const rankedVideos: (RankedVideo | { url: string; rank: number; perceptual_hash?: string })[] = event._s3_videos 
    ? [...event._s3_videos].sort((a, b) => a.rank - b.rank)  // Sort by rank (1 = best)
    : event._s3_urls?.map((url, idx) => ({ url, rank: idx + 1, perceptual_hash: undefined })) || []
  
  const videoCount = rankedVideos.length
  
  // Scanning states:
  // - _monitor_complete = false: Debounce/validating (event just detected, waiting for stability)
  // - _monitor_complete = true && _twitter_complete = false: Extracting clips from Twitter
  // - Both true: All scanning complete
  const isValidating = !event._monitor_complete
  const isExtracting = event._monitor_complete === true && !event._twitter_complete
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
        onMouseEnter={() => { if (!recentTouchRef.current) setIsHovered(true) }}
        onMouseLeave={() => { if (!recentTouchRef.current) { setIsHovered(false); setIsActive(false) } }}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        onTouchStart={() => { recentTouchRef.current = true; setIsActive(true); setIsHovered(false) }}
        onTouchEnd={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
        onTouchCancel={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-none",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text"
        )}
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        {isExpanded ? (
          isActive || isHovered ? (
            <RiContractUpDownFill 
              className={cn(
                "w-4 h-4 transition-none flex-shrink-0",
                isActive ? "text-lavender" : "text-corpo-light"
              )} 
            />
          ) : (
            <RiContractUpDownLine 
              className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50" 
            />
          )
        ) : (
          isActive || isHovered ? (
            <RiExpandUpDownFill 
              className={cn(
                "w-4 h-4 transition-none flex-shrink-0",
                isActive ? "text-lavender" : "text-corpo-light"
              )} 
            />
          ) : (
            <RiExpandUpDownLine 
              className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50" 
            />
          )
        )}
        
        {/* Two-line content: title on top, subtitle below */}
        <div className="flex-1 min-w-0">
          {/* Title line: score at moment of goal - with <<highlighted>> scoring team and icon */}
          <div className="flex items-center gap-2">
            <span className="truncate">
              <HighlightedText text={generateEventTitle(fixture, event)} />
            </span>
            {/* Scanning indicator - right of title */}
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
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const recentTouchRef = useRef(false)
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => { if (!recentTouchRef.current) setIsHovered(true) }}
      onMouseLeave={() => { if (!recentTouchRef.current) { setIsHovered(false); setIsActive(false) } }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      onTouchStart={() => { recentTouchRef.current = true; setIsActive(true); setIsHovered(false) }}
      onTouchEnd={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
      onTouchCancel={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
      className={cn(
        "w-7 h-7 border flex items-center justify-center transition-none font-mono leading-none",
        isActive 
          ? "border-lavender text-lavender bg-lavender/10" 
          : isHovered 
            ? "border-corpo-light text-corpo-light" 
            : isBest
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

function VideoModal({ url, title, subtitle, eventId, onClose }: VideoModalProps) {
  const [copied, setCopied] = useState(false)
  const [shareHovered, setShareHovered] = useState(false)
  const [shareActive, setShareActive] = useState(false)
  const [downloadHovered, setDownloadHovered] = useState(false)
  const [downloadActive, setDownloadActive] = useState(false)
  const [closeHovered, setCloseHovered] = useState(false)
  const [closeActive, setCloseActive] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [isMuted, setIsMuted] = useState<boolean | null>(null) // null = not yet determined
  const [volumeHovered, setVolumeHovered] = useState(false)
  const [volumeActive, setVolumeActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isTouchRef = useRef(false)
  
  // Show controls with auto-hide after 3 seconds
  const revealControls = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)
  }
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [])
  
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
      ? `${baseUrl}/projects/found-footy?v=${eventId}&h=${hash}`
      : `${baseUrl}/projects/found-footy?v=${eventId}`
  }

  const handleShare = async () => {
    const shareUrl = getShareUrl()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setShareActive(false)
      setShareHovered(false)
      setTimeout(() => setCopied(false), 5000)
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

  const handleUnmute = () => {
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
            onMouseEnter={() => { if (!isTouchRef.current) setShareHovered(true) }}
            onMouseLeave={() => { if (!isTouchRef.current) { setShareHovered(false); setShareActive(false) } }}
            onMouseDown={() => { if (!isTouchRef.current) setShareActive(true) }}
            onMouseUp={() => { if (!isTouchRef.current) setShareActive(false) }}
            onTouchStart={() => { 
              isTouchRef.current = true
              setShareActive(true)
              setShareHovered(false)
            }}
            onTouchEnd={() => { 
              setShareActive(false)
              setShareHovered(false)
              setTimeout(() => { isTouchRef.current = false }, 300)
            }}
            onTouchCancel={() => { 
              setShareActive(false)
              setShareHovered(false)
              setTimeout(() => { isTouchRef.current = false }, 300)
            }}
            className={cn(
              "p-1 transition-none",
              copied ? "text-lavender" : shareActive ? "text-lavender" : shareHovered ? "text-corpo-light" : "text-corpo-text"
            )}
          >
            {copied ? (
              <RiCheckLine className="w-5 h-5" />
            ) : shareActive || shareHovered ? (
              <RiShareBoxFill className="w-5 h-5" />
            ) : (
              <RiShareBoxLine className="w-5 h-5" />
            )}
          </button>
          {/* Download button */}
          <button
            onClick={handleDownload}
            onMouseEnter={() => { if (!isTouchRef.current) setDownloadHovered(true) }}
            onMouseLeave={() => { if (!isTouchRef.current) { setDownloadHovered(false); setDownloadActive(false) } }}
            onMouseDown={() => setDownloadActive(true)}
            onMouseUp={() => { if (!isTouchRef.current) setDownloadActive(false) }}
            onTouchStart={() => { 
              isTouchRef.current = true
              setDownloadActive(true)
              setDownloadHovered(false)
            }}
            onTouchEnd={() => { 
              setDownloadActive(false)
              setDownloadHovered(false)
              setTimeout(() => { isTouchRef.current = false }, 300)
            }}
            onTouchCancel={() => { 
              setDownloadActive(false)
              setDownloadHovered(false)
              setTimeout(() => { isTouchRef.current = false }, 300)
            }}
            className={cn(
              "p-1 transition-none",
              downloadActive ? "text-lavender" : downloadHovered ? "text-corpo-light" : "text-corpo-text"
            )}
          >
            {downloadActive || downloadHovered ? (
              <RiDownload2Fill className="w-5 h-5" />
            ) : (
              <RiDownload2Line className="w-5 h-5" />
            )}
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            onMouseEnter={() => { if (!isTouchRef.current) setCloseHovered(true) }}
            onMouseLeave={() => { if (!isTouchRef.current) { setCloseHovered(false); setCloseActive(false) } }}
            onMouseDown={() => { if (!isTouchRef.current) setCloseActive(true) }}
            onMouseUp={() => { if (!isTouchRef.current) setCloseActive(false) }}
            onTouchStart={() => { 
              isTouchRef.current = true
              setCloseActive(true)
              setCloseHovered(false)
            }}
            onTouchEnd={() => { 
              setCloseActive(false)
              setCloseHovered(false)
              setTimeout(() => { isTouchRef.current = false }, 300)
            }}
            onTouchCancel={() => { 
              setCloseActive(false)
              setCloseHovered(false)
              setTimeout(() => { isTouchRef.current = false }, 300)
            }}
            className={cn(
              "p-1 transition-none",
              closeActive ? "text-lavender" : closeHovered ? "text-corpo-light" : "text-corpo-text"
            )}
          >
            {closeActive || closeHovered ? (
              <RiCloseFill className="w-6 h-6" />
            ) : (
              <RiCloseLine className="w-6 h-6" />
            )}
          </button>
          </div>
        </div>
        
        {/* Video player with unmute overlay */}
        <div className="relative">
          <video
            ref={videoRef}
            src={url}
            controls={showControls}
            playsInline
            className="w-full bg-black border border-corpo-border"
            style={{ maxHeight: '80vh' }}
            onMouseEnter={revealControls}
            onMouseMove={revealControls}
            onTouchEnd={revealControls}
          />
          {/* Unmute button - shows when video is muted (not during initial load) */}
          {isMuted === true && (
            <button
              onClick={handleUnmute}
              onMouseEnter={() => { if (!isTouchRef.current) setVolumeHovered(true) }}
              onMouseLeave={() => { if (!isTouchRef.current) { setVolumeHovered(false); setVolumeActive(false) } }}
              onMouseDown={() => { if (!isTouchRef.current) setVolumeActive(true) }}
              onMouseUp={() => { if (!isTouchRef.current) setVolumeActive(false) }}
              onTouchStart={() => { 
                isTouchRef.current = true
                setVolumeActive(true)
                setVolumeHovered(false)
              }}
              onTouchEnd={() => { 
                setVolumeActive(false)
                setVolumeHovered(false)
                setTimeout(() => { isTouchRef.current = false }, 300)
              }}
              onTouchCancel={() => { 
                setVolumeActive(false)
                setVolumeHovered(false)
                setTimeout(() => { isTouchRef.current = false }, 300)
              }}
              className={cn(
                "absolute bottom-4 left-4 p-3 rounded-full bg-black/70 transition-none",
                volumeActive ? "text-lavender" : volumeHovered ? "text-corpo-light" : "text-corpo-text"
              )}
            >
              {volumeActive || volumeHovered ? (
                <RiVolumeUpFill className="w-6 h-6" />
              ) : (
                <RiVolumeMuteLine className="w-6 h-6" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}