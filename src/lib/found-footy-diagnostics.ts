export interface FootyDiagnostic {
  stage: string
  outcome: string
  event_id?: string
  fixture_id?: number
  count?: number
  reason?: string
}

// Fixed storage and rate limits; no per-ID maps or payload/media URL logging.
// Browser records are inspectable on the provider; BFF records go to stdout.
export function createFootyDiagnostics(
  emit: (entry: FootyDiagnostic & { suppressed: number }) => void,
  now = Date.now,
) {
  let windowStart = now()
  let emitted = 0
  let suppressed = 0
  const recent: Array<FootyDiagnostic & { at: number }> = []
  return {
    record(entry: FootyDiagnostic) {
      const at = now()
      recent.push({ ...entry, reason: entry.reason?.slice(0, 160), at })
      if (recent.length > 100) recent.shift()
      if (at - windowStart >= 60_000) {
        emitted = 0
        windowStart = at
      }
      if (emitted < 60) {
        emit({ ...recent[recent.length - 1], suppressed })
        suppressed = 0
        emitted++
      } else suppressed++
    },
    snapshot: () => ({ recent: [...recent], suppressed }),
  }
}
