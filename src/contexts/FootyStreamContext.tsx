import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { Fixture } from '@/types/found-footy'
import { useTimezone } from '@/contexts/timezone-context'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || 'http://localhost:4001/api/found-footy'

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
  // Get timezone-aware "today" from timezone context
  const { getToday } = useTimezone()
  
  const [state, setState] = useState<FootyState>(() => ({
    currentDate: '', // Will be set on mount with timezone-aware today
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
  }))
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const isPausedRef = useRef(false)
  const currentDateRef = useRef(state.currentDate)
  
  // Keep ref in sync with state
  useEffect(() => {
    currentDateRef.current = state.currentDate
  }, [state.currentDate])

  // Check if viewing today (timezone-aware)
  const isViewingToday = useCallback(() => {
    return currentDateRef.current === getToday()
  }, [getToday])

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

  // Get adjacent days in UTC
  const getAdjacentUtcDates = (dateStr: string): { prev: string; next: string } => {
    const date = new Date(dateStr + 'T12:00:00Z')
    const prev = new Date(date)
    prev.setUTCDate(prev.getUTCDate() - 1)
    const next = new Date(date)
    next.setUTCDate(next.getUTCDate() + 1)
    return {
      prev: prev.toISOString().slice(0, 10),
      next: next.toISOString().slice(0, 10)
    }
  }

  // Fetch fixtures for a specific date (fetches 3 consecutive UTC days to cover all timezone boundaries)
  const fetchFixturesForDate = useCallback(async (date: string, isInitial = false) => {
    // Only show loading spinner on initial load
    // For date changes, isChangingDate is already set by setDate() atomically with currentDate
    if (isInitial) {
      setState(s => ({ ...s, isLoading: true }))
    }
    // Note: Don't clear fixtures here - keep old ones visible until new data arrives
    
    try {
      // Fetch 3 consecutive UTC days to handle ALL timezone boundary cases:
      // - Users behind UTC (e.g., EST): their evening is next UTC day
      // - Users ahead of UTC (e.g., India, Australia): their early morning is previous UTC day
      const { prev: prevDate, next: nextDate } = getAdjacentUtcDates(date)
      const [res1, res2, res3] = await Promise.all([
        fetch(`${API_BASE}/fixtures?date=${prevDate}`),
        fetch(`${API_BASE}/fixtures?date=${date}`),
        fetch(`${API_BASE}/fixtures?date=${nextDate}`)
      ])
      const [data1, data2, data3] = await Promise.all([res1.json(), res2.json(), res3.json()])
      
      // Merge fixtures from all 3 days, deduplicating by _id
      const mergeFixtures = (...arrays: Fixture[][]): Fixture[] => {
        const seen = new Set<number>()
        const result: Fixture[] = []
        for (const arr of arrays) {
          for (const f of arr) {
            if (!seen.has(f._id)) {
              seen.add(f._id)
              result.push(f)
            }
          }
        }
        return result
      }
      
      setState(s => ({
        ...s,
        stagingFixtures: mergeFixtures(data1.staging || [], data2.staging || [], data3.staging || []),
        activeFixtures: mergeFixtures(data1.active || [], data2.active || [], data3.active || []),
        completedFixtures: mergeFixtures(data1.completed || [], data2.completed || [], data3.completed || []),
        isLoading: false,
        isChangingDate: false,
        isBackendOnline: true,  // API responded successfully
        lastUpdate: new Date(),
        error: null
      }))
      console.log(`[FootyStream] Fetched fixtures for ${prevDate}, ${date}, ${nextDate}`)
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
            // SSE only sends fixtures for 1 UTC day, but we need multiple UTC days
            // to cover timezone boundaries. MERGE SSE data with existing fixtures
            // instead of replacing - this preserves fixtures from adjacent UTC days
            // that were loaded by fetchFixturesForDate.
            const sseStaging = event.stagingFixtures ?? event.staging ?? []
            const sseActive = event.fixtures ?? event.active ?? []
            const sseCompleted = event.completedFixtures ?? event.completed ?? []
            
            setState(s => {
              // Merge function: update existing fixtures, add new ones, keep ones not in SSE
              const mergeFixtures = (existing: Fixture[], incoming: Fixture[]): Fixture[] => {
                const incomingMap = new Map(incoming.map(f => [f._id, f]))
                const result: Fixture[] = []
                const seen = new Set<number>()
                
                // First, add all existing fixtures (updated if in incoming)
                for (const f of existing) {
                  if (incomingMap.has(f._id)) {
                    // Update with fresh data from SSE
                    result.push(incomingMap.get(f._id)!)
                  } else {
                    // Keep existing fixture (from adjacent UTC day)
                    result.push(f)
                  }
                  seen.add(f._id)
                }
                
                // Then add any new fixtures from incoming that weren't in existing
                for (const f of incoming) {
                  if (!seen.has(f._id)) {
                    result.push(f)
                  }
                }
                
                return result
              }
              
              return {
                ...s,
                stagingFixtures: mergeFixtures(s.stagingFixtures, sseStaging),
                activeFixtures: mergeFixtures(s.activeFixtures, sseActive),
                completedFixtures: mergeFixtures(s.completedFixtures, sseCompleted),
                isLoading: false,
                lastUpdate: new Date()
              }
            })
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
    // Set currentDate AND isChangingDate atomically to prevent layout collapse
    // The component will see both changes at once, preventing brief "no fixtures" flash
    setState(s => ({ ...s, currentDate: date, isChangingDate: true }))
    currentDateRef.current = date
    
    // Fetch fixtures for the new date (not initial load)
    // SSE will auto-connect/disconnect via the effect based on whether viewing today
    fetchFixturesForDate(date, false)
  }, [fetchFixturesForDate])
  
  // Connect/disconnect SSE based on current view
  // This effect runs AFTER navigation completes (isChangingDate becomes false)
  useEffect(() => {
    const today = getToday()
    const isToday = currentDateRef.current === today
    
    if (isToday && !state.isChangingDate && !state.isLoading) {
      // Viewing today and data is loaded - connect SSE for real-time updates
      connectSSE()
    } else if (!isToday) {
      // Not viewing today - ensure SSE is disconnected
      disconnectSSE()
    }
    // Don't connect while isChangingDate or isLoading - wait for fetch to complete
  }, [state.currentDate, state.isChangingDate, state.isLoading, getToday, connectSSE, disconnectSSE])

  // Navigation helpers
  const goToToday = useCallback(() => {
    setDate(getToday())
  }, [setDate, getToday])

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

  // Track if initial setup has run
  const initialSetupDone = useRef(false)
  
  // Initial setup - runs ONCE on mount only
  // Uses timezone-aware "today" at mount time, but does NOT re-run when timezone changes
  useEffect(() => {
    if (initialSetupDone.current) return
    initialSetupDone.current = true
    
    const today = getToday()
    
    // Set initial date
    setState(s => ({ ...s, currentDate: today }))
    currentDateRef.current = today
    
    // Fetch available dates
    fetchAvailableDates()
    
    // Fetch fixtures for today (initial load)
    // SSE will auto-connect via the effect once fetch completes
    fetchFixturesForDate(today, true)
  }, [getToday, fetchAvailableDates, fetchFixturesForDate])
  
  // Visibility change handler - separate effect so it uses current getToday()
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (isViewingToday() && !isPausedRef.current) {
          fetchFixturesForDate(currentDateRef.current, false)
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
  }, [isViewingToday, fetchFixturesForDate, connectSSE, disconnectSSE])

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
