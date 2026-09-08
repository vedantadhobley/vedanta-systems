import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  Fixture,
  FootyDateIntent,
  SearchDateGroup,
  SharedEventTarget,
} from '@/types/found-footy'
import { useTimezone } from '@/contexts/timezone-context'
import {
  applyFootyLiveEvent,
  createFootyLiveJournal,
  dateIntentForSelection,
  isFixturesResponse,
  isFootyLiveEvent,
  isSharedEventTargetResponse,
  mergeSharedTargetFixture,
  resolveRecoveryDate,
  recoverFootyParent,
  type FootyLiveEvent,
} from '@/lib/found-footy-live'
import { orderFixturesForPresentation } from '@/lib/found-footy-presentation'
import { createFootyDiagnostics } from '@/lib/found-footy-diagnostics'

const API_BASE = import.meta.env.VITE_FOOTY_API_URL || '/api/found-footy'

interface FootyState {
  currentDate: string
  dateIntent: FootyDateIntent
  availableDates: string[]
  fixtures: Fixture[]
  sharedTarget: SharedEventTarget | null
  sharedTargetStatus: 'idle' | 'loading' | 'ready' | 'not-found' | 'error'

  isConnected: boolean
  isBackendOnline: boolean
  isLoading: boolean
  isChangingDate: boolean
  error: string | null
  lastUpdate: Date | null
  parentRecoveries: Array<{ fixtureId: number; after: number }>

  searchMode: boolean
  searchQuery: string
  searchResults: SearchDateGroup[]
  isSearching: boolean
  searchTotalFixtures: number
}

interface FootyContextValue extends FootyState {
  getLiveDiagnostics: ReturnType<typeof createFootyDiagnostics>['snapshot']
  navigableDates: string[]
  setDate: (date: string) => void
  pauseStream: () => void
  resumeStream: () => void
  resolveSharedTarget: (eventId: string, shareId?: string) => Promise<boolean>
  clearSharedTarget: () => void
  enterSearch: () => void
  exitSearch: () => void
  executeSearch: (query: string) => void
}

const FootyStreamContext = createContext<FootyContextValue | null>(null)

export function FootyStreamProvider({ children }: { children: ReactNode }) {
  const { getToday, mode, getDateForTimestamp } = useTimezone()

  const [state, setState] = useState<FootyState>(() => ({
    currentDate: '',
    dateIntent: 'live',
    availableDates: [],
    fixtures: [],
    sharedTarget: null,
    sharedTargetStatus: 'idle',
    isConnected: false,
    isBackendOnline: false,
    isLoading: true,
    isChangingDate: false,
    error: null,
    lastUpdate: null,
    parentRecoveries: [],
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
  const journal = useRef(createFootyLiveJournal()).current
  const diagnostics = useRef(createFootyDiagnostics(entry => console.debug('[FootyLive]', entry))).current
  const parentRequests = useRef(new Map<number, AbortController>())
  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconcileRef = useRef<(reason: string) => Promise<void>>(async () => {})
  const requestResync = useCallback((reason: string) => {
    if (resyncTimer.current) return
    resyncTimer.current = setTimeout(() => {
      resyncTimer.current = null
      void reconcileRef.current(reason)
    }, 250)
  }, [])
  const targetAbortRef = useRef<AbortController | null>(null)
  const targetGenerationRef = useRef(0)
  const targetRequestRef = useRef<{ eventId: string; shareId?: string } | null>(null)

  useEffect(() => { currentDateRef.current = state.currentDate }, [state.currentDate])
  useEffect(() => { dateIntentRef.current = state.dateIntent }, [state.dateIntent])

  const fixtureDates = useCallback((fixtures: readonly Fixture[]) => (
    [...new Set(fixtures.map(fixture => getDateForTimestamp(fixture.fixture.date)))].sort().reverse()
  ), [getDateForTimestamp])

  const applyLiveEvent = useCallback((event: FootyLiveEvent) => {
    const revision = journal.record(event)

    setState(current => {
      const fixtures = applyFootyLiveEvent(current.fixtures, event)
      const target = current.sharedTarget
      const updatedTarget = target ? applyFootyLiveEvent([target.fixture], event)
        .find(fixture => fixture._id === target.fixture._id) : undefined
      const missingParent = event.type === 'event_update' &&
        !fixtures.some(fixture => fixture._id === event.fixture_id) && target?.fixture._id !== event.fixture_id
      let parentRecoveries = current.parentRecoveries.filter(({ fixtureId }) =>
        !fixtures.some(fixture => fixture._id === fixtureId) && target?.fixture._id !== fixtureId &&
        !(event.type === 'fixture_update' && event.fixture_ids.includes(fixtureId)))
      if (missingParent && !parentRecoveries.some(item => item.fixtureId === event.fixture_id)) {
        parentRecoveries = [...parentRecoveries, { fixtureId: event.fixture_id, after: revision - 1 }]
      }
      if (parentRecoveries.length > 16) {
        diagnostics.record({ stage: 'parent_recovery', outcome: 'overflow' })
        requestResync('parent-recovery-overflow')
      }
      const matched = event.type === 'fixture_status' ? event.fixtures.filter(projection =>
        current.fixtures.some(fixture => fixture._id === projection.fixture_id) || target?.fixture._id === projection.fixture_id).length : undefined
      diagnostics.record({ stage: 'client_apply', outcome: missingParent ? 'missing-parent' : matched === 0 ? 'ignored' : 'applied', count: matched,
        ...(event.type === 'event_update' ? { event_id: event.event_id, fixture_id: event.fixture_id } : {}) })
      return {
        ...current,
        fixtures,
        sharedTarget: target && updatedTarget ? { ...target, fixture: updatedTarget } : target,
        searchResults: event.type !== 'event_update' ? current.searchResults : current.searchResults.map(group => ({ ...group,
          fixtures: group.fixtures.map(fixture => {
            const updated = applyFootyLiveEvent([fixture], event).find(item => item._id === fixture._id)
            return updated ? { ...updated, _search: fixture._search } : fixture
          }),
        })),
        parentRecoveries: parentRecoveries.slice(-16),
        availableDates: event.type === 'fixture_update' ? fixtureDates(fixtures) : current.availableDates,
        lastUpdate: new Date(),
      }
    })
  }, [fixtureDates, diagnostics, journal, requestResync])

  const fetchFixtureSnapshot = useCallback(async (isInitial = false) => {
    const generation = ++snapshotGenerationRef.current
    const startRevision = journal.revision()
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
      if (controller.signal.aborted || generation !== snapshotGenerationRef.current) {
        diagnostics.record({ stage: 'snapshot', outcome: 'ignored', reason: 'superseded' })
        return
      }

      const fixtures = journal.replay(orderFixturesForPresentation(body.fixtures), startRevision)
      if (!fixtures) throw new Error('live replay overflow')
      diagnostics.record({ stage: 'snapshot', outcome: 'applied', count: fixtures.length })
      setState(current => {
        const recoveries = new Map(current.parentRecoveries.map(item => [item.fixtureId, item]))
        for (const fixtureId of journal.missingParents(fixtures, startRevision)) {
          if (!recoveries.has(fixtureId)) recoveries.set(fixtureId, { fixtureId, after: startRevision })
        }
        return {
          ...current,
          fixtures,
          availableDates: fixtureDates(fixtures),
          parentRecoveries: [...recoveries.values()].filter(({ fixtureId }) =>
            !fixtures.some(fixture => fixture._id === fixtureId) && current.sharedTarget?.fixture._id !== fixtureId).slice(-16),
          isLoading: false,
          isChangingDate: false,
          isBackendOnline: true,
          lastUpdate: new Date(),
          error: null,
        }
      })
    } catch (error) {
      if ((!timedOut && controller.signal.aborted) || generation !== snapshotGenerationRef.current) return
      console.error('[FootyStream] Failed to fetch fixture snapshot:', error)
      diagnostics.record({ stage: 'snapshot', outcome: 'failed' })
      if (error instanceof Error && error.message === 'live replay overflow') requestResync('snapshot-replay-overflow')
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
  }, [fixtureDates, diagnostics, journal, requestResync])

  useEffect(() => {
    for (const [fixtureId, controller] of parentRequests.current) {
      if (!state.parentRecoveries.some(item => item.fixtureId === fixtureId)) {
        parentRequests.current.delete(fixtureId)
        controller.abort()
      }
    }
    for (const { fixtureId, after } of state.parentRecoveries) {
      if (parentRequests.current.has(fixtureId)) continue
      const controller = new AbortController()
      parentRequests.current.set(fixtureId, controller)
      const timeout = setTimeout(() => controller.abort(), 15_000)
      diagnostics.record({ stage: 'parent_recovery', outcome: 'started', fixture_id: fixtureId })
      void recoverFootyParent(fixtureId, async () => {
        const response = await fetch(`${API_BASE}/fixtures?ids=${fixtureId}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`parent recovery returned ${response.status}`)
        return response.json()
      }, journal, after).then(fixture => {
        if (parentRequests.current.get(fixtureId) !== controller) {
          diagnostics.record({ stage: 'parent_recovery', outcome: 'ignored', fixture_id: fixtureId, reason: 'superseded' })
          return
        }
        if (controller.signal.aborted) throw new Error('parent recovery timeout')
        setState(current => {
          // A newer targeted fixture update or snapshot may already have
          // supplied the parent. Never replace that state with a late read.
          const exists = current.fixtures.some(item => item._id === fixtureId) || current.sharedTarget?.fixture._id === fixtureId
          const fixtures = fixture && !exists
            ? orderFixturesForPresentation([...current.fixtures, fixture]) : current.fixtures
          diagnostics.record({ stage: 'parent_recovery', outcome: !fixture || exists ? 'ignored' : 'applied', fixture_id: fixtureId })
          return { ...current, fixtures, availableDates: fixtureDates(fixtures),
            parentRecoveries: current.parentRecoveries.filter(item => item.fixtureId !== fixtureId) }
        })
      }).catch(() => {
        if (parentRequests.current.get(fixtureId) !== controller) return
        diagnostics.record({ stage: 'parent_recovery', outcome: 'failed', fixture_id: fixtureId })
        setState(current => ({ ...current, parentRecoveries: current.parentRecoveries.filter(item => item.fixtureId !== fixtureId) }))
        requestResync('parent-recovery-failed')
      }).finally(() => {
        clearTimeout(timeout)
        if (parentRequests.current.get(fixtureId) === controller) parentRequests.current.delete(fixtureId)
      })
    }
  }, [state.parentRecoveries, diagnostics, fixtureDates, journal, requestResync])

  const clearSharedTarget = useCallback(() => {
    targetGenerationRef.current++
    targetAbortRef.current?.abort()
    targetAbortRef.current = null
    targetRequestRef.current = null
    setState(current => ({
      ...current,
      sharedTarget: null,
      sharedTargetStatus: 'idle',
    }))
  }, [])

  const resolveSharedTarget = useCallback(async (
    eventId: string,
    shareId?: string,
    announceLoading = true,
  ): Promise<boolean> => {
    const request = { eventId, shareId }
    targetRequestRef.current = request
    const generation = ++targetGenerationRef.current
    const startRevision = journal.revision()
    targetAbortRef.current?.abort()
    const controller = new AbortController()
    targetAbortRef.current = controller
    if (announceLoading) {
      setState(current => ({ ...current, sharedTargetStatus: 'loading' }))
    }

    try {
      const query = shareId ? `?share_id=${encodeURIComponent(shareId)}` : ''
      const response = await fetch(`${API_BASE}/event/${encodeURIComponent(eventId)}${query}`, {
        signal: controller.signal,
      })
      if (controller.signal.aborted || generation !== targetGenerationRef.current) return false
      if (response.status === 400 || response.status === 404) {
        setState(current => ({
          ...current,
          sharedTarget: null,
          sharedTargetStatus: 'not-found',
          isBackendOnline: true,
        }))
        return false
      }
      if (!response.ok) throw new Error(`shared target returned ${response.status}`)
      const body: unknown = await response.json()
      if (!isSharedEventTargetResponse(body) || !body.found) {
        throw new Error('shared target did not match the portal contract')
      }
      if (controller.signal.aborted || generation !== targetGenerationRef.current) return false

      const replayed = journal.replay([body.fixture], startRevision)
      const targetFixture = replayed?.find(fixture => fixture._id === body.fixture._id)
      if (!targetFixture) {
        diagnostics.record({ stage: 'shared_target', outcome: 'ignored', reason: 'live-replay-conflict' })
        requestResync('shared-target-replay-conflict')
        throw new Error('shared target needs resynchronization')
      }
      const targetDate = getDateForTimestamp(targetFixture.fixture.date)
      currentDateRef.current = targetDate
      dateIntentRef.current = 'pinned'
      setState(current => ({
        ...current,
        currentDate: targetDate,
        dateIntent: 'pinned',
        sharedTarget: { ...body, fixture: targetFixture },
        sharedTargetStatus: 'ready',
        isChangingDate: false,
        isBackendOnline: true,
        error: null,
      }))
      return true
    } catch (error) {
      if (controller.signal.aborted || generation !== targetGenerationRef.current) return false
      console.error('[FootyStream] Failed to resolve shared target:', error)
      setState(current => {
        const hasCurrentTarget = current.sharedTarget?.eventId === eventId
        return {
          ...current,
          // Reconnect recovery is revalidation, not replacement. Keep a
          // previously committed projection visible through a transient
          // upstream failure; an authoritative 404 still clears it above.
          sharedTarget: hasCurrentTarget ? current.sharedTarget : null,
          sharedTargetStatus: hasCurrentTarget ? 'ready' : 'error',
          error: 'Failed to resolve shared event',
        }
      })
      return false
    }
  }, [getDateForTimestamp, journal, diagnostics, requestResync])

  const reconcile = useCallback(async (reason: string) => {
    const targetRequest = targetRequestRef.current
    if (!targetRequest) {
      const recoveredDate = resolveRecoveryDate(dateIntentRef.current, currentDateRef.current, getToday())
      if (currentDateRef.current !== recoveredDate) {
        currentDateRef.current = recoveredDate
        setState(current => ({ ...current, currentDate: recoveredDate }))
      }
    }
    console.log(`[FootyStream] Reconciling fixture snapshot (${reason})`)
    await fetchFixtureSnapshot(false)
    if (targetRequestRef.current === targetRequest && targetRequest) {
      await resolveSharedTarget(targetRequest.eventId, targetRequest.shareId, false)
    }
  }, [fetchFixtureSnapshot, getToday, resolveSharedTarget])
  reconcileRef.current = reconcile

  const connectSSE = useCallback(() => {
    if (
      (dateIntentRef.current !== 'live' && !targetRequestRef.current) ||
      isPausedRef.current ||
      document.visibilityState === 'hidden'
    ) return

    if (eventSourceRef.current) eventSourceRef.current.close()
    const eventSource = new EventSource(`${API_BASE}/stream`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      reconnectAttempts.current = 0
      setState(current => ({ ...current, isConnected: true, isBackendOnline: true, error: null }))
    }

    eventSource.onmessage = message => {
      if (eventSourceRef.current !== eventSource || (dateIntentRef.current !== 'live' && !targetRequestRef.current)) {
        diagnostics.record({ stage: 'client_receipt', outcome: 'ignored', reason: 'inactive-stream' })
        return
      }
      try {
        const event: unknown = JSON.parse(message.data)
        if (!event || typeof event !== 'object') throw new Error('invalid SSE body')
        const type = (event as { type?: unknown }).type

        if (type === 'connected') {
          // Registration happens before this marker is written. Snapshot now
          // to close the initial/reconnect gap, then replay any concurrent SSE.
          void reconcile('sse-connected')
        } else if (type === 'resync') {
          void reconcile(String((event as { reason?: unknown }).reason || 'stream-resync'))
        } else if (isFootyLiveEvent(event)) {
          diagnostics.record({ stage: 'client_receipt', outcome: 'received',
            ...(event.type === 'event_update' ? { event_id: event.event_id, fixture_id: event.fixture_id } : {}) })
          applyLiveEvent(event)
        } else if (type === 'health') {
          const overall = (event as { health?: { overall?: unknown } }).health?.overall
          setState(current => ({ ...current, isBackendOnline: overall !== 'unhealthy' }))
        } else if (type === 'error') {
          const message = (event as { message?: unknown }).message
          setState(current => ({ ...current, error: String(message || 'Stream error') }))
        } else if (type !== 'heartbeat') {
          diagnostics.record({ stage: 'client_receipt', outcome: 'ignored', reason: 'unknown-or-invalid-message' })
          requestResync('unknown-or-invalid-message')
        }
      } catch (error) {
        diagnostics.record({ stage: 'client_receipt', outcome: 'failed', reason: 'parse-or-apply' })
        requestResync('invalid-live-message')
      }
    }

    eventSource.onerror = () => {
      if (eventSourceRef.current !== eventSource) return
      setState(current => ({ ...current, isConnected: false }))
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      if (
        isPausedRef.current ||
        (dateIntentRef.current !== 'live' && !targetRequestRef.current) ||
        document.visibilityState === 'hidden'
      ) return

      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
      reconnectAttempts.current++
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay)
    }
  }, [applyLiveEvent, reconcile, diagnostics, requestResync])

  const disconnectSSE = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    reconnectTimeoutRef.current = null
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setState(current => ({ ...current, isConnected: false }))
  }, [])

  const setDate = useCallback((date: string) => {
    for (const controller of parentRequests.current.values()) controller.abort()
    parentRequests.current.clear()
    clearSharedTarget()
    const intent = dateIntentForSelection(date, getToday())
    dateIntentRef.current = intent
    currentDateRef.current = date
    setState(current => ({ ...current, currentDate: date, dateIntent: intent, isChangingDate: true, parentRecoveries: [] }))
    void fetchFixtureSnapshot(false)
  }, [clearSharedTarget, fetchFixtureSnapshot, getToday])

  useEffect(() => {
    const targetActive = state.sharedTargetStatus !== 'idle'
    if ((state.dateIntent === 'live' || targetActive) && !state.isChangingDate && !state.isLoading) connectSSE()
    else if (state.dateIntent === 'pinned') disconnectSSE()
  }, [state.dateIntent, state.sharedTargetStatus, state.isChangingDate, state.isLoading, connectSSE, disconnectSSE])

  const today = getToday()
  const navigableDates = useMemo(() => {
    const past = state.availableDates.filter(date => date < today)
    const firstFuture = [...state.availableDates].filter(date => date > today).sort()[0]
    const dates = new Set<string>([...past, today])
    if (firstFuture) dates.add(firstFuture)
    return [...dates].sort().reverse()
  }, [state.availableDates, today])

  const pauseStream = useCallback(() => {
    if (isPausedRef.current) return
    isPausedRef.current = true
    disconnectSSE()
  }, [disconnectSSE])

  const resumeStream = useCallback(() => {
    if (!isPausedRef.current) return
    isPausedRef.current = false
    void reconcile('deliberate-resume')
    if (dateIntentRef.current === 'live' || targetRequestRef.current) connectSSE()
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
    for (const controller of parentRequests.current.values()) controller.abort()
    parentRequests.current.clear()
    if (resyncTimer.current) clearTimeout(resyncTimer.current)
    snapshotAbortRef.current?.abort()
    targetAbortRef.current?.abort()
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

  const renderedFixtures = useMemo(
    () => mergeSharedTargetFixture(state.fixtures, state.sharedTarget),
    [state.fixtures, state.sharedTarget],
  )

  const contextValue: FootyContextValue = {
    ...state,
    getLiveDiagnostics: diagnostics.snapshot,
    fixtures: renderedFixtures,
    navigableDates,
    setDate,
    pauseStream,
    resumeStream,
    resolveSharedTarget,
    clearSharedTarget,
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
