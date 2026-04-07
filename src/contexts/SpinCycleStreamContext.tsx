import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import type { Transcript, ClaimDetail } from '@/types/spin-cycle'

const API_BASE = import.meta.env.VITE_SPIN_CYCLE_API_URL || '/api/spin-cycle'

interface SpinCycleState {
  transcripts: Transcript[]
  isConnected: boolean
  isBackendOnline: boolean
  isLoading: boolean
  error: string | null
  lastUpdate: Date | null
}

interface SpinCycleContextValue extends SpinCycleState {
  fetchClaimDetail: (claimId: string) => Promise<ClaimDetail | null>
}

const SpinCycleStreamContext = createContext<SpinCycleContextValue | null>(null)

export function SpinCycleStreamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SpinCycleState>({
    transcripts: [],
    isConnected: false,
    isBackendOnline: false,
    isLoading: true,
    error: null,
    lastUpdate: null,
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)

  // Fetch all transcripts
  const fetchTranscripts = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setState(s => ({ ...s, isLoading: true }))
    }

    try {
      const res = await fetch(`${API_BASE}/transcripts`, { cache: 'no-store' })
      const data = await res.json()
      setState(s => ({
        ...s,
        transcripts: data.transcripts || [],
        isLoading: false,
        isBackendOnline: true,
        lastUpdate: new Date(),
        error: null,
      }))
    } catch (err) {
      console.error('[SpinCycleStream] Failed to fetch transcripts:', err)
      setState(s => ({
        ...s,
        isLoading: false,
        isBackendOnline: false,
        error: 'Failed to load transcripts',
      }))
    }
  }, [])

  // Fetch full claim detail — always fresh, no caching
  const fetchClaimDetail = useCallback(async (claimId: string): Promise<ClaimDetail | null> => {
    try {
      const res = await fetch(`${API_BASE}/claims/${claimId}`, { cache: 'no-store' })
      if (!res.ok) return null
      return await res.json()
    } catch (err) {
      console.error('[SpinCycleStream] Failed to fetch claim detail:', err)
      return null
    }
  }, [])

  // Connect SSE — uses refs only, no state deps in the closure
  const connectSSE = useCallback(() => {
    // Clean up existing
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    console.log('[SpinCycleStream] Connecting SSE...')
    const eventSource = new EventSource(`${API_BASE}/stream`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      reconnectAttempts.current = 0
      console.log('[SpinCycleStream] SSE connected')
      setState(s => ({ ...s, isConnected: true, isBackendOnline: true, error: null }))
    }

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        switch (event.type) {
          case 'connected':
            break
          case 'refresh':
            console.log('[SpinCycleStream] Refresh signal, refetching...')
            fetchTranscripts()
            break
          case 'heartbeat':
            break
          case 'health':
            break
          case 'error':
            setState(s => ({ ...s, error: event.message || 'Stream error' }))
            break
        }
      } catch (err) {
        console.error('[SpinCycleStream] Failed to parse SSE event:', err)
      }
    }

    eventSource.onerror = () => {
      console.log('[SpinCycleStream] SSE error/disconnected')
      setState(s => ({ ...s, isConnected: false }))
      eventSourceRef.current?.close()
      eventSourceRef.current = null

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
      reconnectAttempts.current++
      console.log(`[SpinCycleStream] Reconnecting in ${delay}ms`)
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay)
    }
  }, [fetchTranscripts])

  // Single effect: fetch data, connect SSE, handle visibility
  // Mirrors found-footy's pattern
  useEffect(() => {
    // Initial fetch then connect
    fetchTranscripts(true).then(() => {
      connectSSE()
    })

    // Visibility handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchTranscripts()
        if (!eventSourceRef.current || eventSourceRef.current.readyState !== EventSource.OPEN) {
          reconnectAttempts.current = 0
          connectSSE()
        }
      }
      // Don't disconnect on hidden — spin-cycle should stay connected
      // (unlike found-footy which only connects when viewing today)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount — fetchTranscripts and connectSSE are stable

  const contextValue: SpinCycleContextValue = {
    ...state,
    fetchClaimDetail,
  }

  return (
    <SpinCycleStreamContext.Provider value={contextValue}>
      {children}
    </SpinCycleStreamContext.Provider>
  )
}

export function useSpinCycleStream(): SpinCycleContextValue {
  const context = useContext(SpinCycleStreamContext)
  if (!context) {
    throw new Error('useSpinCycleStream must be used within a SpinCycleStreamProvider')
  }
  return context
}
