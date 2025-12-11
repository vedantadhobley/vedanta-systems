import { useState, useCallback } from 'react'
import { RiArrowRightSLine, RiFootballLine, RiVideoLine, RiTimeLine, RiUser3Line } from '@remixicon/react'
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

  // Toggle fixture - close others
  const toggleFixture = useCallback((fixtureId: number) => {
    setExpandedFixture(prev => prev === fixtureId ? null : fixtureId)
    setExpandedEvent(null) // Close any open event
  }, [])

  // Toggle event - close others
  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvent(prev => prev === eventId ? null : eventId)
  }, [])

  const allFixtures = [...fixtures, ...completedFixtures]

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
            />
          ))
        )}
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
}

function FixtureItem({ 
  fixture, 
  isExpanded, 
  expandedEvent, 
  onToggle, 
  onToggleEvent 
}: FixtureItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  
  const { teams, goals, fixture: fixtureInfo, events } = fixture
  const isLive = ['1H', '2H', 'HT', 'ET', 'P'].includes(fixtureInfo.status.short)
  
  // Sort events by time descending (latest first)
  const sortedEvents = [...(events || [])].sort((a, b) => {
    const timeA = a.time.elapsed + (a.time.extra || 0)
    const timeB = b.time.elapsed + (b.time.extra || 0)
    return timeB - timeA
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
                  isExpanded={expandedEvent === event._event_id}
                  onToggle={() => onToggleEvent(event._event_id)}
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
  isExpanded: boolean
  onToggle: () => void
}

function EventItem({ event, isExpanded, onToggle }: EventItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  
  const videoCount = event._s3_urls?.length || 0
  const timeStr = event.time.extra 
    ? `${event.time.elapsed}+${event.time.extra}'` 
    : `${event.time.elapsed}'`

  return (
    <div>
      {/* Event header */}
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
        
        <RiTimeLine className={cn(
          "w-4 h-4 flex-shrink-0",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text/50"
        )} />
        
        <span className="w-12 flex-shrink-0">{timeStr}</span>
        
        <RiUser3Line className={cn(
          "w-4 h-4 flex-shrink-0",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text/50"
        )} />
        
        <span className="flex-1 truncate">
          {event.player.name || 'Unknown'}
          <span className="text-corpo-text/40 ml-2">
            ({event.team.name})
          </span>
        </span>
        
        {videoCount > 0 && (
          <span className="flex items-center gap-1 text-corpo-text/60 flex-shrink-0">
            <RiVideoLine className="w-4 h-4" />
            {videoCount}
          </span>
        )}
      </button>

      {/* Videos - collapsed content */}
      {isExpanded && (
        <div className="ml-4 border-l border-corpo-border">
          {videoCount === 0 ? (
            <div className="pl-4 pr-3 py-2 text-corpo-text/40" style={{ fontSize: 'var(--text-size-base)' }}>
              No videos available
            </div>
          ) : (
            <div>
              {event._s3_urls.map((url, idx) => (
                <VideoItem 
                  key={url} 
                  url={url} 
                  index={idx + 1}
                  tweetUrl={event._discovered_videos?.[idx]?.tweet_url}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface VideoItemProps {
  url: string
  index: number
  tweetUrl?: string
}

function VideoItem({ url, index, tweetUrl }: VideoItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  
  return (
    <div 
      className="flex items-center gap-2 px-3 py-1.5 transition-none"
      style={{ fontSize: 'var(--text-size-base)' }}
    >
      <RiVideoLine className="w-4 h-4 text-corpo-text/50 flex-shrink-0" />
      
      <span className="text-corpo-text/60">clip_{index}.mp4</span>
      
      <a 
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsActive(false) }}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        className={cn(
          "ml-auto transition-none",
          isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text/60"
        )}
      >
        [watch]
      </a>
      
      {tweetUrl && (
        <SourceLink url={tweetUrl} />
      )}
    </div>
  )
}

function SourceLink({ url }: { url: string }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  
  return (
    <a 
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsActive(false) }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      className={cn(
        "transition-none",
        isActive ? "text-lavender" : isHovered ? "text-corpo-light" : "text-corpo-text/40"
      )}
    >
      [source]
    </a>
  )
}
