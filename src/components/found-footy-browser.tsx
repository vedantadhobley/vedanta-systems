import { useState, useCallback, useEffect } from 'react'
import { RiArrowRightSLine, RiFootballLine, RiCloseLine, RiLoader4Line } from '@remixicon/react'
import type { Fixture, GoalEvent } from '@/types/found-footy'
import { cn } from '@/lib/utils'

interface FoundFootyBrowserProps {
  fixtures: Fixture[]
  completedFixtures: Fixture[]
  isConnected: boolean
  lastUpdate: Date | null
}

export function FoundFootyBrowser({ 
  fixtures, 
  completedFixtures, 
  isConnected
}: FoundFootyBrowserProps) {
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [videoModal, setVideoModal] = useState<{ url: string; title: string; subtitle: string } | null>(null)

  // Toggle fixture - close others
  const toggleFixture = useCallback((fixtureId: number) => {
    setExpandedFixture(prev => prev === fixtureId ? null : fixtureId)
    setExpandedEvent(null) // Close any open event
  }, [])

  // Toggle event - close others
  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvent(prev => prev === eventId ? null : eventId)
  }, [])

  // Sort fixtures by _last_activity descending (most recent first)
  const sortByActivity = (a: Fixture, b: Fixture) => {
    const aTime = a._last_activity ? new Date(a._last_activity).getTime() : 0
    const bTime = b._last_activity ? new Date(b._last_activity).getTime() : 0
    return bTime - aTime
  }

  const sortedFixtures = [...fixtures].sort(sortByActivity)
  const sortedCompleted = [...completedFixtures].sort(sortByActivity)
  const allFixtures = [...sortedFixtures, ...sortedCompleted]

  return (
    <div className="font-mono" style={{ fontSize: 'var(--text-size-base)' }}>
      {/* Connection status */}
      <div className="flex items-center gap-2 mb-4" style={{ fontSize: 'var(--text-size-base)' }}>
        <span className={cn(
          "w-2 h-2",
          isConnected ? "bg-lavender animate-pulse" : "bg-corpo-text/30"
        )} />
        <span className={isConnected ? "text-lavender" : "text-corpo-text/50"}>
          {isConnected ? 'connected' : 'disconnected'}
        </span>
      </div>

      {/* Fixtures list */}
      <div className="space-y-1">
        {allFixtures.length === 0 ? (
          <div className="text-corpo-text/50 py-8 text-center">
            No fixtures available
          </div>
        ) : (
          allFixtures.map(fixture => (
            <FixtureItem
              key={fixture._id}
              fixture={fixture}
              isExpanded={expandedFixture === fixture._id}
              expandedEvent={expandedEvent}
              onToggle={() => toggleFixture(fixture._id)}
              onToggleEvent={toggleEvent}
              onOpenVideo={(url, title, subtitle) => setVideoModal({ url, title, subtitle })}
            />
          ))
        )}
      </div>

      {/* Video Modal */}
      {videoModal && (
        <VideoModal 
          url={videoModal.url} 
          title={videoModal.title}
          subtitle={videoModal.subtitle}
          onClose={() => setVideoModal(null)} 
        />
      )}
    </div>
  )
}

interface FixtureItemProps {
  fixture: Fixture
  isExpanded: boolean
  expandedEvent: string | null
  onToggle: () => void
  onToggleEvent: (eventId: string) => void
  onOpenVideo: (url: string, title: string, subtitle: string) => void
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
  
  const { teams, goals, fixture: fixtureInfo, events } = fixture
  const isLive = ['1H', '2H', 'HT', 'ET', 'P'].includes(fixtureInfo.status.short)
  
  // Sort events by _first_seen descending (most recent first)
  const sortedEvents = [...(events || [])].sort((a, b) => {
    const aTime = a._first_seen ? new Date(a._first_seen).getTime() : 0
    const bTime = b._first_seen ? new Date(b._first_seen).getTime() : 0
    return bTime - aTime
  })

  const fixtureDate = new Date(fixtureInfo.date)
  const dateStr = fixtureDate.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short'
  })

  return (
    <div className="border border-corpo-border">
      {/* Fixture header */}
      <button
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsActive(false) }}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        onTouchStart={() => setIsActive(true)}
        onTouchEnd={() => setIsActive(false)}
        onTouchCancel={() => setIsActive(false)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left transition-none",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text"
        )}
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        <RiArrowRightSLine 
          className={cn(
            "w-4 h-4 transition-none flex-shrink-0",
            isExpanded && "rotate-90",
            isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text/50"
          )} 
        />
        
        <RiFootballLine className={cn(
          "w-4 h-4 flex-shrink-0",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text/50"
        )} />
        
        <span className="flex-1 truncate">
          {teams.home.name}
          <span className="text-corpo-text/50 mx-2">
            {goals?.home ?? 0} - {goals?.away ?? 0}
          </span>
          {teams.away.name}
        </span>
        
        <span className={cn(
          "text-corpo-text/60 flex-shrink-0",
          isLive && "text-lavender"
        )}>
          {isLive ? `${fixtureInfo.status.elapsed}'` : fixtureInfo.status.short}
        </span>
        
        <span className="text-corpo-text/40 flex-shrink-0">
          {dateStr}
        </span>
      </button>

      {/* Events (goals) - collapsed content with vertical line */}
      {isExpanded && (
        <div className="ml-4 border-l border-corpo-border">
          {sortedEvents.length === 0 ? (
            <div className="pl-4 pr-3 py-3 text-corpo-text/40" style={{ fontSize: 'var(--text-size-base)' }}>
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

interface EventItemProps {
  event: GoalEvent
  fixture: Fixture
  isExpanded: boolean
  onToggle: () => void
  onOpenVideo: (url: string, title: string, subtitle: string) => void
}

function EventItem({ event, fixture, isExpanded, onToggle, onOpenVideo }: EventItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  
  // Get videos - prefer ranked _s3_videos, fall back to legacy _s3_urls
  const rankedVideos = event._s3_videos 
    ? [...event._s3_videos].sort((a, b) => a.rank - b.rank)  // Sort by rank (1 = best)
    : event._s3_urls?.map((url, idx) => ({ url, rank: idx + 1 })) || []
  
  const videoCount = rankedVideos.length
  const timeStr = event.time.extra 
    ? `${event.time.elapsed}+${event.time.extra}'` 
    : `${event.time.elapsed}'`
  
  // Check if event is still being monitored (debounce in progress)
  const isDebouncing = !event._monitor_complete

  // Use MongoDB display fields for video modal
  const videoTitle = event._display_title || `${fixture.teams.home.name} vs ${fixture.teams.away.name}`
  const videoSubtitle = event._display_subtitle || `${timeStr} - ${event.player.name || 'Goal'}`

  return (
    <div>
      {/* Event header - two lines: title and subtitle */}
      <button
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsActive(false) }}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        onTouchStart={() => setIsActive(true)}
        onTouchEnd={() => setIsActive(false)}
        onTouchCancel={() => setIsActive(false)}
        className={cn(
          "w-full flex items-start gap-2 px-3 py-2 text-left transition-none",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text"
        )}
        style={{ fontSize: 'var(--text-size-base)' }}
      >
        <RiArrowRightSLine 
          className={cn(
            "w-4 h-4 transition-none flex-shrink-0 mt-0.5",
            isExpanded && "rotate-90",
            isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text/50"
          )} 
        />
        
        {/* Two-line content: title on top, subtitle below */}
        <div className="flex-1 min-w-0">
          {/* Title line: score at moment of goal */}
          <div className="truncate">
            {event._display_title || `${event.player.name || 'Goal'} (${event.team.name})`}
          </div>
          {/* Subtitle line: time, player, assist */}
          <div className="text-corpo-text/50 truncate text-sm">
            {event._display_subtitle || `${timeStr} - ${event.player.name || 'Unknown'}`}
          </div>
        </div>
        
        {/* Right side: indicators and count */}
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {/* Debounce indicator */}
          {isDebouncing && (
            <span className="text-lavender/70" title="Searching for videos...">
              <RiLoader4Line className="w-4 h-4 animate-spin" />
            </span>
          )}
          
          {/* Video count badge */}
          {videoCount > 0 && (
            <span className="text-corpo-text/60">
              [{videoCount}]
            </span>
          )}
        </div>
      </button>

      {/* Videos - collapsed content with horizontal clip buttons */}
      {isExpanded && (
        <div className="ml-4 border-l border-corpo-border">
          <div className="pl-4 pr-3 py-2" style={{ fontSize: 'var(--text-size-base)' }}>
            {isDebouncing && videoCount === 0 ? (
              <div className="flex items-center gap-2 text-lavender/70">
                <RiLoader4Line className="w-4 h-4 animate-spin" />
                <span>searching for videos...</span>
              </div>
            ) : videoCount === 0 ? (
              <span className="text-corpo-text/40">no videos found</span>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-corpo-text/50 mr-1">clips:</span>
                {rankedVideos.map((video) => (
                  <ClipButton 
                    key={video.url} 
                    index={video.rank}
                    isBest={video.rank === 1}
                    onClick={() => onOpenVideo(video.url, videoTitle, videoSubtitle)}
                  />
                ))}
                {isDebouncing && (
                  <span className="flex items-center gap-1 text-lavender/60 ml-2" title="More videos may appear">
                    <RiLoader4Line className="w-3 h-3 animate-spin" />
                  </span>
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
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsActive(false) }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      className={cn(
        "w-7 h-7 border flex items-center justify-center transition-none font-mono",
        isActive 
          ? "border-lavender text-lavender bg-lavender/10" 
          : isHovered 
            ? "border-corpo-light text-corpo-light" 
            : isBest
              ? "border-lavender/50 text-lavender"  // Highlight best clip
              : "border-corpo-border text-corpo-text/60"
      )}
      style={{ fontSize: 'var(--text-size-base)' }}
      title={isBest ? `Play clip ${index} (best quality)` : `Play clip ${index}`}
    >
      {index}
    </button>
  )
}

interface VideoModalProps {
  url: string
  title: string
  subtitle: string
  onClose: () => void
}

function VideoModal({ url, title, subtitle, onClose }: VideoModalProps) {
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Title bar with close button */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="font-mono min-w-0">
            {/* Title: score at moment */}
            <div 
              className="text-corpo-text truncate"
              style={{ fontSize: 'var(--text-size-base)' }}
            >
              {title}
            </div>
            {/* Subtitle: goal details */}
            <div 
              className="text-corpo-text/50 truncate text-sm"
            >
              {subtitle}
            </div>
          </div>
          {/* Close button - aligned with title */}
          <button
            onClick={onClose}
            className="text-corpo-text/60 hover:text-corpo-light transition-none flex-shrink-0"
          >
            <RiCloseLine className="w-6 h-6" />
          </button>
        </div>
        
        {/* Video player */}
        <video
          src={url}
          controls
          autoPlay
          className="w-full bg-black border border-corpo-border"
          style={{ maxHeight: '80vh' }}
        />
      </div>
    </div>
  )
}
