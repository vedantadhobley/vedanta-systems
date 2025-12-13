import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import type { Fixture } from '@/types/found-footy'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || 'http://localhost:4001/api/found-footy'

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

interface FootyStreamState {
  stagingFixtures: Fixture[]
  fixtures: Fixture[]
  completedFixtures: Fixture[]
  isConnected: boolean
  error: string | null
  lastUpdate: Date | null
}

const FootyStreamContext = createContext<FootyStreamState | null>(null)

export function FootyStreamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FootyStreamState>({
    stagingFixtures: [],
    fixtures: [],
    completedFixtures: [],
    isConnected: false,
    error: null,
    lastUpdate: null
  })
  
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/stream`)
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      setState(s => ({ ...s, isConnected: true, error: null }))
    }
    
    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        
        switch (event.type) {
          case 'initial':
          case 'refresh':
            setState(s => ({
              ...s,
              stagingFixtures: event.stagingFixtures || s.stagingFixtures,
              fixtures: event.fixtures ? transformVideoUrls(event.fixtures) : s.fixtures,
              completedFixtures: event.completedFixtures ? transformVideoUrls(event.completedFixtures) : s.completedFixtures,
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
      setState(s => ({ ...s, isConnected: false }))
    }
    
    return () => {
      eventSource.close()
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
