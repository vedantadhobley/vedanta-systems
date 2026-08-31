export interface FoundFootyRouteTarget {
  eventId: string
  shareId?: string
  navigationKey: string
}

export interface FoundFootyRouteSelection {
  target: FoundFootyRouteTarget | null
  cleanDate: string
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function readFoundFootyRoute(
  search: string,
  today: string,
  navigationKey: string,
): FoundFootyRouteSelection {
  const params = new URLSearchParams(search)
  const eventId = params.get('v')
  const requestedDate = params.get('d')
  return {
    target: eventId ? {
      eventId,
      shareId: params.get('s') || undefined,
      navigationKey,
    } : null,
    cleanDate: requestedDate && isCalendarDate(requestedDate) ? requestedDate : today,
  }
}

export function foundFootyDateUrl(date: string, today: string): string {
  return date === today
    ? '/workspace/found-footy'
    : `/workspace/found-footy?d=${encodeURIComponent(date)}`
}

export function foundFootyVideoUrl(eventId: string, shareId: string): string {
  return `/workspace/found-footy?v=${encodeURIComponent(eventId)}&s=${encodeURIComponent(shareId)}`
}

export function reflectFoundFootyVideoUrl(
  history: Pick<History, 'state' | 'replaceState'>,
  eventId: string,
  shareId: string,
): void {
  history.replaceState(history.state, '', foundFootyVideoUrl(eventId, shareId))
}
