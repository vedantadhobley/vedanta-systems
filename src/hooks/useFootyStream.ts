import { useState, useEffect, useCallback, useRef } from 'react'
import type { Fixture, FixturesResponse } from '@/types/found-footy'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || 'http://localhost:4001'

// Transform a single video URL to be fully qualified
function transformUrl(url: string): string {
  // New format: already relative, just prepend API base
  if (url.startsWith('/video/')) {
    return `${API_BASE}${url}`
  }
  // Legacy format: replace container hostname with API proxy
  // Handles both found-footy-minio and found-footy-dev-minio
  return url.replace(/http:\/\/found-footy(-dev)?-minio:9000\//, `${API_BASE}/video/`)
}

// Transform video URLs to be fully qualified API proxy URLs
// Handles both _s3_urls (legacy) and _s3_videos (new ranked format)
function transformVideoUrls(fixtures: Fixture[]): Fixture[] {
  return fixtures.map(fixture => ({
    ...fixture,
    events: fixture.events?.map(event => ({
      ...event,
      // Transform legacy _s3_urls
      _s3_urls: event._s3_urls?.map(transformUrl) || [],
      // Transform new _s3_videos with ranking
      _s3_videos: event._s3_videos?.map(video => ({
        ...video,
        url: transformUrl(video.url)
      }))
    })) || []
  }))
}

interface SSEEvent {
  type: 'initial' | 'refresh' | 'heartbeat' | 'error'
  fixtures?: Fixture[]
  completedFixtures?: Fixture[]
  message?: string
}

export function useFootyStream() {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [completedFixtures, setCompletedFixtures] = useState<Fixture[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch fixtures from REST endpoint
  const fetchFixtures = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/`)
      const data: FixturesResponse = await res.json()
      setFixtures(transformVideoUrls(data.active))
      setCompletedFixtures(transformVideoUrls(data.completed))
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      console.error('Failed to fetch fixtures:', err)
      setError('Failed to fetch fixtures')
    }
  }, [])

  // Handle SSE events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'initial':
        // Initial load from SSE - transform URLs
        if (event.fixtures) setFixtures(transformVideoUrls(event.fixtures))
        if (event.completedFixtures) setCompletedFixtures(transformVideoUrls(event.completedFixtures))
        setLastUpdate(new Date())
        break
        
      case 'refresh':
        // Server tells us to refetch - found-footy finished a cycle
        console.log('🔄 Refresh signal received, fetching latest data...')
        fetchFixtures()
        break
        
      case 'heartbeat':
        // Connection alive, no action needed
        break
        
      case 'error':
        setError(event.message || 'Stream error')
        break
    }
  }, [fetchFixtures])

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    
    const eventSource = new EventSource(`${API_BASE}/stream`)
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      console.log('🔌 Connected to fixtures stream')
      setIsConnected(true)
      setError(null)
    }
    
    eventSource.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data)
        handleSSEEvent(event)
      } catch (err) {
        console.error('Failed to parse SSE event:', err)
      }
    }
    
    eventSource.onerror = () => {
      console.log('❌ SSE connection error, reconnecting in 3s...')
      setIsConnected(false)
      eventSource.close()
      
      // Reconnect after 3 seconds
      setTimeout(connect, 3000)
    }
  }, [handleSSEEvent])

  // Disconnect
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  // Connect on mount
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return {
    fixtures,
    completedFixtures,
    isConnected,
    error,
    lastUpdate,
    reconnect: connect,
    refetch: fetchFixtures
  }
}
