import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import type { Fixture } from '@/types/found-footy'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || 'http://localhost:4001/api/found-footy'

// Check for server-injected initial data (preloaded by server for instant display)
interface PreloadedData {
  staging?: Fixture[]
  active?: Fixture[]
  completed?: Fixture[]
  timestamp?: string
}

declare global {
  interface Window {
    __FOOTY_INITIAL_DATA__?: PreloadedData
  }
}

// Transform a single video URL to be fully qualified
function transformUrl(url: string): string {
  if (url.startsWith('/video/')) {
    return `${API_BASE}${url}`
  }
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

// Get initial state - use preloaded data if available
function getInitialState(): FootyStreamState {
  const preloaded = window.__FOOTY_INITIAL_DATA__
  
  if (preloaded) {
    console.log('[FootyStream] Using preloaded data from server')
    return {
      stagingFixtures: preloaded.staging || [],
      fixtures: preloaded.active ? transformVideoUrls(preloaded.active) : [],
      completedFixtures: preloaded.completed ? transformVideoUrls(preloaded.completed) : [],
      isConnected: false,
      isLoading: false,  // Not loading - we have data!
      error: null,
      lastUpdate: preloaded.timestamp ? new Date(preloaded.timestamp) : new Date()
    }
  }
  
  // No preloaded data - start in loading state
  return {
    stagingFixtures: [],
    fixtures: [],
    completedFixtures: [],
    isConnected: false,
    isLoading: true,
    error: null,
    lastUpdate: null
  }
}

interface FootyStreamState {
  stagingFixtures: Fixture[]
  fixtures: Fixture[]
  completedFixtures: Fixture[]
  isConnected: boolean
  isLoading: boolean  // True until first data received
  error: string | null
  lastUpdate: Date | null
}

const FootyStreamContext = createContext<FootyStreamState | null>(null)

export function FootyStreamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FootyStreamState>(getInitialState)
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const initialFetchDone = useRef(false)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)

  // Fetch fresh data from REST API
  const fetchFreshData = async () => {
    try {
      const res = await fetch(`${API_BASE}/fixtures`)
      const data = await res.json()
      setState(s => ({
        ...s,
        stagingFixtures: data.staging || [],
        fixtures: data.active ? transformVideoUrls(data.active) : [],
        completedFixtures: data.completed ? transformVideoUrls(data.completed) : [],
        isLoading: false,
        lastUpdate: new Date()
      }))
      console.log('[FootyStream] Fetched fresh data')
    } catch (err) {
      console.warn('[FootyStream] Failed to fetch fresh data:', err)
    }
  }

  // Create or reconnect SSE connection
  const connectSSE = () => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    const eventSource = new EventSource(`${API_BASE}/stream`)
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      console.log('[FootyStream] SSE connected')
      reconnectAttempts.current = 0 // Reset on successful connection
      setState(s => ({ ...s, isConnected: true, error: null }))
    }
    
    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        
        switch (event.type) {
          case 'initial':
          case 'refresh':
            // Handle both naming conventions (stagingFixtures vs staging, etc.)
            const staging = event.stagingFixtures ?? event.staging ?? []
            const active = event.fixtures ?? event.active ?? []
            const completed = event.completedFixtures ?? event.completed ?? []
            
            setState(s => ({
              ...s,
              stagingFixtures: staging,
              fixtures: active.length > 0 ? transformVideoUrls(active) : [],
              completedFixtures: completed.length > 0 ? transformVideoUrls(completed) : [],
              isLoading: false,
              lastUpdate: new Date()
            }))
            break
          case 'heartbeat':
            // Connection alive
            break
          case 'error':
            setState(s => ({ ...s, error: event.message || 'Stream error' }))
            break
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err)
      }
    }
    
    eventSource.onerror = () => {
      console.warn('[FootyStream] SSE connection error')
      setState(s => ({ ...s, isConnected: false }))
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      
      // Exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s)
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
      reconnectAttempts.current++
      
      console.log(`[FootyStream] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`)
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay)
    }
  }

  // Initial setup and visibility change handling
  useEffect(() => {
    // Prefetch data immediately via REST (faster than waiting for SSE initial event)
    if (!initialFetchDone.current && state.isLoading) {
      initialFetchDone.current = true
      fetch(`${API_BASE}/fixtures`)
        .then(res => res.json())
        .then(data => {
          // Only use this if we're still loading (SSE hasn't delivered yet)
          setState(s => {
            if (!s.isLoading) return s // SSE already delivered, skip
            console.log('[FootyStream] Using prefetched data')
            return {
              ...s,
              stagingFixtures: data.staging || [],
              fixtures: data.active ? transformVideoUrls(data.active) : [],
              completedFixtures: data.completed ? transformVideoUrls(data.completed) : [],
              isLoading: false,
              lastUpdate: new Date()
            }
          })
        })
        .catch(err => {
          console.warn('[FootyStream] Prefetch failed, waiting for SSE:', err)
          setTimeout(() => {
            setState(s => {
              if (!s.isLoading) return s
              console.warn('[FootyStream] SSE also failed, clearing loading state')
              return { ...s, isLoading: false }
            })
          }, 10000)
        })
    }

    // Start SSE connection
    connectSSE()

    // Handle visibility changes (mobile background/foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[FootyStream] Tab became visible, refreshing...')
        // Immediately fetch fresh data (faster than waiting for SSE)
        fetchFreshData()
        // Reconnect SSE if it's not connected
        if (!eventSourceRef.current || eventSourceRef.current.readyState !== EventSource.OPEN) {
          reconnectAttempts.current = 0 // Reset backoff on manual reconnect
          connectSSE()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [])

  return (
    <FootyStreamContext.Provider value={state}>
      {children}
    </FootyStreamContext.Provider>
  )
}

export function useFootyStream(): FootyStreamState {
  const context = useContext(FootyStreamContext)
  if (!context) {
    throw new Error('useFootyStream must be used within a FootyStreamProvider')
  }
  return context
}
