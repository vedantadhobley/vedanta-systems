import { useState, useEffect, useCallback, useRef } from 'react'
import type { Fixture, FixturesResponse } from '@/types/found-footy'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || 'http://localhost:4001/api/found-footy'

// Transform a single video URL to be fully qualified
function transformUrl(url: string): string {
  if (url.startsWith('/video/')) {
    return `${API_BASE}${url}`
  }
  // Already fully qualified
  return url
}

// Transform video URLs to be fully qualified API proxy URLs
function transformVideoUrls(fixtures: Fixture[]): Fixture[] {
  return fixtures.map(fixture => ({
    ...fixture,
    events: fixture.events?.map(event => ({
      ...event,
      _s3_urls: event._s3_urls?.map(transformUrl) || [],
      _s3_videos: event._s3_videos?.map(video => ({
        ...video,
        url: transformUrl(video.url)
      }))
    })) || []
  }))
}

interface BackendHealth {
  mongo: { status: 'up' | 'down' | 'unknown'; lastCheck: Date | null }
  s3: { status: 'up' | 'down' | 'unknown'; lastCheck: Date | null }
  temporal: { status: 'up' | 'down' | 'unknown'; lastCheck: Date | null }
  twitter: { status: 'up' | 'down' | 'unknown'; lastCheck: Date | null }
  overall: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
}

interface SSEEvent {
  type: 'initial' | 'refresh' | 'heartbeat' | 'error' | 'health'
  fixtures?: Fixture[]
  completedFixtures?: Fixture[]
  message?: string
  health?: BackendHealth
}

export function useFootyStream() {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [completedFixtures, setCompletedFixtures] = useState<Fixture[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null) // null = unknown until checked
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch backend health status
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`)
      const data = await res.json()
      const healthy = data.status === 'ok' && data.health?.overall === 'healthy'
      setBackendHealthy(healthy)
      console.log(`💚 Backend health check: ${healthy ? 'healthy' : 'degraded'}`, data.health)
    } catch (err) {
      console.error('Failed to fetch health:', err)
      setBackendHealthy(false)
    }
  }, [])

  // Fetch fixtures from REST endpoint
  const fetchFixtures = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/fixtures`)
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
        // Server sends updated data directly - found-footy finished a cycle
        console.log('🔄 Refresh received with updated data')
        if (event.fixtures) setFixtures(transformVideoUrls(event.fixtures))
        if (event.completedFixtures) setCompletedFixtures(transformVideoUrls(event.completedFixtures))
        setLastUpdate(new Date())
        break
        
      case 'heartbeat':
        // Connection alive, no action needed
        break

      case 'health':
        // Backend health status update
        if (event.health) {
          const healthy = event.health.overall === 'healthy'
          console.log(`💚 Backend health: ${event.health.overall}`, event.health)
          setBackendHealthy(healthy)
          if (!healthy) {
            console.warn('⚠️ Backend health degraded:', event.health)
          }
        }
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

  // Fetch initial health and connect on mount
  useEffect(() => {
    fetchHealth() // Check health immediately
    connect()
    return () => disconnect()
  }, [connect, disconnect, fetchHealth])

  return {
    fixtures,
    completedFixtures,
    isConnected: isConnected && backendHealthy === true, // Only show online if both API connection and backend are explicitly healthy
    error,
    lastUpdate,
    reconnect: connect,
    refetch: fetchFixtures
  }
}
