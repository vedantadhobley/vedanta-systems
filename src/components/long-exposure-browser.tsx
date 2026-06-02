import { useState, useEffect, useMemo, useRef } from 'react'
import {
  RiExpandUpDownLine,
  RiExpandUpDownFill,
  RiContractUpDownLine,
  RiContractUpDownFill,
} from '@remixicon/react'
import type {
  LongExposureDateRow,
  LongExposureDay,
  LongExposureNarrative,
  LongExposureSynthesis,
  LongExposureAggregate,
} from '@/types/long-exposure'
import { cn } from '@/lib/utils'

/**
 * Long Exposure browser.
 *
 * Renders one trading day (or week) in journalist-format from top to bottom:
 *   1. DateNavigator: prev/next + date picker + Day|Week toggle
 *   2. Executive summary (5 deterministic bullets, no LLM)
 *   3. Today's themes prose (the SYNTHESIZE / AGGREGATE paragraph)
 *   4. Notable extremes
 *   5. Per-scorer event groups (day) OR per-day breakdown (week)
 *
 * Each event card has a one-line preview + DESCRIBE prose; click expands
 * to show INTERPRET surrounding-context + "show source data" toggle for
 * the breakdown JSON (the verifier-moat transparency layer).
 *
 * Date navigation: prev/next walk within the available trading-date list
 * fetched from /api/long-exposure/dates. The date itself is clickable —
 * opens a popover listing every available date. Week toggle switches to
 * the AGGREGATE view for the week containing the current date.
 */

type Mode = 'day' | 'week'

const SCORER_LABELS: Record<string, string> = {
  halt: 'Trading halts',
  large_trade: 'Large block trades',
  sweep: 'Multi-level sweeps',
  iceberg: 'Iceberg executions',
  layering: 'Layering',
  post_cancel_cluster: 'Rapid quote-cycling',
  liquidity_withdrawal: 'Liquidity withdrawals',
  volume_deviation: 'Volume surges',
  time_in_book_drift: 'Order-lifetime drift',
}

const SCORER_ORDER = [
  'halt',
  'large_trade',
  'volume_deviation',
  'time_in_book_drift',
  'sweep',
  'iceberg',
  'liquidity_withdrawal',
  'layering',
  'post_cancel_cluster',
]

export function LongExposureBrowser() {
  const [mode, setMode] = useState<Mode>('day')
  const [currentDate, setCurrentDate] = useState<string | null>(null)
  const [dates, setDates] = useState<LongExposureDateRow[]>([])
  const [datesLoading, setDatesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch the list of all available dates once on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/long-exposure/dates').then((r) => {
        if (!r.ok) throw new Error(`dates HTTP ${r.status}`)
        return r.json() as Promise<{ dates: LongExposureDateRow[] } | LongExposureDateRow[]>
      }),
      fetch('/api/long-exposure/latest').then((r) => {
        if (!r.ok) throw new Error(`latest HTTP ${r.status}`)
        return r.json() as Promise<{ date: string | null }>
      }),
    ])
      .then(([dateListRaw, latest]) => {
        if (cancelled) return
        // API returns either { dates: [...] } (current shape) or a bare array
        // (defensive — earlier scaffold assumed bare); handle both.
        const dateList: LongExposureDateRow[] = Array.isArray(dateListRaw)
          ? dateListRaw
          : (dateListRaw?.dates ?? [])
        // Newest first (matches typical date-list UX expectation).
        const sorted = [...dateList].sort((a, b) => b.date.localeCompare(a.date))
        setDates(sorted)
        setCurrentDate(latest.date)
        setDatesLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setDatesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (datesLoading) {
    return <div className="text-corpo-text/50 text-sm">Loading Long Exposure…</div>
  }
  if (error) {
    return <div className="text-red-400 text-sm">Long Exposure error: {error}</div>
  }
  if (!currentDate) {
    return <div className="text-corpo-text/50 text-sm">No narrated dates available yet.</div>
  }

  return (
    <div className="space-y-8">
      <DateNavigator
        mode={mode}
        currentDate={currentDate}
        dates={dates}
        onModeChange={setMode}
        onDateChange={setCurrentDate}
      />
      {mode === 'day' ? (
        <DayView date={currentDate} />
      ) : (
        <WeekView date={currentDate} />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// DateNavigator
// ──────────────────────────────────────────────────────────────────────────

function DateNavigator({
  mode,
  currentDate,
  dates,
  onModeChange,
  onDateChange,
}: {
  mode: Mode
  currentDate: string
  dates: LongExposureDateRow[]
  onModeChange: (m: Mode) => void
  onDateChange: (d: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape. Trigger button is excluded — its own
  // onClick toggles pickerOpen, so we'd otherwise fight the toggle.
  useEffect(() => {
    if (!pickerOpen) return
    function handlePointer(e: PointerEvent) {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setPickerOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [pickerOpen])

  // Build navigation: in 'day' mode, walk dates list directly.
  // In 'week' mode, walk by week (jump to the prior/next Monday).
  const { prev, next } = useMemo(() => {
    if (mode === 'day') {
      // Dates sorted newest-first. Find current index.
      const idx = dates.findIndex((d) => d.date === currentDate)
      // "Prev" (older) = next index. "Next" (newer) = previous index.
      const prev = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1].date : null
      const next = idx > 0 ? dates[idx - 1].date : null
      return { prev, next }
    }
    // Week mode: jump by 7 days. Don't validate against available dates here;
    // the week endpoint will 404 if no aggregate exists, and DayView will
    // surface that gracefully.
    return {
      prev: addDays(currentDate, -7),
      next: addDays(currentDate, +7),
    }
  }, [mode, currentDate, dates])

  return (
    <div className="space-y-3">
      {/* Top row: brand + view toggle */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs uppercase tracking-widest text-corpo-text/40">
          Long Exposure
        </div>
        <ViewToggle mode={mode} onChange={onModeChange} />
      </div>

      {/* Second row: prev / date / next */}
      <div className="flex items-center gap-3">
        <NavButton
          direction="prev"
          disabled={!prev}
          onClick={() => prev && onDateChange(prev)}
        />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setPickerOpen(!pickerOpen)}
          onTouchStart={() => {}}
          className="text-xl font-medium text-corpo-text hover:text-corpo-light active:text-lavender transition-none text-left"
        >
          {mode === 'day' ? formatDate(currentDate) : formatWeekRange(currentDate)}
        </button>
        <NavButton
          direction="next"
          disabled={!next}
          onClick={() => next && onDateChange(next)}
        />
      </div>

      {/* Picker popover */}
      {pickerOpen && (
        <DatePicker
          mode={mode}
          dates={dates}
          currentDate={currentDate}
          popoverRef={popoverRef}
          onPick={(d) => {
            onDateChange(d)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onTouchStart={() => {}}
      disabled={disabled}
      aria-label={direction === 'prev' ? 'Previous' : 'Next'}
      className={cn(
        'w-7 h-7 flex items-center justify-center text-sm font-mono transition-none',
        disabled
          ? 'text-corpo-text/15 cursor-default'
          : 'text-corpo-text/50 hover:text-corpo-light active:text-lavender hover:bg-corpo-text/5',
      )}
    >
      {direction === 'prev' ? '◀' : '▶'}
    </button>
  )
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (m: Mode) => void
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs uppercase tracking-widest">
      <button
        type="button"
        onClick={() => onChange('day')}
        onTouchStart={() => {}}
        className={cn(
          'transition-none',
          mode === 'day'
            ? 'text-corpo-text'
            : 'text-corpo-text/30 hover:text-corpo-light active:text-lavender',
        )}
      >
        Day
      </button>
      <span className="text-corpo-text/20">|</span>
      <button
        type="button"
        onClick={() => onChange('week')}
        onTouchStart={() => {}}
        className={cn(
          'transition-none',
          mode === 'week'
            ? 'text-corpo-text'
            : 'text-corpo-text/30 hover:text-corpo-light active:text-lavender',
        )}
      >
        Week
      </button>
    </div>
  )
}

function DatePicker({
  mode,
  dates,
  currentDate,
  popoverRef,
  onPick,
  onClose,
}: {
  mode: Mode
  dates: LongExposureDateRow[]
  currentDate: string
  popoverRef: React.RefObject<HTMLDivElement>
  onPick: (date: string) => void
  onClose: () => void
}) {
  return (
    <div className="relative">
      <div
        ref={popoverRef}
        className="absolute z-10 top-0 left-0 mt-1 w-80 max-h-96 overflow-y-auto bg-corpo-dark border border-corpo-border/40 shadow-lg p-2 space-y-0.5"
        role="dialog"
        aria-label="Date picker"
      >
        <div className="flex justify-between items-center px-2 py-1 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-corpo-text/40">
            {mode === 'day' ? `${dates.length} dates` : 'Pick a week'}
          </span>
          <button
            type="button"
            onClick={onClose}
            onTouchStart={() => {}}
            className="text-corpo-text/40 hover:text-corpo-light active:text-lavender transition-none text-xs"
          >
            ✕
          </button>
        </div>
        {dates.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onPick(d.date)}
            onTouchStart={() => {}}
            className={cn(
              'w-full px-2 py-1.5 text-left text-sm flex items-baseline justify-between gap-3 transition-none hover:bg-corpo-text/5 active:text-lavender',
              d.date === currentDate && 'bg-corpo-text/10',
            )}
          >
            <span className="font-mono">{formatDate(d.date)}</span>
            <span className="text-corpo-text/40 text-xs">
              {d.verified_count} events
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// DayView (the main per-day page)
// ──────────────────────────────────────────────────────────────────────────

function DayView({ date }: { date: string }) {
  const [day, setDay] = useState<LongExposureDay | null>(null)
  const [synth, setSynth] = useState<LongExposureSynthesis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Accordion: only one scorer group and one event card open at a time.
  // Parent-owned so opening a new one closes the previous (matches the
  // found-footy-browser pattern).
  const [expandedScorer, setExpandedScorer] = useState<string | null>(null)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    // Reset accordion when navigating to a new date.
    setExpandedScorer(null)
    setExpandedEventId(null)
    Promise.all([
      fetch(`/api/long-exposure/day/${date}`).then((r) => {
        if (!r.ok) throw new Error(`day HTTP ${r.status}`)
        return r.json() as Promise<LongExposureDay>
      }),
      fetch(`/api/long-exposure/synthesis/${date}`)
        .then((r) => (r.ok ? (r.json() as Promise<LongExposureSynthesis>) : null))
        .catch(() => null),
    ])
      .then(([dayData, synthData]) => {
        if (cancelled) return
        setDay(dayData)
        setSynth(synthData)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date])

  if (loading) return <div className="text-corpo-text/50 text-sm">Loading…</div>
  if (error) return <div className="text-red-400 text-sm">{error}</div>
  if (!day) return <div className="text-corpo-text/50 text-sm">No data.</div>

  const dt = synth?.data_table ?? null
  const orderedScorers = SCORER_ORDER.filter((s) => day.groups[s]?.length)

  return (
    <div className="space-y-8">
      <p className="text-xs text-corpo-text/50 -mt-4">
        {day.total} narrated events from IEX, every figure verified against
        source data
      </p>

      <DayTimelineStrip day={day} />

      {/* Deterministic facts: exec summary + notable extremes both live here,
          stacked, before any LLM prose. Reader sees what's verifiable first. */}
      {dt?.executive_summary && dt.executive_summary.length > 0 && (
        <section>
          <SectionHeader>Executive summary</SectionHeader>
          <ul className="space-y-1.5 text-sm text-corpo-text/90">
            {dt.executive_summary.map((bullet, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-corpo-text/30 mt-0.5">▪</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dt?.notable_extremes && Object.keys(dt.notable_extremes).length > 0 && (
        <section>
          <SectionHeader>Notable extremes</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {orderedExtremes(dt.notable_extremes).map(([key, ex]) => (
              <ExtremeRow key={key} label={extremeLabel(key)} extreme={ex} />
            ))}
          </div>
        </section>
      )}

      {/* LLM-generated prose below the deterministic pane. */}
      {synth?.prose && (
        <section>
          <SectionHeader>Today</SectionHeader>
          <p className="text-sm text-corpo-text/90 leading-relaxed">{synth.prose}</p>
        </section>
      )}

      <section className="space-y-6">
        <SectionHeader>By event type</SectionHeader>
        {orderedScorers.map((scorer) => (
          <ScorerGroup
            key={scorer}
            scorer={scorer}
            events={day.groups[scorer]}
            isExpanded={expandedScorer === scorer}
            expandedEventId={expandedEventId}
            onToggle={() =>
              setExpandedScorer((s) => (s === scorer ? null : scorer))
            }
            onToggleEvent={(id) =>
              setExpandedEventId((e) => (e === id ? null : id))
            }
          />
        ))}
      </section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// WeekView (mirror of day view at week resolution)
// ──────────────────────────────────────────────────────────────────────────

function WeekView({ date }: { date: string }) {
  // The aggregate endpoint expects the ISO Monday of the week.
  const weekStart = useMemo(() => mondayOf(date), [date])
  const [agg, setAgg] = useState<LongExposureAggregate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/long-exposure/aggregate/${weekStart}`)
      .then((r) => {
        if (r.status === 404) return null
        if (!r.ok) throw new Error(`aggregate HTTP ${r.status}`)
        return r.json() as Promise<LongExposureAggregate>
      })
      .then((data) => {
        if (cancelled) return
        setAgg(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekStart])

  if (loading) return <div className="text-corpo-text/50 text-sm">Loading…</div>
  if (error) return <div className="text-red-400 text-sm">{error}</div>
  if (!agg || !agg.week_start) {
    return (
      <div className="text-corpo-text/50 text-sm">
        No weekly aggregate for the week of {weekStart}.
      </div>
    )
  }

  const dt = agg.data_table ?? null

  return (
    <div className="space-y-8">
      <p className="text-xs text-corpo-text/50 -mt-4">
        Week of {agg.week_start} → {agg.week_end} · {agg.days_considered ?? '—'}{' '}
        trading days
      </p>

      {dt?.executive_summary && dt.executive_summary.length > 0 && (
        <section>
          <SectionHeader>Executive summary</SectionHeader>
          <ul className="space-y-1.5 text-sm text-corpo-text/90">
            {dt.executive_summary.map((bullet, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-corpo-text/30 mt-0.5">▪</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {agg.prose && (
        <section>
          <SectionHeader>This week</SectionHeader>
          <p className="text-sm text-corpo-text/90 leading-relaxed">{agg.prose}</p>
        </section>
      )}

      {dt?.notable_extremes && Object.keys(dt.notable_extremes).length > 0 && (
        <section>
          <SectionHeader>Notable extremes</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {orderedExtremes(dt.notable_extremes).map(([key, ex]) => (
              <ExtremeRow
                key={key}
                label={extremeLabel(key)}
                extreme={ex}
                showDate
              />
            ))}
          </div>
        </section>
      )}

      {dt?.per_day && dt.per_day.length > 0 && (
        <section>
          <SectionHeader>Per day</SectionHeader>
          <div className="space-y-1">
            {dt.per_day.map((d) => (
              <div
                key={d.date}
                className="flex items-baseline justify-between gap-3 text-sm py-1 border-b border-corpo-border/10 last:border-b-0"
              >
                <span className="font-mono text-corpo-text/80">
                  {shortDate(d.date)}
                </span>
                <span className="text-corpo-text/60 flex-1">
                  {SCORER_LABELS[d.dominant_scorer] ?? d.dominant_scorer}
                  {d.notable_symbol && (
                    <span className="text-corpo-text/40 ml-2 font-mono text-xs">
                      · {d.notable_symbol}
                    </span>
                  )}
                </span>
                <span className="text-corpo-text/60 font-mono tabular-nums">
                  {d.total}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {dt?.top_symbols && dt.top_symbols.length > 0 && (
        <section>
          <SectionHeader>Top symbols this week</SectionHeader>
          <div className="space-y-1">
            {dt.top_symbols.slice(0, 8).map((s) => (
              <div
                key={s.symbol}
                className="flex items-baseline justify-between gap-3 text-sm py-1 border-b border-corpo-border/10 last:border-b-0"
              >
                <span className="font-mono text-corpo-text/80">{s.symbol}</span>
                <span className="text-corpo-text/40 text-xs flex-1">
                  in {s.days_present} {s.days_present === 1 ? 'session' : 'sessions'}
                </span>
                <span className="text-corpo-text/60 font-mono tabular-nums">
                  {s.total_events}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// DayTimelineStrip — the "long exposure photograph" visual signature.
//
// Renders the trading day (09:30 → 16:00 ET) as a horizontal density strip,
// with each event placed as a colored vertical mark at its event_ts. Inter-
// day scorers (volume_deviation, time_in_book_drift) are excluded — they're
// day-level signals with no meaningful clock position.
//
// The metaphor: a long exposure photograph captures motion as a continuous
// arc. The day's events captured as a single visual: density (how much was
// happening when) + composition (which event types).
//
// Implementation: hand-rolled SVG (no chart library dependency). ~60 buckets
// at 6.5-hour day means ~6.5 min per bucket. Click a mark to scroll the
// corresponding scorer group into view.
// ──────────────────────────────────────────────────────────────────────────

const SCORER_COLORS: Record<string, string> = {
  halt: '#f87171',                    // red-400 — regulatory action, attention-grabbing
  large_trade: '#facc15',             // yellow-400 — highlight, "big block"
  liquidity_withdrawal: '#fb923c',    // orange-400 — depth pulled
  sweep: '#c084fc',                   // purple-400 — aggressive consumption
  iceberg: '#22d3ee',                 // cyan-400 — hidden, gradual reveal
  layering: '#60a5fa',                // blue-400 — multi-level
  post_cancel_cluster: '#7dd3fc',     // sky-300 — rapid cycling
  volume_deviation: '#f0abfc',        // fuchsia-300 — anomaly (intraday excluded but kept for legend)
  time_in_book_drift: '#a5b4fc',      // indigo-300 — regime shift (same)
}

const TIMELINE_SCORERS = [
  'halt',
  'large_trade',
  'liquidity_withdrawal',
  'sweep',
  'iceberg',
  'layering',
  'post_cancel_cluster',
]

const REGULAR_OPEN_MIN = 9 * 60 + 30   // 09:30 ET
const REGULAR_CLOSE_MIN = 16 * 60      // 16:00 ET
const TRADING_MINUTES = REGULAR_CLOSE_MIN - REGULAR_OPEN_MIN  // 390

function DayTimelineStrip({ day }: { day: LongExposureDay }) {
  const [hovered, setHovered] = useState<{
    minute: number
    bucket: { scorer_id: string; symbol: string; minute: number }[]
  } | null>(null)

  // Compute per-bucket per-scorer event lists
  const buckets = useMemo(() => {
    const m = new Map<
      number,
      { scorer_id: string; symbol: string; minute: number }[]
    >()
    for (const scorer of TIMELINE_SCORERS) {
      const events = day.groups[scorer]
      if (!events) continue
      for (const event of events) {
        const minute = etMinuteOfDay(event.event_ts)
        // Skip events outside regular trading hours (pre-market or after-hours)
        if (minute < REGULAR_OPEN_MIN || minute >= REGULAR_CLOSE_MIN) continue
        const bucketMin = Math.floor(minute)
        if (!m.has(bucketMin)) m.set(bucketMin, [])
        m.get(bucketMin)!.push({
          scorer_id: scorer,
          symbol: event.symbol,
          minute,
        })
      }
    }
    return m
  }, [day])

  // Tally counts per minute for column-height computation
  const maxStack = useMemo(() => {
    let max = 0
    for (const v of buckets.values()) if (v.length > max) max = v.length
    return Math.max(max, 1)
  }, [buckets])

  // SVG dimensions
  const W = 100   // viewBox width in percent-units (we'll scale to width 100%)
  const H = 32    // viewBox height
  const PAD_TOP = 2
  const PAD_BOTTOM = 6  // leaves room for axis labels

  const minuteToX = (minute: number): number => {
    const t = (minute - REGULAR_OPEN_MIN) / TRADING_MINUTES
    return t * W
  }

  // For each minute that has events, render a stacked bar
  const bars: Array<{
    x: number
    segments: Array<{ y: number; h: number; color: string; key: string }>
    minute: number
    events: { scorer_id: string; symbol: string; minute: number }[]
  }> = []

  const barWidth = W / TRADING_MINUTES * 1.8 // slightly wider than 1-minute slot
  const usableH = H - PAD_TOP - PAD_BOTTOM

  for (const [minute, events] of buckets.entries()) {
    // Aggregate events per scorer at this minute
    const perScorer: Record<string, number> = {}
    for (const e of events) {
      perScorer[e.scorer_id] = (perScorer[e.scorer_id] ?? 0) + 1
    }
    const x = minuteToX(minute) - barWidth / 2
    const totalCount = events.length
    const totalH = (totalCount / maxStack) * usableH
    let cursorY = H - PAD_BOTTOM - totalH
    const segments: Array<{ y: number; h: number; color: string; key: string }> = []
    for (const scorer of TIMELINE_SCORERS) {
      const n = perScorer[scorer]
      if (!n) continue
      const segH = (n / maxStack) * usableH
      segments.push({
        y: cursorY,
        h: segH,
        color: SCORER_COLORS[scorer],
        key: scorer,
      })
      cursorY += segH
    }
    bars.push({ x, segments, minute, events })
  }

  // Hour ticks at 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00
  const hourTicks: number[] = []
  for (let h = 10; h <= 16; h++) hourTicks.push(h * 60)
  // Also include 09:30 + 16:00 as start/end markers
  const openX = minuteToX(REGULAR_OPEN_MIN)
  const closeX = minuteToX(REGULAR_CLOSE_MIN)

  return (
    <section>
      <SectionHeader>The day</SectionHeader>
      <div className="space-y-2">
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full h-12"
            role="img"
            aria-label="Event density across the trading day"
          >
            {/* baseline */}
            <line
              x1={openX}
              y1={H - PAD_BOTTOM + 0.5}
              x2={closeX}
              y2={H - PAD_BOTTOM + 0.5}
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="0.15"
              className="text-corpo-text"
            />
            {/* hour ticks */}
            {hourTicks.map((min) => {
              const x = minuteToX(min)
              return (
                <line
                  key={min}
                  x1={x}
                  y1={H - PAD_BOTTOM + 0.5}
                  x2={x}
                  y2={H - PAD_BOTTOM + 1.5}
                  stroke="currentColor"
                  strokeOpacity="0.25"
                  strokeWidth="0.15"
                  className="text-corpo-text"
                />
              )
            })}
            {/* bars */}
            {bars.map((b, i) => (
              <g
                key={`${b.minute}-${i}`}
                onMouseEnter={() =>
                  setHovered({ minute: b.minute, bucket: b.events })
                }
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                {b.segments.map((seg) => (
                  <rect
                    key={`${b.minute}-${seg.key}`}
                    x={b.x}
                    y={seg.y}
                    width={barWidth}
                    height={seg.h}
                    fill={seg.color}
                    fillOpacity={hovered && hovered.minute === b.minute ? 1 : 0.85}
                  />
                ))}
              </g>
            ))}
          </svg>
          {/* Time labels */}
          <div className="flex justify-between mt-0.5 text-[10px] font-mono text-corpo-text/40 tabular-nums">
            <span>09:30</span>
            <span>11:00</span>
            <span>12:30</span>
            <span>14:00</span>
            <span>16:00</span>
          </div>
        </div>

        {/* Hovered minute readout */}
        {hovered && (
          <div className="text-xs text-corpo-text/70 font-mono">
            {minuteToET(hovered.minute)} —{' '}
            {hovered.bucket
              .slice(0, 4)
              .map((e) => `${e.symbol} ${SCORER_LABELS[e.scorer_id] ?? e.scorer_id}`)
              .join(' · ')}
            {hovered.bucket.length > 4 && (
              <span className="text-corpo-text/40">
                {' '}
                +{hovered.bucket.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-corpo-text/50">
          {TIMELINE_SCORERS.filter((s) => day.groups[s]?.length).map((scorer) => (
            <span key={scorer} className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2"
                style={{ backgroundColor: SCORER_COLORS[scorer] }}
              />
              <span>{SCORER_LABELS[scorer] ?? scorer}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Convert ISO UTC timestamp → minute-of-day in ET (handles DST via -4hr
 * EDT approximation; production should use Intl + America/New_York TZ). */
function etMinuteOfDay(iso: string): number {
  const dt = new Date(iso)
  const et = new Date(dt.getTime() - 4 * 60 * 60 * 1000)
  return et.getUTCHours() * 60 + et.getUTCMinutes()
}

function minuteToET(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ET`
}

// ──────────────────────────────────────────────────────────────────────────
// Shared sub-components + helpers
// ──────────────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-widest text-corpo-text/50 mb-2.5">
      {children}
    </h3>
  )
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatWeekRange(date: string): string {
  const start = mondayOf(date)
  const end = addDays(start, 4) // Mon..Fri
  const [sy, sm, sd] = start.split('-').map(Number)
  const [, em, ed] = end.split('-').map(Number)
  const startDate = new Date(sy, sm - 1, sd)
  const endDate = new Date(sy, em - 1, ed)
  const monthSame = sm === em
  if (monthSame) {
    return `Week of ${startDate.toLocaleDateString(undefined, { month: 'long' })} ${sd}–${ed}, ${sy}`
  }
  return `Week of ${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${sy}`
}

/** Return the ISO Monday for the week containing {@code iso}. */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = day === 0 ? -6 : 1 - day // Sunday → previous Monday
  date.setDate(date.getDate() + offset)
  return formatISODate(date)
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return formatISODate(date)
}

function formatISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const EXTREME_LABELS: Record<string, string> = {
  largest_notional_block: 'Largest block',
  largest_notional_sweep: 'Largest sweep',
  longest_halt: 'Longest halt',
  largest_pct_depth_removed: 'Deepest withdrawal',
  highest_volume_deviation: 'Volume surge',
  biggest_lifetime_drift: 'Order-lifetime shift',
  most_orders_in_layering: 'Most layered orders',
  most_orders_in_post_cancel: 'Most post-cancel orders',
  most_fills_iceberg: 'Most iceberg fills',
  deepest_sweep_levels: 'Deepest sweep',
}

function extremeLabel(key: string): string {
  return EXTREME_LABELS[key] ?? key.replace(/_/g, ' ')
}

function orderedExtremes(
  extremes: Record<string, any>,
): Array<[string, any]> {
  const order = Object.keys(EXTREME_LABELS)
  return order.filter((k) => extremes[k]).map((k) => [k, extremes[k]])
}

function ExtremeRow({
  label,
  extreme,
  showDate = false,
}: {
  label: string
  extreme: { symbol: string; value: string; unit: string; date?: string }
  showDate?: boolean
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-corpo-text/50 text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono text-corpo-text/90">{extreme.symbol}</span>
      <span className="text-corpo-text/90">{extreme.value}</span>
      {showDate && extreme.date && (
        <span className="text-corpo-text/40 text-xs font-mono">
          {shortDate(extreme.date)}
        </span>
      )}
      {extreme.unit && !['$ millions', 'duration'].includes(extreme.unit) && (
        <span className="text-corpo-text/40 text-xs">{extreme.unit}</span>
      )}
    </div>
  )
}

function ScorerGroup({
  scorer,
  events,
  isExpanded,
  expandedEventId,
  onToggle,
  onToggleEvent,
}: {
  scorer: string
  events: LongExposureNarrative[]
  isExpanded: boolean
  expandedEventId: string | null
  onToggle: () => void
  onToggleEvent: (id: string) => void
}) {
  const label = SCORER_LABELS[scorer] ?? scorer

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        onTouchStart={() => {}}
        className="group flex items-center gap-2 w-full text-left text-sm font-medium text-corpo-text hover:text-corpo-light active:text-lavender mb-2 transition-none"
      >
        {isExpanded ? (
          <>
            <RiContractUpDownLine className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiContractUpDownFill className="w-4 h-4 transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        ) : (
          <>
            <RiExpandUpDownLine className="w-4 h-4 transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiExpandUpDownFill className="w-4 h-4 transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        )}
        <span>{label}</span>
        <span className="text-corpo-text/40 text-xs">({events.length})</span>
      </button>
      {isExpanded && (
        <div className="ml-4 space-y-3 border-l border-corpo-text/10 pl-4">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isExpanded={expandedEventId === event.id}
              onToggle={() => onToggleEvent(event.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EventCard({
  event,
  isExpanded,
  onToggle,
}: {
  event: LongExposureNarrative
  isExpanded: boolean
  onToggle: () => void
}) {
  // Local third-level state: whether the "✓ Every figure traces…" panel is
  // expanded to show the raw breakdown JSON. Reset when the card collapses.
  const [showRaw, setShowRaw] = useState(false)
  useEffect(() => {
    if (!isExpanded) setShowRaw(false)
  }, [isExpanded])

  return (
    <article
      className={cn(
        'space-y-1.5',
        !event.verifier_passed && 'opacity-60'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        onTouchStart={() => {}}
        className="group flex items-baseline gap-3 text-xs text-corpo-text hover:text-corpo-light active:text-lavender transition-none text-left w-full"
      >
        {isExpanded ? (
          <>
            <RiContractUpDownLine className="w-3.5 h-3.5 self-center transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiContractUpDownFill className="w-3.5 h-3.5 self-center transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        ) : (
          <>
            <RiExpandUpDownLine className="w-3.5 h-3.5 self-center transition-none flex-shrink-0 text-corpo-text/50 group-hover:hidden group-active:hidden" />
            <RiExpandUpDownFill className="w-3.5 h-3.5 self-center transition-none flex-shrink-0 hidden group-hover:block group-hover:text-corpo-light group-active:block group-active:text-lavender" />
          </>
        )}
        <span className="font-mono uppercase tracking-wider">
          {event.symbol}
        </span>
        <span className="font-mono">{formatTime(event.event_ts)}</span>
        {!event.verifier_passed && (
          <span className="text-amber-400/60 uppercase tracking-wider text-[10px]">
            unverified
          </span>
        )}
      </button>
      <p className="text-sm text-corpo-text/90 leading-relaxed">{event.prose}</p>
      {isExpanded && (
        <>
          {event.interpretation && (
            <div className="mt-3 pl-3 border-l border-corpo-text/15">
              <div className="text-[10px] uppercase tracking-widest text-corpo-text/40 mb-1">
                Context
              </div>
              <p className="text-sm text-corpo-text/75 leading-relaxed">
                {event.interpretation}
              </p>
            </div>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowRaw(!showRaw)}
              onTouchStart={() => {}}
              className="group flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-corpo-text/60 hover:text-corpo-light active:text-lavender transition-none"
            >
              <span aria-hidden="true">✓</span>
              <span>Every figure traces to IEX data</span>
              {showRaw ? (
                <RiContractUpDownLine className="w-3 h-3 flex-shrink-0 text-corpo-text/40 group-hover:text-corpo-light group-active:text-lavender" />
              ) : (
                <RiExpandUpDownLine className="w-3 h-3 flex-shrink-0 text-corpo-text/40 group-hover:text-corpo-light group-active:text-lavender" />
              )}
            </button>
            {showRaw && (
              <pre className="mt-2 p-2 text-[11px] font-mono text-corpo-text/60 bg-corpo-dark/50 border border-corpo-border/30 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(event.breakdown, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </article>
  )
}

function formatTime(iso: string): string {
  const dt = new Date(iso)
  const et = new Date(dt.getTime() - 4 * 60 * 60 * 1000)
  const hh = String(et.getUTCHours()).padStart(2, '0')
  const mm = String(et.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} ET`
}
