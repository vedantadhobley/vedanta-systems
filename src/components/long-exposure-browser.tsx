import { useState, useEffect } from 'react'
import type { LongExposureDay, LongExposureNarrative } from '@/types/long-exposure'
import { cn } from '@/lib/utils'

/**
 * Minimal v1: list today's narrated events, grouped by scorer type.
 * Polished UX (timeline, drill-down panel, ticker filtering) is a
 * future enhancement.
 */

const SCORER_LABELS: Record<string, string> = {
  halt: 'Halts',
  large_trade: 'Large block trades',
  sweep: 'Sweeps',
  iceberg: 'Iceberg orders',
  layering: 'Layering events',
  post_cancel_cluster: 'Post-cancel clusters',
  liquidity_withdrawal: 'Liquidity withdrawals',
}

const SCORER_ORDER = [
  'halt',
  'large_trade',
  'sweep',
  'iceberg',
  'layering',
  'post_cancel_cluster',
  'liquidity_withdrawal',
]

export function LongExposureBrowser() {
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [day, setDay] = useState<LongExposureDay | null>(null)
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

  // Step 2: fetch that date's narratives
  useEffect(() => {
    if (!latestDate) return
    let cancelled = false
    fetch(`/api/long-exposure/day/${latestDate}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: LongExposureDay) => {
        if (cancelled) return
        setDay(data)
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
    return <div className="text-corpo-text/50 text-sm">Loading Long Exposure narratives…</div>
  }
  if (error) {
    return <div className="text-red-400 text-sm">Long Exposure error: {error}</div>
  }
  if (!day) {
    return <div className="text-corpo-text/50 text-sm">No data.</div>
  }

  // Render groups in our preferred order
  const orderedScorers = SCORER_ORDER.filter((s) => day.groups[s]?.length)

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-medium uppercase tracking-wider text-corpo-text">
          Long Exposure — {day.date}
        </h2>
        <p className="text-sm text-corpo-text/60">
          {day.total} narrated events from IEX activity on this trading day. Each event was
          detected by the parser + scorer pipeline, then narrated by a local LLM with
          mandatory grounding verification.
        </p>
      </header>

      {orderedScorers.map((scorer) => (
        <section key={scorer} className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wider text-corpo-text/70">
            {SCORER_LABELS[scorer] ?? scorer} ({day.groups[scorer].length})
          </h3>
          <div className="space-y-3">
            {day.groups[scorer].map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function EventCard({ event }: { event: LongExposureNarrative }) {
  return (
    <article
      className={cn(
        'border-l-2 border-corpo-text/20 pl-3 py-1',
        !event.verifier_passed && 'border-amber-400/40'
      )}
    >
      <div className="flex items-baseline gap-3 text-xs text-corpo-text/50 mb-1">
        <span className="font-mono uppercase tracking-wider">{event.symbol}</span>
        <span className="font-mono">{event.event_ts.slice(11, 19)} UTC</span>
        {!event.verifier_passed && (
          <span className="text-amber-400 uppercase tracking-wider">unverified</span>
        )}
      </div>
      <p className="text-sm text-corpo-text/90 leading-relaxed">{event.prose}</p>
    </article>
  )
}
