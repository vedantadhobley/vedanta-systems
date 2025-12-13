import { useState, useCallback, useEffect, useRef } from 'react'
import { RiArrowRightSLine, RiCloseLine, RiCloseFill, RiShareBoxLine, RiShareBoxFill, RiDownload2Line, RiDownload2Fill, RiCheckLine, RiVidiconFill, RiScan2Line } from '@remixicon/react'
import type { Fixture, GoalEvent, RankedVideo } from '@/types/found-footy'
import { cn } from '@/lib/utils'

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
  fixtures: Fixture[]
  completedFixtures: Fixture[]
  isConnected: boolean
  lastUpdate: Date | null
  initialVideo?: InitialVideoParams | null  // From URL params
}

export function FoundFootyBrowser({ 
  fixtures, 
  completedFixtures, 
  isConnected: _isConnected,
  initialVideo
}: FoundFootyBrowserProps) {
  const [expandedFixture, setExpandedFixture] = useState<number | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [videoModal, setVideoModal] = useState<VideoInfo | null>(null)
  const initialVideoProcessed = useRef(false)

  // Sort fixtures by _last_activity descending (most recent first)
  const sortByActivity = (a: Fixture, b: Fixture) => {
    const aTime = a._last_activity ? new Date(a._last_activity).getTime() : 0
    const bTime = b._last_activity ? new Date(b._last_activity).getTime() : 0
    return bTime - aTime
  }

  const sortedFixtures = [...fixtures].sort(sortByActivity)
  const sortedCompleted = [...completedFixtures].sort(sortByActivity)
  const allFixtures = [...sortedFixtures, ...sortedCompleted]

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
            const title = event._display_title || `${fixture.teams.home.name} vs ${fixture.teams.away.name}`
            const timeStr = event.time.extra 
              ? `${event.time.elapsed}+${event.time.extra}'` 
              : `${event.time.elapsed}'`
            const subtitle = event._display_subtitle || `${timeStr} - ${event.player.name || 'Goal'}`
            
            setVideoModal({
              url: video.url,
              title,
              subtitle,
              eventId: event._event_id
            })
          }
          // If hash not found, video was removed - just show expanded event (no modal)
        }
        break
      }
    }
  }, [initialVideo, allFixtures])

  // Update URL when video modal changes
  useEffect(() => {
    if (videoModal) {
      // Use content hash from video URL for sharing
      const hash = getVideoHash(videoModal.url)
      const shareUrl = hash 
        ? `/projects/found-footy?v=${videoModal.eventId}&h=${hash}`
        : `/projects/found-footy?v=${videoModal.eventId}`
      window.history.replaceState(null, '', shareUrl)
    } else {
      // Reset to base URL when modal closes
      window.history.replaceState(null, '', '/projects/found-footy')
    }
  }, [videoModal])

  // Group fixtures by date for date separators
  const fixturesByDate = allFixtures.reduce((acc, fixture) => {
    // Get fixture date (from fixture.fixture.date or _last_activity)
    const dateStr = fixture.fixture?.date || fixture._last_activity
    if (!dateStr) return acc
    
    const date = new Date(dateStr)
    // Format as YYYY-MM-DD for grouping
    const dateKey = date.toISOString().split('T')[0]
    
    if (!acc[dateKey]) {
      acc[dateKey] = {
        date,
        fixtures: []
      }
    }
    acc[dateKey].fixtures.push(fixture)
    return acc
  }, {} as Record<string, { date: Date; fixtures: Fixture[] }>)

  // Sort dates descending (most recent first)
  const sortedDates = Object.keys(fixturesByDate).sort((a, b) => b.localeCompare(a))

  // Format date like "Thursday 10 October 2025"
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <div className="font-mono" style={{ fontSize: 'var(--text-size-base)' }}>
      {/* System advisory */}
      <div className="mb-6 border border-corpo-border/50 bg-corpo-bg/50 p-4">
        <div className="space-y-2 text-corpo-text/60 text-sm">
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
        {allFixtures.length === 0 ? (
          <div className="text-corpo-text/50 py-8 text-center">
            No fixtures available
          </div>
        ) : (
          sortedDates.map(dateKey => (
            <div key={dateKey}>
              {/* Date separator */}
              <div className="text-corpo-text/40 text-sm py-3 mt-4 first:mt-0">
                {formatDate(fixturesByDate[dateKey].date)}
              </div>
              
              {/* Fixtures for this date */}
              {fixturesByDate[dateKey].fixtures.map(fixture => (
                <FixtureItem
                  key={fixture._id}
                  fixture={fixture}
                  isExpanded={expandedFixture === fixture._id}
                  expandedEvent={expandedEvent}
                  onToggle={() => toggleFixture(fixture._id)}
                  onToggleEvent={toggleEvent}
                  onOpenVideo={(info) => setVideoModal(info)}
                />
              ))}
            </div>
          ))
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
  
  const { teams, goals, fixture: fixtureInfo, events } = fixture
  const isLive = ['1H', '2H', 'HT', 'ET', 'P'].includes(fixtureInfo.status.short)
  
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

  const fixtureDate = new Date(fixtureInfo.date)
  const _dateStr = fixtureDate.toLocaleDateString('en-GB', { 
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
        
        {/* Fixture title with scanning indicator on right */}
        <span className="flex-1 flex items-center gap-2 min-w-0">
          <span className="truncate">
            {teams.home.name}
            <span className="text-corpo-text/50 mx-2">
              {goals?.home ?? 0} - {goals?.away ?? 0}
            </span>
            {teams.away.name}
          </span>
          
          {/* Scanning indicator - right of fixture title */}
          {hasActiveScanning && (
            <span className="text-lavender/70 flex-shrink-0">
              {hasValidating ? (
                <ValidatingIcon className="w-4 h-4" />
              ) : hasExtracting ? (
                <ExtractingIcon className="w-4 h-4" />
              ) : null}
            </span>
          )}
        </span>
        
        {/* Status on far right */}
        <span className={cn(
          "text-corpo-text/60 flex-shrink-0",
          isLive && "text-lavender"
        )}>
          {isLive ? `${fixtureInfo.status.elapsed}'` : fixtureInfo.status.short}
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
  
  // Get videos - prefer ranked _s3_videos, fall back to legacy _s3_urls
  const rankedVideos: (RankedVideo | { url: string; rank: number; perceptual_hash?: string })[] = event._s3_videos 
    ? [...event._s3_videos].sort((a, b) => a.rank - b.rank)  // Sort by rank (1 = best)
    : event._s3_urls?.map((url, idx) => ({ url, rank: idx + 1, perceptual_hash: undefined })) || []
  
  const videoCount = rankedVideos.length
  const timeStr = event.time.extra 
    ? `${event.time.elapsed}+${event.time.extra}'` 
    : `${event.time.elapsed}'`
  
  // Scanning states:
  // - _monitor_complete = false: Debounce/validating (event just detected, waiting for stability)
  // - _monitor_complete = true && _twitter_complete = false: Extracting clips from Twitter
  // - Both true: All scanning complete
  const isValidating = !event._monitor_complete
  const isExtracting = event._monitor_complete === true && !event._twitter_complete
  const isStillScanning = isValidating || isExtracting

  // Use MongoDB display fields for video modal
  const videoTitle = event._display_title || `${fixture.teams.home.name} vs ${fixture.teams.away.name}`
  const videoSubtitle = event._display_subtitle || `${timeStr} - ${event.player.name || 'Goal'}`

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
          {/* Title line: score at moment of goal - with <<highlighted>> scoring team and icon */}
          <div className="flex items-center gap-2">
            <span className="truncate">
              <HighlightedText text={event._display_title || `${event.player.name || 'Goal'} (${event.team.name})`} />
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
            <HighlightedText text={event._display_subtitle || `${timeStr} - ${event.player.name || 'Unknown'}`} />
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

      {/* Videos - collapsed content with horizontal clip buttons */}
      {isExpanded && (
        <div className="ml-4 border-l border-corpo-border">
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
    >
      {index}
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
      setTimeout(() => setCopied(false), 2000)
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
              className="text-corpo-text/50 text-sm"
            >
              <HighlightedText text={subtitle} />
            </div>
          </div>

          {/* Action buttons - right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Share button */}
          <button
            onClick={handleShare}
            onMouseEnter={() => setShareHovered(true)}
            onMouseLeave={() => { setShareHovered(false); setShareActive(false) }}
            onMouseDown={() => setShareActive(true)}
            onMouseUp={() => setShareActive(false)}
            className={cn(
              "p-1 transition-none",
              shareActive ? "text-lavender" : shareHovered ? "text-corpo-light" : "text-corpo-text"
            )}
          >
            {copied ? (
              <RiCheckLine className="w-5 h-5 text-lavender" />
            ) : shareActive || shareHovered ? (
              <RiShareBoxFill className="w-5 h-5" />
            ) : (
              <RiShareBoxLine className="w-5 h-5" />
            )}
          </button>
          {/* Download button */}
          <button
            onClick={handleDownload}
            onMouseEnter={() => setDownloadHovered(true)}
            onMouseLeave={() => { setDownloadHovered(false); setDownloadActive(false) }}
            onMouseDown={() => setDownloadActive(true)}
            onMouseUp={() => setDownloadActive(false)}
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
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => { setCloseHovered(false); setCloseActive(false) }}
            onMouseDown={() => setCloseActive(true)}
            onMouseUp={() => setCloseActive(false)}
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