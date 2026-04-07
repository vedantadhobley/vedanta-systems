// Types for Spin Cycle data from PostgreSQL

// Speakers can be plain strings or enriched objects
export type SpeakerEntry = string | { name: string; description?: string }

export interface Transcript {
  id: string
  url: string
  title: string
  date: string | null
  speakers: SpeakerEntry[]
  word_count: number
  segment_count: number
  display_text: string
  status: string  // queued | extracting | verifying | complete | failed
  description: string | null
  created_at: string
  // Aggregated
  total_claims: number
  verified_claims: number
  claims: TranscriptClaim[]
}

export interface TranscriptClaim {
  id: string
  transcript_id: string
  claim_id: string | null
  claim_text: string
  original_quote: string
  speaker: string
  worth_checking: boolean
  classification: string | null  // verifiable_fact | subjective_opinion | vague_rhetoric | procedural | future_prediction
  topic: string | null
  checkable: boolean | null
  is_duplicate: boolean
  factual_anchor: string | null
  // Joined from claims + verdicts tables
  claim_status?: string | null
  verdict?: string | null
  confidence?: number | null
  reasoning?: string | null
}

export interface Evidence {
  judge_index: number | null
  url: string | null
  title: string | null
  domain: string | null
  source_type: string
  bias: string | null
  factual: string | null
  tier: string | null
  assessment: string | null  // supports | contradicts | mixed | neutral
  is_independent: boolean | null
  key_point: string | null
}

export interface SubClaim {
  id: string
  text: string
  is_leaf: boolean
  verdict: string | null
  confidence: number | null
  reasoning: string | null
  evidence: Evidence[]
  children: SubClaim[]
}

export interface ClaimDetail {
  id: string
  text: string
  status: string
  speaker: string | null
  normalized_claim: string | null
  thesis: string | null
  key_test: string | null
  verdict: string | null
  confidence: number | null
  reasoning: string | null
  citations: Citation[] | null
  sub_claims: SubClaim[]
}

export interface Citation {
  index: number
  url: string | null
  title: string | null
  domain: string | null
}

// SSE event types
export type SpinCycleSSEType = 'connected' | 'refresh' | 'heartbeat' | 'health' | 'error'

export interface SpinCycleSSEEvent {
  type: SpinCycleSSEType
  timestamp?: number
  health?: SpinCycleHealth
  message?: string
}

export interface SpinCycleHealth {
  postgres: { status: 'up' | 'down'; lastCheck: Date | null }
  overall: 'healthy' | 'unhealthy' | 'unknown'
}
