import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Fixture, FootyDateIntent, SearchDateGroup } from '@/types/found-footy'
import { useTimezone } from '@/contexts/timezone-context'
import {
  applyFootyLiveEvent,
  dateIntentForSelection,
  isFixturesResponse,
  isFootyLiveEvent,
  resolveRecoveryDate,
  type FootyLiveEvent,
} from '@/lib/found-footy-live'
import { orderFixturesForPresentation } from '@/lib/found-footy-presentation'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || '/api/found-footy'

interface FootyState {
  currentDate: string
  dateIntent: FootyDateIntent
  availableDates: string[]
  fixtures: Fixture[]

  isConnected: boolean
  isBackendOnline: boolean
  isLoading: boolean
  isChangingDate: boolean
  error: string | null
  lastUpdate: Date | null

  searchMode: boolean
  searchQuery: string
  searchResults: SearchDateGroup[]
  isSearching: boolean
  searchTotalFixtures: number
}

interface FootyContextValue extends FootyState {
  navigableDates: string[]
  setDate: (date: string) => void
  goToToday: () => void
  goToPreviousDate: () => void
  goToNextDate: () => void
  pauseStream: () => void
  resumeStream: () => void
  navigateToEvent: (eventId: string) => Promise<boolean>
  enterSearch: () => void
  exitSearch: () => void
  executeSearch: (query: string) => void
}

interface RecordedLiveEvent {
  revision: number
  event: FootyLiveEvent
}

const FootyStreamContext = createContext<FootyContextValue | null>(null)

export function FootyStreamProvider({ children }: { children: ReactNode }) {
  const { getToday, mode, getDateForTimestamp } = useTimezone()

  const [state, setState] = useState<FootyState>(() => ({
    currentDate: '',
    dateIntent: 'live',
    availableDates: [],
    fixtures: [],
    isConnected: false,
    isBackendOnline: false,
    isLoading: true,
    isChangingDate: false,
    error: null,
    lastUpdate: null,
    searchMode: false,
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    searchTotalFixtures: 0,
  }))

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)
  const isPausedRef = useRef(false)
  const currentDateRef = useRef(state.currentDate)
  const dateIntentRef = useRef<FootyDateIntent>(state.dateIntent)
  const snapshotAbortRef = useRef<AbortController | null>(null)
  const snapshotGenerationRef = useRef(0)
  const liveRevisionRef = useRef(0)
  const liveEventLogRef = useRef<RecordedLiveEvent[]>([])

  useEffect(() => { currentDateRef.current = state.currentDate }, [state.currentDate])
  useEffect(() => { dateIntentRef.current = state.dateIntent }, [state.dateIntent])

  const fixtureDates = useCallback((fixtures: readonly Fixture[]) => (
    [...new Set(fixtures.map(fixture => getDateForTimestamp(fixture.fixture.date)))].sort().reverse()
  ), [getDateForTimestamp])

  const applyLiveEvent = useCallback((event: FootyLiveEvent) => {
    const revision = ++liveRevisionRef.current
    liveEventLogRef.current.push({ revision, event })
    if (liveEventLogRef.current.length > 200) liveEventLogRef.current.shift()

    setState(current => {
      const fixtures = applyFootyLiveEvent(current.fixtures, event)
      return {
        ...current,
        fixtures,
        availableDates: event.type === 'fixture_update' ? fixtureDates(fixtures) : current.availableDates,
        lastUpdate: new Date(),
      }
    })
  }, [fixtureDates])

  const fetchFixtureSnapshot = useCallback(async (isInitial = false) => {
    const generation = ++snapshotGenerationRef.current
    const startRevision = liveRevisionRef.current
    snapshotAbortRef.current?.abort()
    const controller = new AbortController()
    snapshotAbortRef.current = controller
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15_000)

    if (isInitial) setState(current => ({ ...current, isLoading: true }))

    try {
      const response = await fetch(`${API_BASE}/fixtures`, { signal: controller.signal })
      if (!response.ok) throw new Error(`fixture snapshot returned ${response.status}`)
      const body: unknown = await response.json()
      if (!isFixturesResponse(body)) throw new Error('fixture snapshot did not match the FF-077 contract')
      if (generation !== snapshotGenerationRef.current) return

      const fixtures = orderFixturesForPresentation(body.fixtures)
      setState(current => ({
        ...current,
        fixtures,
        availableDates: fixtureDates(fixtures),
        isLoading: false,
        isChangingDate: false,
        isBackendOnline: true,
        lastUpdate: new Date(),
        error: null,
      }))

      // A transient NATS/SSE patch can arrive after this request starts but
      // before its older response commits. Replay those patches after the
      // snapshot state update so stale REST cannot overwrite newer live data.
      const arrivedDuringSnapshot = liveEventLogRef.current
        .filter(entry => entry.revision > startRevision)
        .map(entry => entry.event)
      for (const event of arrivedDuringSnapshot) {
        setState(current => {
          const replayed = applyFootyLiveEvent(current.fixtures, event)
          return {
            ...current,
            fixtures: replayed,
            availableDates: event.type === 'fixture_update' ? fixtureDates(replayed) : current.availableDates,
          }
        })
      }
      liveEventLogRef.current = []
    } catch (error) {
      if ((!timedOut && controller.signal.aborted) || generation !== snapshotGenerationRef.current) return
      console.error('[FootyStream] Failed to fetch fixture snapshot:', error)
      setState(current => ({
        ...current,
        isLoading: false,
        isChangingDate: false,
        isBackendOnline: false,
        error: 'Failed to refresh fixtures',
      }))
    } finally {
      clearTimeout(timeout)
    }
  }, [fixtureDates])

  const reconcile = useCallback(async (reason: string) => {
    const recoveredDate = resolveRecoveryDate(dateIntentRef.current, currentDateRef.current, getToday())
    if (currentDateRef.current !== recoveredDate) {
      currentDateRef.current = recoveredDate
      setState(current => ({ ...current, currentDate: recoveredDate }))
    }
    console.log(`[FootyStream] Reconciling fixture snapshot (${reason})`)
    await fetchFixtureSnapshot(false)
  }, [fetchFixtureSnapshot, getToday])

  const connectSSE = useCallback(() => {
    if (dateIntentRef.current !== 'live' || isPausedRef.current || document.visibilityState === 'hidden') return

    if (eventSourceRef.current) eventSourceRef.current.close()
    const eventSource = new EventSource(`${API_BASE}/stream`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      reconnectAttempts.current = 0
      setState(current => ({ ...current, isConnected: true, isBackendOnline: true, error: null }))
    }

    eventSource.onmessage = message => {
      if (dateIntentRef.current !== 'live') return
      try {
        const event: unknown = JSON.parse(message.data)
        if (!event || typeof event !== 'object') return
        const type = (event as { type?: unknown }).type

        if (type === 'connected') {
          // Registration happens before this marker is written. Snapshot now
          // to close the initial/reconnect gap, then replay any concurrent SSE.
          void reconcile('sse-connected')
        } else if (type === 'resync') {
          void reconcile(String((event as { reason?: unknown }).reason || 'stream-resync'))
        } else if (isFootyLiveEvent(event)) {
          applyLiveEvent(event)
        } else if (type === 'health') {
          const overall = (event as { health?: { overall?: unknown } }).health?.overall
          setState(current => ({ ...current, isBackendOnline: overall !== 'unhealthy' }))
        } else if (type === 'error') {
          const message = (event as { message?: unknown }).message
          setState(current => ({ ...current, error: String(message || 'Stream error') }))
        }
      } catch (error) {
        console.error('[FootyStream] Failed to parse SSE event:', error)
      }
    }

    eventSource.onerror = () => {
      setState(current => ({ ...current, isConnected: false }))
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      if (isPausedRef.current || dateIntentRef.current !== 'live' || document.visibilityState === 'hidden') return

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
      reconnectAttempts.current++
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay)
    }
  }, [applyLiveEvent, reconcile])

  const disconnectSSE = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    reconnectTimeoutRef.current = null
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setState(current => ({ ...current, isConnected: false }))
  }, [])

  const setDate = useCallback((date: string) => {
    const intent = dateIntentForSelection(date, getToday())
    dateIntentRef.current = intent
    currentDateRef.current = date
    setState(current => ({ ...current, currentDate: date, dateIntent: intent, isChangingDate: true }))
    void fetchFixtureSnapshot(false)
  }, [fetchFixtureSnapshot, getToday])

  useEffect(() => {
    if (state.dateIntent === 'live' && !state.isChangingDate && !state.isLoading) connectSSE()
    else if (state.dateIntent === 'pinned') disconnectSSE()
  }, [state.dateIntent, state.isChangingDate, state.isLoading, connectSSE, disconnectSSE])

  const today = getToday()
  const navigableDates = useMemo(() => {
    const past = state.availableDates.filter(date => date < today)
    const firstFuture = [...state.availableDates].filter(date => date > today).sort()[0]
    const dates = new Set<string>([...past, today])
    if (firstFuture) dates.add(firstFuture)
    return [...dates].sort().reverse()
  }, [state.availableDates, today])

  const goToToday = useCallback(() => {
    const nextToday = getToday()
    dateIntentRef.current = 'live'
    currentDateRef.current = nextToday
    setState(current => ({ ...current, currentDate: nextToday, dateIntent: 'live', isChangingDate: true }))
    void fetchFixtureSnapshot(false)
  }, [fetchFixtureSnapshot, getToday])

  const goToPreviousDate = useCallback(() => {
    const currentDate = state.currentDate
    const index = navigableDates.indexOf(currentDate)
    if (index >= 0 && index < navigableDates.length - 1) setDate(navigableDates[index + 1])
    else if (index === -1) {
      const older = navigableDates.filter(date => date < currentDate)
      if (older.length > 0) setDate(older[0])
    }
  }, [state.currentDate, navigableDates, setDate])

  const goToNextDate = useCallback(() => {
    const currentDate = state.currentDate
    const index = navigableDates.indexOf(currentDate)
    if (index > 0) setDate(navigableDates[index - 1])
    else if (index === -1) {
      const newer = navigableDates.filter(date => date > currentDate)
      if (newer.length > 0) setDate(newer[newer.length - 1])
    }
  }, [state.currentDate, navigableDates, setDate])

  const navigateToEvent = useCallback(async (eventId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/event/${eventId}`)
      if (!response.ok) return false
      const data = await response.json()
      if (!data.found || (!data.kickoff && !data.date)) return false
      const targetDate = data.kickoff ? getDateForTimestamp(data.kickoff) : data.date
      setDate(targetDate)
      return true
    } catch (error) {
      console.error('[FootyStream] Failed to look up event:', error)
      return false
    }
  }, [getDateForTimestamp, setDate])

  const pauseStream = useCallback(() => {
    if (isPausedRef.current) return
    isPausedRef.current = true
    disconnectSSE()
  }, [disconnectSSE])

  const resumeStream = useCallback(() => {
    if (!isPausedRef.current) return
    isPausedRef.current = false
    void reconcile('deliberate-resume')
    if (dateIntentRef.current === 'live') connectSSE()
  }, [connectSSE, reconcile])

  const initialSetupDone = useRef(false)
  useEffect(() => {
    if (initialSetupDone.current) return
    initialSetupDone.current = true
    const initialToday = getToday()
    currentDateRef.current = initialToday
    dateIntentRef.current = 'live'
    setState(current => ({ ...current, currentDate: initialToday, dateIntent: 'live' }))
    void fetchFixtureSnapshot(true)
  }, [fetchFixtureSnapshot, getToday])

  // A timezone-mode change preserves explicit pinned intent. A live view
  // follows the newly calculated day and re-buckets the complete snapshot.
  const previousModeRef = useRef(mode)
  useEffect(() => {
    if (previousModeRef.current === mode) return
    previousModeRef.current = mode
    void reconcile('timezone-change')
  }, [mode, reconcile])

  useEffect(() => {
    const recover = (reason: string) => {
      if (document.visibilityState === 'hidden') return
      void reconcile(reason)
      if (dateIntentRef.current === 'live' && !isPausedRef.current) connectSSE()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recover('visibility-resume')
      else disconnectSSE()
    }
    const onPageShow = () => recover('pageshow')
    const onOnline = () => recover('online')

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
    }
  }, [connectSSE, disconnectSSE, reconcile])

  // Advance a live view at the active timezone's midnight even if the tab
  // remains foregrounded and no stream event happens at the boundary.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const now = new Date()
      const next = mode === 'utc'
        ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
      timer = setTimeout(() => {
        if (dateIntentRef.current === 'live' && document.visibilityState !== 'hidden') {
          void reconcile('midnight')
        }
        schedule()
      }, Math.max(1000, next - now.getTime() + 250))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [mode, reconcile])

  useEffect(() => () => {
    snapshotAbortRef.current?.abort()
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    eventSourceRef.current?.close()
  }, [])

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const enterSearch = useCallback(() => {
    setState(current => ({ ...current, searchMode: true, searchQuery: '', searchResults: [], searchTotalFixtures: 0 }))
  }, [])

  const exitSearch = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setState(current => ({
      ...current,
      searchMode: false,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      searchTotalFixtures: 0,
    }))
  }, [])

  const executeSearch = useCallback((query: string) => {
    setState(current => ({ ...current, searchQuery: query }))
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    if (query.trim().length < 2) {
      setState(current => ({ ...current, searchResults: [], isSearching: false, searchTotalFixtures: 0 }))
      return
    }

    setState(current => ({ ...current, isSearching: true }))
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query.trim())}`)
        if (!response.ok) throw new Error(`search returned ${response.status}`)
        const data = await response.json()
        setState(current => ({
          ...current,
          searchResults: data.results || [],
          searchTotalFixtures: data.totalFixtures || 0,
          isSearching: false,
        }))
      } catch (error) {
        console.error('[FootyStream] Search failed:', error)
        setState(current => ({ ...current, isSearching: false }))
      }
    }, 300)
  }, [])

  const contextValue: FootyContextValue = {
    ...state,
    navigableDates,
    setDate,
    goToToday,
    goToPreviousDate,
    goToNextDate,
    pauseStream,
    resumeStream,
    navigateToEvent,
    enterSearch,
    exitSearch,
    executeSearch,
  }

  return <FootyStreamContext.Provider value={contextValue}>{children}</FootyStreamContext.Provider>
}

export function useFootyStream(): FootyContextValue {
  const context = useContext(FootyStreamContext)
  if (!context) throw new Error('useFootyStream must be used within a FootyStreamProvider')
  return context
}
