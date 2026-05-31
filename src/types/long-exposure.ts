/**
 * Long Exposure API response shapes.
 * Backed by `~/workspace/dev/vedanta-systems/src/server/routes/long-exposure.ts`,
 * which queries long-exposure's narratives + selected_events tables directly.
 */

export interface LongExposureHealth {
  status: 'ok' | 'degraded'
  postgres: 'up' | 'down'
  narratives_total: number
  dates_available: number
  timestamp: string
}

/** One row in `GET /dates`. */
export interface LongExposureDateRow {
  date: string                  // ISO YYYY-MM-DD
  narrative_count: number
  verified_count: number
}

/** One narrative in `GET /day/:date` (per scorer group). */
export interface LongExposureNarrative {
  id: string                    // event_hash hex
  scorer_id: string             // 'halt' | 'large_trade' | 'sweep' | 'iceberg' | 'layering' | 'post_cancel_cluster' | 'liquidity_withdrawal' | 'volume_deviation' | 'time_in_book_drift'
  symbol: string
  event_ts: string              // ISO timestamp UTC
  score: number
  prose: string                 // DESCRIBE rendered narration
  interpretation?: string | null // INTERPRET surrounding-context prose (nullable)
  blueprint: any                // extractor blueprint JSON (for drill-down)
  breakdown: any                // raw scored event breakdown (for drill-down)
  verifier_passed: boolean
  narration_rank: number | null
}

/** Response of `GET /day/:date`. */
export interface LongExposureDay {
  date: string
  total: number
  groups: Record<string, LongExposureNarrative[]>
}

/** Response of `GET /event/:id`. */
export interface LongExposureEventDetail extends LongExposureNarrative {
  trading_date: string
  verifier_notes: any
  model_id: string
  created_at: string
}

// ──────────────────────────────────────────────────────────────────────────
// data_table (the structured journalist view rendered ABOVE the prose).
// Computed pure-SQL inside the SynthesizeDay / AggregateWeek activities;
// no LLM cost. Schema is additive — fields may be omitted or null.
// ──────────────────────────────────────────────────────────────────────────

export interface LongExposureExtreme {
  symbol: string
  company_name?: string
  value: string
  unit: string
  scorer: string
  date?: string                 // weekly only
}

export interface LongExposureDailyDataTable {
  trading_date: string
  executive_summary: string[]   // 1-5 deterministic bullets
  headline: Array<{
    symbol: string
    scorer: string
    metric: string              // pre-formatted one-line headline
    time: string
  }>
  per_scorer_top: Record<string, any[]>  // scorer_id -> top-N rows with scorer-specific columns
  day_summary: {
    total_scored_events: number
    total_narrated_events: number
    by_scorer: Record<string, number>
    by_session_phase: Record<string, number>
    top_symbols: Array<{ symbol: string, events: number }>
    symbol_concentration_hhi?: number
    scorer_mix_entropy?: number
  }
  notable_extremes: Record<string, LongExposureExtreme>
  vs_prior_day?: {
    prior_date: string
    today_total_events: number
    prior_total_events: number
    total_events_pct_change: number
    today_dominant_scorer: string
    prior_dominant_scorer: string
    dominant_scorer_persisted: boolean
    top_symbol: string
    prior_top_symbol: string
    top_symbol_persisted: boolean
    top_symbol_persistence_count: number
    by_scorer_changes: Record<string, number>
  }
}

export interface LongExposureWeeklyDataTable {
  week_start: string
  week_end: string
  executive_summary: string[]
  headline_events: any[]
  per_day: Array<{
    date: string
    total: number
    dominant_scorer: string
    notable_symbol: string
  }>
  top_symbols: Array<{
    symbol: string
    total_events: number
    days_present: number
    scorer_mix: Record<string, number>
  }>
  scorer_mix: Record<string, number>
  notable_extremes: Record<string, LongExposureExtreme>
  vs_prior_week?: {
    prior_week_start: string
    prior_week_end: string
    today_total_events: number
    prior_total_events: number
    total_events_pct_change: number
    dominant_scorer: string
    prior_dominant_scorer: string
    dominant_scorer_persisted: boolean
    dominant_scorer_streak: number
    top_symbol: string
    prior_top_symbol: string
    top_symbol_persisted: boolean
    top_symbol_streak: number
    by_scorer_changes: Record<string, number>
  }
}

/** Response of `GET /synthesis/:date`. */
export interface LongExposureSynthesis {
  date: string
  prose: string                 // the SYNTHESIZE paragraph
  events_considered: number
  narrations_considered: number
  interpretations_considered: number
  day_aggregates: any
  data_table: LongExposureDailyDataTable | null
  verifier_passed: boolean
  created_at: string
}

/** Response of `GET /aggregate/:weekStart` or `/aggregate/latest`. */
export interface LongExposureAggregate {
  week_start: string | null
  week_end?: string
  prose?: string                // the AGGREGATE paragraph
  days_considered?: number
  week_aggregates?: any
  data_table?: LongExposureWeeklyDataTable | null
  verifier_passed?: boolean
  created_at?: string
}
