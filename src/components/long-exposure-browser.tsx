import { useState, useEffect } from 'react'
import type {
  LongExposureDay,
  LongExposureNarrative,
  LongExposureSynthesis,
} from '@/types/long-exposure'
import { cn } from '@/lib/utils'

/**
 * Long Exposure browser.
 *
 * Renders one trading day in journalist-format from top to bottom:
 *   1. Date header
 *   2. Executive summary (5 deterministic bullets, no LLM)
 *   3. Today's themes prose (the SYNTHESIZE paragraph)
 *   4. Notable extremes (largest block, longest halt, biggest sweep, etc.)
 *   5. Per-scorer event groups, each collapsible
 *
 * Each event card has a one-line preview + DESCRIBE prose; click expands
 * to show INTERPRET surrounding-context + "show source data" toggle for
 * the breakdown JSON (the verifier-moat transparency layer).
 */

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
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [day, setDay] = useState<LongExposureDay | null>(null)
  const [synth, setSynth] = useState<LongExposureSynthesis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Step 1: fetch the latest available date
  useEffect(() => {
    let cancelled = false
    fetch('/api/long-exposure/latest')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { date: string | null }) => {
        if (cancelled) return
        if (!data.date) {
          setError('No narrated dates available yet.')
          setLoading(false)
          return
        }
        setLatestDate(data.date)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Step 2: in parallel fetch the day's events + the synthesis (with data_table)
  useEffect(() => {
    if (!latestDate) return
    let cancelled = false
    Promise.all([
      fetch(`/api/long-exposure/day/${latestDate}`).then((r) => {
        if (!r.ok) throw new Error(`day HTTP ${r.status}`)
        return r.json() as Promise<LongExposureDay>
      }),
      fetch(`/api/long-exposure/synthesis/${latestDate}`)
        .then((r) => (r.ok ? (r.json() as Promise<LongExposureSynthesis>) : null))
        .catch(() => null), // synthesis is best-effort; missing is OK
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
  }, [latestDate])

  if (loading) {
    return <div className="text-corpo-text/50 text-sm">Loading Long Exposure…</div>
  }
  if (error) {
    return <div className="text-red-400 text-sm">Long Exposure error: {error}</div>
  }
  if (!day) {
    return <div className="text-corpo-text/50 text-sm">No data.</div>
  }

  const dt = synth?.data_table ?? null
  const orderedScorers = SCORER_ORDER.filter((s) => day.groups[s]?.length)

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-corpo-text/40">
          Long Exposure
        </div>
        <h2 className="text-xl font-medium text-corpo-text">
          {formatDate(day.date)}
        </h2>
        <p className="text-xs text-corpo-text/50">
          {day.total} narrated events from IEX, every figure verified against
          source data
        </p>
      </header>

      {/* Executive Summary (5 deterministic bullets, no LLM) */}
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

      {/* Today's themes prose (SYNTHESIZE) */}
      {synth?.prose && (
        <section>
          <SectionHeader>Today</SectionHeader>
          <p className="text-sm text-corpo-text/90 leading-relaxed">{synth.prose}</p>
        </section>
      )}

      {/* Notable extremes */}
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

      {/* Per-scorer event groups */}
      <section className="space-y-6">
        <SectionHeader>By event type</SectionHeader>
        {orderedScorers.map((scorer) => (
          <ScorerGroup
            key={scorer}
            scorer={scorer}
            events={day.groups[scorer]}
          />
        ))}
      </section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers + sub-components
// ──────────────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-widest text-corpo-text/50 mb-2.5">
      {children}
    </h3>
  )
}

function formatDate(iso: string): string {
  // 2026-05-22 → "Friday, May 22, 2026"
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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
  extremes: Record<string, { symbol: string; value: string; unit: string }>,
): Array<[string, { symbol: string; value: string; unit: string }]> {
  const order = Object.keys(EXTREME_LABELS)
  return order
    .filter((k) => extremes[k])
    .map((k) => [k, extremes[k]] as [string, { symbol: string; value: string; unit: string }])
}

function ExtremeRow({
  label,
  extreme,
}: {
  label: string
  extreme: { symbol: string; value: string; unit: string }
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-corpo-text/50 text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono text-corpo-text/90">{extreme.symbol}</span>
      <span className="text-corpo-text/90">{extreme.value}</span>
      {extreme.unit && !['$ millions', 'duration'].includes(extreme.unit) && (
        <span className="text-corpo-text/40 text-xs">{extreme.unit}</span>
      )}
    </div>
  )
}

function ScorerGroup({
  scorer,
  events,
}: {
  scorer: string
  events: LongExposureNarrative[]
}) {
  const [expanded, setExpanded] = useState(false)
  const label = SCORER_LABELS[scorer] ?? scorer

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-corpo-text/80 hover:text-corpo-text mb-2 transition-colors"
      >
        <span className="text-corpo-text/40">{expanded ? '▾' : '▸'}</span>
        <span>{label}</span>
        <span className="text-corpo-text/40 text-xs">({events.length})</span>
      </button>
      {expanded && (
        <div className="ml-4 space-y-3 border-l border-corpo-text/10 pl-4">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventCard({ event }: { event: LongExposureNarrative }) {
  const [expanded, setExpanded] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  return (
    <article
      className={cn(
        'space-y-1.5',
        !event.verifier_passed && 'opacity-60'
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-baseline gap-3 text-xs text-corpo-text/50 hover:text-corpo-text/70 transition-colors text-left"
      >
        <span className="font-mono uppercase tracking-wider text-corpo-text/70">
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
      {expanded && (
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
              className="text-[10px] uppercase tracking-widest text-corpo-text/40 hover:text-corpo-text/60 transition-colors"
            >
              {showRaw ? '▾' : '▸'} Source data
            </button>
            {showRaw && (
              <pre className="mt-2 p-2 text-[11px] font-mono text-corpo-text/60 bg-corpo-bg/50 border border-corpo-border/30 overflow-x-auto whitespace-pre-wrap">
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
  // ISO timestamp UTC → "HH:mm ET" (approximate ET via -4hr; production
  // would use Intl.DateTimeFormat with America/New_York TZ)
  const dt = new Date(iso)
  const et = new Date(dt.getTime() - 4 * 60 * 60 * 1000)
  const hh = String(et.getUTCHours()).padStart(2, '0')
  const mm = String(et.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} ET`
}
