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
  scorer_id: string             // 'halt' | 'large_trade' | 'sweep' | 'iceberg' | 'layering' | 'post_cancel_cluster' | 'liquidity_withdrawal'
  symbol: string
  event_ts: string              // ISO timestamp UTC
  score: number
  prose: string                 // the rendered narration
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
