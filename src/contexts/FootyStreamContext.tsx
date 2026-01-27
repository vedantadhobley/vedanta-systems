import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { Fixture } from '@/types/found-footy'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || 'http://localhost:4001/api/found-footy'

// Get today's date in YYYY-MM-DD format (UTC)
function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FootyState {
  // Current view date
  currentDate: string
  availableDates: string[]
  
  // Fixtures for current date
  stagingFixtures: Fixture[]
  activeFixtures: Fixture[]
  completedFixtures: Fixture[]
  
  // Connection state
  isConnected: boolean      // SSE connected (only when viewing today)
  isBackendOnline: boolean  // Backend API reachable (persists across date changes)
  isLoading: boolean        // Initial load only
  isChangingDate: boolean   // True during date navigation (doesn't show loading UI)
  error: string | null
  lastUpdate: Date | null
}

interface FootyContextValue extends FootyState {
  // Navigation
  setDate: (date: string) => void
  goToToday: () => void
  goToPreviousDate: () => void
  goToNextDate: () => void
  
  // For backwards compatibility
  fixtures: Fixture[]  // alias for activeFixtures
  
  // SSE control (for video modal)
  pauseStream: () => void
  resumeStream: () => void
  
  // Event lookup (for shared links)
  navigateToEvent: (eventId: string) => Promise<boolean>
}

const FootyStreamContext = createContext<FootyContextValue | null>(null)

export function FootyStreamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FootyState>({
    currentDate: getTodayDate(),
    availableDates: [],
    stagingFixtures: [],
    activeFixtures: [],
    completedFixtures: [],
    isConnected: false,
    isBackendOnline: false,
    isLoading: true,
    isChangingDate: false,
    error: null,
    lastUpdate: null
  })
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const isPausedRef = useRef(false)
  const currentDateRef = useRef(state.currentDate)
  
  // Keep ref in sync with state
  useEffect(() => {
    currentDateRef.current = state.currentDate
  }, [state.currentDate])

  // Check if viewing today
  const isViewingToday = useCallback(() => {
    return currentDateRef.current === getTodayDate()
  }, [])

  // Fetch available dates (for calendar navigation)
  const fetchAvailableDates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/dates`)
      const data = await res.json()
      setState(s => ({ ...s, availableDates: data.dates || [] }))
    } catch (err) {
      console.warn('[FootyStream] Failed to fetch available dates:', err)
    }
  }, [])

  // Get the next day in UTC
  const getNextUtcDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T12:00:00Z')
    date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }

  // Fetch fixtures for a specific date (fetches 2 consecutive UTC days to cover timezone boundaries)
  const fetchFixturesForDate = useCallback(async (date: string, isInitial = false) => {
    // Only show loading spinner on initial load
    // For date changes, isChangingDate is already set by setDate() atomically with currentDate
    if (isInitial) {
      setState(s => ({ ...s, isLoading: true }))
    }
    // Note: Don't clear fixtures here - keep old ones visible until new data arrives
    
    try {
      // Fetch 2 consecutive UTC days to handle timezone boundary cases
      // E.g., when user in EST views "Jan 26 local", we need UTC Jan 26 + Jan 27
      const nextDate = getNextUtcDate(date)
      const [res1, res2] = await Promise.all([
        fetch(`${API_BASE}/fixtures?date=${date}`),
        fetch(`${API_BASE}/fixtures?date=${nextDate}`)
      ])
      const [data1, data2] = await Promise.all([res1.json(), res2.json()])
      
      // Merge fixtures from both days
      const mergeFixtures = (arr1: Fixture[], arr2: Fixture[]) => {
        const seen = new Set<number>()
        const result: Fixture[] = []
        for (const f of [...arr1, ...arr2]) {
          if (!seen.has(f._id)) {
            seen.add(f._id)
            result.push(f)
          }
        }
        return result
      }
      
      setState(s => ({
        ...s,
        stagingFixtures: mergeFixtures(data1.staging || [], data2.staging || []),
        activeFixtures: mergeFixtures(data1.active || [], data2.active || []),
        completedFixtures: mergeFixtures(data1.completed || [], data2.completed || []),
        isLoading: false,
        isChangingDate: false,
        isBackendOnline: true,  // API responded successfully
        lastUpdate: new Date(),
        error: null
      }))
      console.log(`[FootyStream] Fetched fixtures for ${date} and ${nextDate}`)
    } catch (err) {
      console.error('[FootyStream] Failed to fetch fixtures:', err)
      setState(s => ({ 
        ...s, 
        isLoading: false,
        isChangingDate: false,
        isBackendOnline: false,  // API unreachable
        error: 'Failed to load fixtures' 
      }))
    }
  }, [])

  // Connect to SSE (only when viewing today)
  const connectSSE = useCallback(() => {
    // Don't connect if not viewing today or paused
    if (!isViewingToday() || isPausedRef.current) {
      return
    }
    
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    const eventSource = new EventSource(`${API_BASE}/stream`)
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      reconnectAttempts.current = 0
      setState(s => ({ ...s, isConnected: true, isBackendOnline: true, error: null }))
    }
    
    eventSource.onmessage = (e) => {
      // Ignore SSE updates if not viewing today
      if (!isViewingToday()) return
      
      try {
        const event = JSON.parse(e.data)
        
        switch (event.type) {
          case 'initial':
          case 'refresh': {
            // Server already filters to today's fixtures
            const staging = event.stagingFixtures ?? event.staging ?? []
            const active = event.fixtures ?? event.active ?? []
            const completed = event.completedFixtures ?? event.completed ?? []
            
            setState(s => ({
              ...s,
              stagingFixtures: staging,
              activeFixtures: active,
              completedFixtures: completed,
              isLoading: false,
              lastUpdate: new Date()
            }))
            break
          }
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
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      
      // Don't reconnect if paused or not viewing today
      if (isPausedRef.current || !isViewingToday()) {
        return
      }
      
      // Exponential backoff (1s, 2s, 4s, 8s, max 30s)
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
      reconnectAttempts.current++
      
      console.log(`[FootyStream] Reconnecting in ${delay}ms`)
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay)
    }
  }, [isViewingToday])

  // Disconnect SSE
  const disconnectSSE = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState(s => ({ ...s, isConnected: false }))
  }, [])

  // Navigation: set specific date
  const setDate = useCallback((date: string) => {
    const wasToday = currentDateRef.current === getTodayDate()
    const willBeToday = date === getTodayDate()
    
    // Set currentDate AND isChangingDate atomically to prevent layout collapse
    // The component will see both changes at once, preventing brief "no fixtures" flash
    setState(s => ({ ...s, currentDate: date, isChangingDate: true }))
    currentDateRef.current = date
    
    // Fetch fixtures for the new date (not initial load)
    fetchFixturesForDate(date, false)
    
    // Handle SSE connection based on whether we're viewing today
    if (wasToday && !willBeToday) {
      // Leaving today - disconnect SSE
      disconnectSSE()
    } else if (!wasToday && willBeToday) {
      // Going to today - connect SSE
      connectSSE()
    }
  }, [fetchFixturesForDate, connectSSE, disconnectSSE])

  // Navigation helpers
  const goToToday = useCallback(() => {
    setDate(getTodayDate())
  }, [setDate])

  const goToPreviousDate = useCallback(() => {
    const { availableDates, currentDate } = state
    const currentIndex = availableDates.indexOf(currentDate)
    // Dates are sorted descending, so "previous" means higher index (older)
    if (currentIndex < availableDates.length - 1) {
      setDate(availableDates[currentIndex + 1])
    } else if (currentIndex === -1 && availableDates.length > 0) {
      // Current date not in list, find nearest older date
      const olderDates = availableDates.filter(d => d < currentDate)
      if (olderDates.length > 0) {
        setDate(olderDates[0]) // Most recent older date
      }
    }
  }, [state, setDate])

  const goToNextDate = useCallback(() => {
    const { availableDates, currentDate } = state
    const currentIndex = availableDates.indexOf(currentDate)
    // Dates are sorted descending, so "next" means lower index (newer)
    if (currentIndex > 0) {
      setDate(availableDates[currentIndex - 1])
    } else if (currentIndex === -1) {
      // Current date not in list, find nearest newer date
      const newerDates = availableDates.filter(d => d > currentDate)
      if (newerDates.length > 0) {
        setDate(newerDates[newerDates.length - 1]) // Oldest newer date
      }
    }
  }, [state, setDate, goToToday])

  // Navigate to a specific event (for shared links) - looks up date and navigates there
  const navigateToEvent = useCallback(async (eventId: string): Promise<boolean> => {
    try {
      console.log(`[FootyStream] Looking up event ${eventId}`)
      const res = await fetch(`${API_BASE}/event/${eventId}`)
      const data = await res.json()
      
      if (data.found && data.date) {
        console.log(`[FootyStream] Event found on date ${data.date}`)
        // Navigate to that date
        setDate(data.date)
        return true
      } else {
        console.warn(`[FootyStream] Event ${eventId} not found`)
        return false
      }
    } catch (err) {
      console.error('[FootyStream] Failed to look up event:', err)
      return false
    }
  }, [setDate])

  // Pause/resume for video modal
  const pauseStream = useCallback(() => {
    if (isPausedRef.current) return
    isPausedRef.current = true
    disconnectSSE()
  }, [disconnectSSE])

  const resumeStream = useCallback(() => {
    if (!isPausedRef.current) return
    isPausedRef.current = false
    if (isViewingToday()) {
      reconnectAttempts.current = 0
      connectSSE()
    }
  }, [connectSSE, isViewingToday])

  // Initial setup
  useEffect(() => {
    // Fetch available dates
    fetchAvailableDates()
    
    // Fetch fixtures for today (initial load)
    fetchFixturesForDate(getTodayDate(), true)
    
    // Connect SSE for live updates (since we start on today)
    connectSSE()

    // Handle visibility changes - disconnect SSE when hidden to reduce memory
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (isViewingToday() && !isPausedRef.current) {
          fetchFixturesForDate(getTodayDate(), false)
          if (!eventSourceRef.current || eventSourceRef.current.readyState !== EventSource.OPEN) {
            reconnectAttempts.current = 0
            connectSSE()
          }
        }
      } else {
        // Tab hidden - disconnect SSE to reduce memory pressure
        disconnectSSE()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      disconnectSSE()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const contextValue: FootyContextValue = {
    ...state,
    fixtures: state.activeFixtures,  // backwards compat alias
    setDate,
    goToToday,
    goToPreviousDate,
    goToNextDate,
    pauseStream,
    resumeStream,
    navigateToEvent
  }

  return (
    <FootyStreamContext.Provider value={contextValue}>
      {children}
    </FootyStreamContext.Provider>
  )
}

export function useFootyStream(): FootyContextValue {
  const context = useContext(FootyStreamContext)
  if (!context) {
    throw new Error('useFootyStream must be used within a FootyStreamProvider')
  }
  return context
}
