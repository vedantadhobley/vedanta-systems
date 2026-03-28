import { useState, useCallback, useEffect, useRef } from 'react'
import { RiExpandUpDownLine, RiExpandUpDownFill, RiContractUpDownLine, RiContractUpDownFill, RiExternalLinkLine, RiExternalLinkFill, RiFileTextLine, RiFileTextFill, RiChat1Line, RiChat1Fill, RiLoader4Line } from '@remixicon/react'
import type { Transcript, TranscriptClaim, ClaimDetail, SubClaim as SubClaimType, Evidence, SpeakerEntry } from '@/types/spin-cycle'
import { cn } from '@/lib/utils'
import { useScrollStabilizer } from '@/lib/use-scroll-stabilizer'

// ============ VERDICT COLORS ============

// Background highlight for claim text — the core visual language
function verdictHighlight(verdict: string | null | undefined): string {
  switch (verdict) {
    case 'true': return 'bg-green-500/25'
    case 'mostly_true': return 'bg-green-500/15'
    case 'mixed': return 'bg-amber-400/20'
    case 'mostly_false': return 'bg-red-400/15'
    case 'false': return 'bg-red-400/25'
    case 'unverifiable': return 'bg-amber-400/15'
    default: return 'bg-corpo-text/10' // pending / not processed
  }
}

// Text color for verdict labels
function verdictColor(verdict: string | null | undefined): string {
  switch (verdict) {
    case 'true': return 'text-green-400'
    case 'mostly_true': return 'text-green-400/70'
    case 'mixed': return 'text-amber-400'
    case 'mostly_false': return 'text-red-400/80'
    case 'false': return 'text-red-400'
    case 'unverifiable': return 'text-amber-400/70'
    default: return 'text-corpo-text/40'
  }
}

function verdictLabel(verdict: string | null | undefined): string {
  if (!verdict) return 'pending'
  return verdict.replace(/_/g, ' ')
}

function VerdictBadge({ verdict, confidence }: { verdict: string | null | undefined; confidence?: number | null }) {
  return (
    <span className={cn('uppercase tracking-wider text-xs font-medium', verdictColor(verdict))}>
      {verdictLabel(verdict)}
      {confidence != null && (
        <span className="text-corpo-text/30 ml-1">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </span>
  )
}

// Format transcript date for grouping headers
function formatTranscriptDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown date'
  const date = new Date(dateStr + 'T12:00:00Z')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

// ============ SPEAKER UTILITIES ============

// Build lookup from speaker name → description using the transcript's speakers JSONB
function buildSpeakerMap(speakers: SpeakerEntry[]): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>()
  for (const s of speakers) {
    if (typeof s === 'string') {
      map.set(s, undefined)
    } else {
      map.set(s.name, s.description)
    }
  }
  return map
}

// Speaker header component
function SpeakerHeader({ name, description }: { name: string; description?: string }) {
  return (
    <div className="pt-3 pb-1 first:pt-0">
      <span className="text-corpo-text font-medium">{name}</span>
      {description && (
        <span className="text-corpo-text/40 font-light text-sm ml-1">({description})</span>
      )}
    </div>
  )
}

// ============ MAIN BROWSER ============

interface SpinCycleBrowserProps {
  transcripts: Transcript[]
  isConnected: boolean
  isLoading: boolean
  lastUpdate: Date | null
  fetchClaimDetail: (claimId: string) => Promise<ClaimDetail | null>
}

export function SpinCycleBrowser({
  transcripts,
  isLoading,
  fetchClaimDetail,
}: SpinCycleBrowserProps) {
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null)
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null)
  const [claimDetails, setClaimDetails] = useState<Map<string, ClaimDetail>>(new Map())
  const [loadingClaims, setLoadingClaims] = useState<Set<string>>(new Set())
  const [viewModes, setViewModes] = useState<Map<string, 'claims' | 'fulltext'>>(new Map())

  // Scroll stabilizer
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    scrollContainerRef.current = document.querySelector('.content-scroll')
  }, [])
  const scrollSpacerRef = useScrollStabilizer(
    scrollContainerRef,
    [expandedTranscript, expandedClaim]
  )

  const toggleTranscript = useCallback((id: string) => {
    setExpandedTranscript(prev => prev === id ? null : id)
    setExpandedClaim(null)
  }, [])

  // Get cached claim detail from component state
  const getClaimDetail = useCallback((claimId: string): ClaimDetail | undefined => {
    return claimDetails.get(claimId)
  }, [claimDetails])

  const toggleClaim = useCallback(async (transcriptClaimId: string, claimId: string | null) => {
    if (expandedClaim === transcriptClaimId) {
      setExpandedClaim(null)
      expandedClaimIdRef.current = null
      return
    }

    setExpandedClaim(transcriptClaimId)
    expandedClaimIdRef.current = claimId

    // Always fetch fresh when expanding
    if (claimId) {
      setLoadingClaims(prev => new Set(prev).add(claimId))
      const detail = await fetchClaimDetail(claimId)
      if (detail) {
        setClaimDetails(prev => new Map(prev).set(claimId, detail))
      }
      setLoadingClaims(prev => {
        const next = new Set(prev)
        next.delete(claimId)
        return next
      })
    }
  }, [expandedClaim, fetchClaimDetail])

  // Track the claim_id of the currently expanded claim for auto-refresh
  const expandedClaimIdRef = useRef<string | null>(null)

  // When transcripts update (SSE refresh), re-fetch the expanded claim's detail
  useEffect(() => {
    const claimId = expandedClaimIdRef.current
    if (!claimId) return

    const refetch = async () => {
      const detail = await fetchClaimDetail(claimId)
      if (detail) {
        setClaimDetails(prev => new Map(prev).set(claimId, detail))
      }
    }
    refetch()
  }, [transcripts, fetchClaimDetail])

  const toggleViewMode = useCallback((transcriptId: string) => {
    setViewModes(prev => {
      const next = new Map(prev)
      const current = next.get(transcriptId) || 'claims'
      next.set(transcriptId, current === 'claims' ? 'fulltext' : 'claims')
      return next
    })
  }, [])

  const getViewMode = useCallback((transcriptId: string): 'claims' | 'fulltext' => {
    return viewModes.get(transcriptId) || 'claims'
  }, [viewModes])

  const groupedTranscripts = groupByDate(transcripts)

  return (
    <div className="font-mono" style={{ fontSize: 'var(--text-size-base)' }}>
      {/* System advisory */}
      <div className="mb-6 border border-corpo-border/50 bg-corpo-bg/50 p-4">
        <div className="space-y-2 text-corpo-text/60 text-sm font-light">
          <div className="text-corpo-text/40 uppercase tracking-wider text-xs">
            // SYSTEM ADVISORY
          </div>
          <p>
            Automated claim verification pipeline. Verdicts are generated by LLM agents
            and should be treated as analytical starting points, not definitive judgments.
          </p>
          <p className="text-corpo-text/40">
            All evidence is cited. Source bias and factual ratings provided by Media Bias/Fact Check.
          </p>
        </div>
      </div>

      {/* Transcript list */}
      <div className="space-y-1">
        {isLoading ? (
          <div className="text-corpo-text/50 py-8 text-center">
            <span className="animate-pulse">Loading transcripts...</span>
          </div>
        ) : transcripts.length === 0 ? (
          <div className="text-corpo-text/50 py-8 text-center">
            No transcripts available
          </div>
        ) : (
          groupedTranscripts.map((group, groupIndex) => (
            <div key={group.date} className={cn(groupIndex > 0 && "mt-6")}>
              <div className="text-corpo-text/50 text-sm font-light mb-1 px-1 uppercase tracking-wider">
                {formatTranscriptDate(group.date)}
              </div>
              <div className="space-y-1">
                {group.transcripts.map(transcript => (
                  <TranscriptItem
                    key={transcript.id}
                    transcript={transcript}
                    isExpanded={expandedTranscript === transcript.id}
                    expandedClaim={expandedClaim}
                    onToggle={() => toggleTranscript(transcript.id)}
                    onToggleClaim={toggleClaim}
                    getClaimDetail={getClaimDetail}

                    loadingClaims={loadingClaims}
                    viewMode={getViewMode(transcript.id)}
                    onToggleViewMode={() => toggleViewMode(transcript.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div ref={scrollSpacerRef} aria-hidden="true" />
    </div>
  )
}

function groupByDate(transcripts: Transcript[]): { date: string; transcripts: Transcript[] }[] {
  const groups = new Map<string, Transcript[]>()
  for (const t of transcripts) {
    const date = t.date || 'unknown'
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date)!.push(t)
  }
  for (const [, group] of groups) {
    group.sort((a, b) => b.total_claims - a.total_claims)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, transcripts]) => ({ date, transcripts }))
}

// ============ TRANSCRIPT ITEM ============

interface TranscriptItemProps {
  transcript: Transcript
  isExpanded: boolean
  expandedClaim: string | null
  onToggle: () => void
  onToggleClaim: (transcriptClaimId: string, claimId: string | null) => void
  getClaimDetail: (claimId: string) => ClaimDetail | undefined
  loadingClaims: Set<string>
  viewMode: 'claims' | 'fulltext'
  onToggleViewMode: () => void
}

function TranscriptItem({
  transcript, isExpanded, expandedClaim, onToggle, onToggleClaim,
  getClaimDetail, loadingClaims, viewMode, onToggleViewMode,
}: TranscriptItemProps) {
  const { title, speakers, total_claims, status } = transcript
  const checkableClaims = transcript.claims.filter(c => c.worth_checking)
  const verifiedCount = checkableClaims.filter(c => c.verdict).length
  const speakerMap = buildSpeakerMap(speakers)
  const speakerNames = speakers.map(s => typeof s === 'string' ? s : s.name)

  const statusText = status === 'complete'
    ? `${verifiedCount}/${total_claims} verified`
    : status

  return (
    <div className="border border-corpo-border">
      <button
        onClick={onToggle}
        className="group w-full flex items-center gap-2 px-3 py-2 text-left transition-none text-corpo-text hover:text-corpo-light active:text-lavender"
        style={{ fontSize: 'var(--text-size-base)' }}
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

        <span className="flex-1 flex flex-col min-w-0">
          <span className="truncate">{title}</span>
          <span className="text-corpo-text/40 text-sm truncate font-light">
            {speakerNames.length > 0 ? speakerNames.join(', ') : 'Unknown speakers'}
          </span>
        </span>

        <span className="text-corpo-text/60 flex-shrink-0 text-right font-light flex flex-col items-end">
          <span className="tabular-nums">[{total_claims}]</span>
          <span className={cn(
            'text-sm',
            status === 'extracting' || status === 'verifying' ? 'text-lavender/70' : 'text-corpo-text/40'
          )}>
            {statusText}
          </span>
        </span>
      </button>

      {isExpanded && (
        <div className="ml-4 border-l border-corpo-border">
          {/* View toggle */}
          <div className="pl-4 pr-3 py-2 flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleViewMode() }}
              onTouchStart={() => {}}
              className="nav-btn flex items-center gap-1.5"
            >
              {viewMode === 'claims' ? (
                <>
                  <RiFileTextLine className="icon-line w-4 h-4" />
                  <RiFileTextFill className="icon-fill w-4 h-4" />
                  <span className="uppercase tracking-wider text-xs">full text</span>
                </>
              ) : (
                <>
                  <RiChat1Line className="icon-line w-4 h-4" />
                  <RiChat1Fill className="icon-fill w-4 h-4" />
                  <span className="uppercase tracking-wider text-xs">claims only</span>
                </>
              )}
            </button>
          </div>

          {viewMode === 'claims' ? (
            <ClaimsOnlyView
              claims={checkableClaims}
              expandedClaim={expandedClaim}
              onToggleClaim={onToggleClaim}
              getClaimDetail={getClaimDetail}
              loadingClaims={loadingClaims}
              speakerMap={speakerMap}
            />
          ) : (
            <FullTextView
              transcript={transcript}
              claims={checkableClaims}
              expandedClaim={expandedClaim}
              onToggleClaim={onToggleClaim}
              getClaimDetail={getClaimDetail}
              loadingClaims={loadingClaims}
              speakerMap={speakerMap}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ============ CLAIMS-ONLY VIEW ============

interface ClaimsViewProps {
  claims: TranscriptClaim[]
  expandedClaim: string | null
  onToggleClaim: (transcriptClaimId: string, claimId: string | null) => void
  getClaimDetail: (claimId: string) => ClaimDetail | undefined
  loadingClaims: Set<string>
  speakerMap: Map<string, string | undefined>
}

function ClaimsOnlyView({ claims, expandedClaim, onToggleClaim, getClaimDetail, loadingClaims, speakerMap }: ClaimsViewProps) {
  if (claims.length === 0) {
    return (
      <div className="pl-4 pr-3 py-3 text-corpo-text/40 font-light" style={{ fontSize: 'var(--text-size-base)' }}>
        No claims extracted
      </div>
    )
  }

  // Group consecutive same-speaker claims
  let lastSpeaker: string | null = null

  return (
    <div>
      {claims.map(claim => {
        const showHeader = claim.speaker !== lastSpeaker
        lastSpeaker = claim.speaker
        return (
          <div key={claim.id}>
            {showHeader && (
              <div className="px-3">
                <SpeakerHeader name={claim.speaker} description={speakerMap.get(claim.speaker)} />
              </div>
            )}
            <ClaimItem
              claim={claim}
              isExpanded={expandedClaim === claim.id}
              onToggle={() => onToggleClaim(claim.id, claim.claim_id)}
              getClaimDetail={getClaimDetail}
              loadingClaims={loadingClaims}
            />
          </div>
        )
      })}
    </div>
  )
}

// ============ CLAIM ITEM (claims-only view) ============

interface ClaimItemProps {
  claim: TranscriptClaim
  isExpanded: boolean
  onToggle: () => void
  getClaimDetail: (claimId: string) => ClaimDetail | undefined
  loadingClaims: Set<string>
}

function ClaimItem({ claim, isExpanded, onToggle, getClaimDetail, loadingClaims }: ClaimItemProps) {
  const highlightClass = isExpanded ? 'bg-lavender/20' : verdictHighlight(claim.verdict)

  return (
    <div>
      <button
        onClick={onToggle}
        className="group w-full flex items-center gap-2 px-3 py-2 text-left transition-none text-corpo-text hover:text-corpo-light active:text-lavender"
        style={{ fontSize: 'var(--text-size-base)' }}
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

        <div className="flex-1 min-w-0">
          {/* Claim text with verdict-colored highlight */}
          <span className={cn('px-1 -mx-1 decoration-clone', highlightClass)}>
            {claim.claim_text}
          </span>
        </div>

        <span className="flex-shrink-0">
          <VerdictBadge verdict={claim.verdict} confidence={claim.confidence} />
        </span>
      </button>

      {/* Expanded claim detail */}
      {isExpanded && claim.claim_id && (
        <div className="ml-4">
          <div className="pl-4 pr-3 py-2" style={{ fontSize: 'var(--text-size-base)' }}>
            <ClaimDetailPanel
              claimId={claim.claim_id}
              getClaimDetail={getClaimDetail}
              loadingClaims={loadingClaims}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============ FULL TEXT VIEW ============

interface FullTextViewProps {
  transcript: Transcript
  claims: TranscriptClaim[]
  expandedClaim: string | null
  onToggleClaim: (transcriptClaimId: string, claimId: string | null) => void
  getClaimDetail: (claimId: string) => ClaimDetail | undefined
  loadingClaims: Set<string>
  speakerMap: Map<string, string | undefined>
}

function FullTextView({ transcript, claims, expandedClaim, onToggleClaim, getClaimDetail, loadingClaims, speakerMap }: FullTextViewProps) {
  const { display_text } = transcript

  if (!display_text) {
    return (
      <div className="pl-4 pr-3 py-3 text-corpo-text/40 font-light" style={{ fontSize: 'var(--text-size-base)' }}>
        No transcript text available
      </div>
    )
  }

  const highlights = buildHighlights(display_text, claims)

  // Render text segments, replacing speaker markers with proper headers
  // Speaker markers in display_text look like "Speaker Name (HH:MM):\n" or "Speaker Name:\n"
  const speakerNames = [...speakerMap.keys()]

  function renderTextSegment(text: string, key: string | number) {
    if (!text) return null
    // Split text by speaker markers and render headers inline
    const parts = splitTextBySpeakerMarkers(text, speakerNames)
    return (
      <>
        {parts.map((part, j) => {
          if (part.type === 'speaker') {
            return <SpeakerHeader key={`${key}-s${j}`} name={part.name!} description={speakerMap.get(part.name!)} />
          }
          return (
            <span key={`${key}-t${j}`} className="text-corpo-text/70 font-light leading-relaxed whitespace-pre-wrap">
              {part.content}
            </span>
          )
        })}
      </>
    )
  }

  return (
    <div className="pl-4 pr-3 py-3" style={{ fontSize: 'var(--text-size-base)' }}>
      {highlights.map((segment, i) => {
        if (segment.type === 'text') {
          return <span key={i}>{renderTextSegment(segment.content, i)}</span>
        }

        const segmentClaims = segment.claims!
        const activeClaim = segmentClaims.find(c => expandedClaim === c.id)
        const isActive = !!activeClaim
        const bestVerdict = pickBestVerdict(segmentClaims)
        const highlightClass = isActive ? 'bg-lavender/20' : verdictHighlight(bestVerdict)

        return (
          <span key={i}>
            <span
              role="button"
              tabIndex={0}
              onClick={() => {
                if (isActive) {
                  onToggleClaim(activeClaim!.id, activeClaim!.claim_id)
                } else {
                  onToggleClaim(segmentClaims[0].id, segmentClaims[0].claim_id)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  const target = isActive ? activeClaim! : segmentClaims[0]
                  onToggleClaim(target.id, target.claim_id)
                }
              }}
              className={cn(
                'cursor-pointer transition-none whitespace-pre-wrap leading-relaxed font-light',
                highlightClass,
                isActive ? 'text-lavender' : 'text-corpo-text/90 hover:text-corpo-text'
              )}
            >
              {segment.content}
            </span>
            {/* Detail panel — rendered as a block div OUTSIDE pre-wrap */}
            {isActive && (
              <div className="my-2 border-l-2 border-lavender/40 pl-3 whitespace-normal">
                {segmentClaims.map((claim, ci) => (
                  <div key={claim.id}>
                    {segmentClaims.length > 1 && (
                      <div className="text-corpo-text/30 uppercase tracking-wider text-xs mb-1 font-mono">
                        claim {ci + 1} of {segmentClaims.length}
                        {expandedClaim !== claim.id && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="ml-2 text-corpo-text/50 hover:text-corpo-light cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); onToggleClaim(claim.id, claim.claim_id) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onToggleClaim(claim.id, claim.claim_id) } }}
                          >
                            [show]
                          </span>
                        )}
                      </div>
                    )}
                    {(expandedClaim === claim.id || segmentClaims.length === 1) && (
                      <div className="mb-2">
                        <div className="text-corpo-text/60 text-sm mb-2 italic font-light">{claim.claim_text}</div>
                        {claim.claim_id && (
                          <ClaimDetailPanel
                            claimId={claim.claim_id}
                            getClaimDetail={getClaimDetail}
                            loadingClaims={loadingClaims}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </span>
        )
      })}
    </div>
  )
}

// Split a text segment by speaker markers (e.g., "Donald Trump (00:00):\n")
// Returns alternating text/speaker parts
interface TextPart {
  type: 'text' | 'speaker'
  content: string
  name?: string
}

function splitTextBySpeakerMarkers(text: string, speakerNames: string[]): TextPart[] {
  if (speakerNames.length === 0) {
    return [{ type: 'text', content: text }]
  }

  // Build regex: "Speaker Name" optionally followed by " (HH:MM)" or " (timestamp)", then ":"
  // Escaped speaker names joined with |
  const escaped = speakerNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`((?:^|\\n)(${escaped.join('|')})(?:\\s*\\([^)]*\\))?\\s*:\\s*\\n?)`, 'g')

  const parts: TextPart[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const fullMatch = match[1]
    const speakerName = match[2]
    const matchStart = match.index + (match[1].startsWith('\n') ? 1 : 0) // skip leading newline

    if (matchStart > lastIdx) {
      parts.push({ type: 'text', content: text.slice(lastIdx, matchStart) })
    }
    parts.push({ type: 'speaker', content: fullMatch.trim(), name: speakerName })
    lastIdx = match.index + fullMatch.length
  }

  if (lastIdx < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIdx) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

// Pick the most "notable" verdict from a group of claims for highlight color
function pickBestVerdict(claims: TranscriptClaim[]): string | null {
  const priority = ['false', 'mostly_false', 'mixed', 'unverifiable', 'mostly_true', 'true']
  let best: string | null = null
  let bestIdx = -1
  for (const c of claims) {
    if (!c.verdict) continue
    const idx = priority.indexOf(c.verdict)
    if (idx > bestIdx) {
      bestIdx = idx
      best = c.verdict
    }
  }
  return best
}

// Build highlight segments from transcript text and claims
// Groups multiple claims that share the same original_quote
interface HighlightSegment {
  type: 'text' | 'highlight'
  content: string
  claims?: TranscriptClaim[]
}

// Normalize all quote characters to a single form for fuzzy matching
function normalizeQuotes(s: string): string {
  return s.replace(/[\u2018\u2019\u201A\u2039\u203A'"\u201C\u201D\u201E\u00AB\u00BB]/g, "'")
}

// Find quote in text, falling back to quote-normalized search
function findQuoteInText(text: string, quote: string): { idx: number; len: number } {
  // Exact match first
  const idx = text.indexOf(quote)
  if (idx !== -1) return { idx, len: quote.length }

  // Normalize both and search
  const normText = normalizeQuotes(text)
  const normQuote = normalizeQuotes(quote)
  const normIdx = normText.indexOf(normQuote)
  if (normIdx !== -1) return { idx: normIdx, len: normQuote.length }

  return { idx: -1, len: 0 }
}

function buildHighlights(text: string, claims: TranscriptClaim[]): HighlightSegment[] {
  // Find positions for all claims, grouping by position
  const regionMap = new Map<string, { start: number; end: number; claims: TranscriptClaim[] }>()

  for (const claim of claims) {
    if (!claim.original_quote) continue
    const { idx, len } = findQuoteInText(text, claim.original_quote)
    if (idx === -1) continue
    const key = `${idx}:${idx + len}`
    if (regionMap.has(key)) {
      regionMap.get(key)!.claims.push(claim)
    } else {
      regionMap.set(key, { start: idx, end: idx + len, claims: [claim] })
    }
  }

  // Sort by start position, remove overlaps (longest match wins for overlaps)
  const regions = [...regionMap.values()].sort((a, b) => a.start - b.start)
  const filtered: typeof regions = []
  let lastEnd = 0
  for (const r of regions) {
    if (r.start >= lastEnd) {
      filtered.push(r)
      lastEnd = r.end
    } else if (r.end > lastEnd) {
      // Overlapping but extends further — skip (keep the first)
    }
  }

  const segments: HighlightSegment[] = []
  let pos = 0
  for (const r of filtered) {
    if (r.start > pos) {
      segments.push({ type: 'text', content: text.slice(pos, r.start) })
    }
    segments.push({ type: 'highlight', content: text.slice(r.start, r.end), claims: r.claims })
    pos = r.end
  }
  if (pos < text.length) {
    segments.push({ type: 'text', content: text.slice(pos) })
  }

  return segments
}

// ============ CLAIM DETAIL PANEL ============

function ClaimDetailPanel({
  claimId, getClaimDetail, loadingClaims,
}: {
  claimId: string
  getClaimDetail: (id: string) => ClaimDetail | undefined
  loadingClaims: Set<string>
}) {
  const detail = getClaimDetail(claimId)
  const isLoading = loadingClaims.has(claimId)

  if (isLoading || !detail) {
    return (
      <div className="flex items-center gap-2 text-corpo-text/40">
        <RiLoader4Line className="w-4 h-4 animate-spin" />
        <span>Loading verdict...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <VerdictBadge verdict={detail.verdict} confidence={detail.confidence} />
      </div>

      {detail.thesis && (
        <div>
          <div className="text-corpo-text/40 uppercase tracking-wider text-xs mb-1">thesis</div>
          <div className="text-corpo-text/70 font-light text-sm">{detail.thesis}</div>
        </div>
      )}

      {detail.reasoning && (
        <div>
          <div className="text-corpo-text/40 uppercase tracking-wider text-xs mb-1">reasoning</div>
          <div className="text-corpo-text/70 font-light text-sm leading-relaxed">{detail.reasoning}</div>
        </div>
      )}

      {detail.citations && detail.citations.length > 0 && (
        <div>
          <div className="text-corpo-text/40 uppercase tracking-wider text-xs mb-1">citations</div>
          <div className="space-y-1">
            {detail.citations.map((c, i) => (
              <CitationItem key={i} citation={c} />
            ))}
          </div>
        </div>
      )}

      {detail.sub_claims.length > 0 && (
        <div>
          <div className="text-corpo-text/40 uppercase tracking-wider text-xs mb-1">sub-claims</div>
          <div className="space-y-1">
            {detail.sub_claims.map(sc => (
              <SubClaimNode key={sc.id} subClaim={sc} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ SUB-CLAIM TREE ============

function SubClaimNode({ subClaim, depth }: { subClaim: SubClaimType; depth: number }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasChildren = subClaim.children.length > 0
  const hasEvidence = subClaim.evidence.length > 0
  const canExpand = hasChildren || hasEvidence || !!subClaim.reasoning

  return (
    <div className={cn(depth > 0 && 'ml-3 border-l border-corpo-border/50 pl-3')}>
      <div className="flex items-start gap-2 py-1">
        {canExpand ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 mt-0.5 text-corpo-text/50 hover:text-corpo-light"
          >
            {isExpanded ? (
              <RiContractUpDownLine className="w-3.5 h-3.5" />
            ) : (
              <RiExpandUpDownLine className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <span className={cn('text-sm font-light px-1 -mx-1', verdictHighlight(subClaim.verdict))}>{subClaim.text}</span>
          {subClaim.verdict && (
            <span className="ml-2">
              <VerdictBadge verdict={subClaim.verdict} confidence={subClaim.confidence} />
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="ml-5">
          {subClaim.reasoning && (
            <div className="text-corpo-text/50 text-sm font-light py-1 leading-relaxed">
              {subClaim.reasoning}
            </div>
          )}

          {hasEvidence && (
            <div className="space-y-1 py-1">
              {subClaim.evidence.map((e, i) => (
                <EvidenceItem key={i} evidence={e} />
              ))}
            </div>
          )}

          {hasChildren && (
            <div className="space-y-1">
              {subClaim.children.map(child => (
                <SubClaimNode key={child.id} subClaim={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============ EVIDENCE ITEM ============

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const assessmentColor = evidence.assessment === 'supports'
    ? 'text-green-400/70'
    : evidence.assessment === 'contradicts'
      ? 'text-red-400/70'
      : evidence.assessment === 'mixed'
        ? 'text-amber-400/70'
        : 'text-corpo-text/40'

  return (
    <div className="border border-corpo-border/30 px-2 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        {evidence.url ? (
          <a
            href={evidence.url}
            target="_blank"
            rel="noopener noreferrer"
            onTouchStart={() => {}}
            className="nav-btn flex items-center gap-1 min-w-0"
          >
            <RiExternalLinkLine className="icon-line w-3.5 h-3.5 flex-shrink-0" />
            <RiExternalLinkFill className="icon-fill w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{evidence.domain || 'source'}</span>
          </a>
        ) : (
          <span className="text-corpo-text/40 truncate">{evidence.domain || 'unknown'}</span>
        )}

        <span className={cn('uppercase tracking-wider text-xs flex-shrink-0', assessmentColor)}>
          {evidence.assessment || 'neutral'}
        </span>

        {evidence.tier && (
          <span className="text-corpo-text/30 text-xs flex-shrink-0 truncate">{evidence.tier}</span>
        )}
      </div>

      {evidence.key_point && (
        <div className="text-corpo-text/50 font-light mt-1 leading-relaxed">
          {evidence.key_point}
        </div>
      )}

      {(evidence.bias || evidence.factual) && (
        <div className="text-corpo-text/30 text-xs mt-1">
          {evidence.bias && <span>Bias: {evidence.bias}</span>}
          {evidence.bias && evidence.factual && <span> &middot; </span>}
          {evidence.factual && <span>Factual: {evidence.factual}</span>}
          {evidence.is_independent === false && <span> &middot; <span className="text-amber-400/50">affiliated</span></span>}
        </div>
      )}
    </div>
  )
}

// ============ CITATION ITEM ============

function CitationItem({ citation }: { citation: { index: number; url?: string | null; title?: string | null; domain?: string | null } }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-corpo-text/30 tabular-nums flex-shrink-0">[{citation.index}]</span>
      {citation.url ? (
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          onTouchStart={() => {}}
          className="nav-btn flex items-center gap-1 min-w-0"
        >
          <RiExternalLinkLine className="icon-line w-3.5 h-3.5 flex-shrink-0" />
          <RiExternalLinkFill className="icon-fill w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{citation.title || citation.domain || 'source'}</span>
        </a>
      ) : (
        <span className="text-corpo-text/40 truncate">{citation.title || 'source'}</span>
      )}
    </div>
  )
}
