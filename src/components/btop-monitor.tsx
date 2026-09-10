import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface BtopMonitorProps {
  className?: string
  /** Display label for the node */
  label?: string
  /** API path prefix (e.g., "/api/btop/luv"; legacy joi uses "/api/btop-joi"). */
  apiPrefix?: string
  /** Excite only terminal cells changed by a live delta frame. */
  phosphor?: boolean
}

const COLS = 132
const ROWS = 43
const CELL_W = 6
const CELL_H = 12
const TOTAL_CELLS = COLS * ROWS
const TERM_W = COLS * CELL_W
const TERM_H = ROWS * CELL_H
const ASPECT_RATIO = TERM_W / TERM_H
const MAX_RECONNECT_DELAY = 30000
const STALE_FRAME_MS = 5000
const MAX_PHOSPHOR_EXCITATIONS_PER_DELTA = 64

type Cell = [string, string | null, string | null, 0 | 1]
type FullFrame = { t: 'f'; c: Cell[] }
type DeltaFrame = { t: 'd'; d: Array<[number, string, string | null, string | null, 0 | 1]> }
type StreamMessage = FullFrame | DeltaFrame

export function BtopMonitor({
  className,
  label = 'local',
  apiPrefix = '/api/btop',
  phosphor = false,
}: BtopMonitorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const spansRef = useRef<HTMLSpanElement[]>([])
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    const fragment = document.createDocumentFragment()
    const spans: HTMLSpanElement[] = []
    for (let i = 0; i < TOTAL_CELLS; i++) {
      const span = document.createElement('span')
      span.className = 'btop-cell'
      span.textContent = '\u00A0'
      fragment.appendChild(span)
      spans.push(span)
    }
    terminal.appendChild(fragment)
    spansRef.current = spans
    return () => {
      terminal.replaceChildren()
      spansRef.current = []
    }
  }, [])

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    let disposed = false
    let suspended = false
    let hasFullFrame = false
    let lastFrameAt: number | null = null
    let connectedAt = 0

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const updateCell = (
      index: number,
      char: string,
      fg: string | null,
      bg: string | null,
      bold: 0 | 1,
      excite = false,
    ) => {
      const span = spansRef.current[index]
      if (!span) return
      const nextChar = char === ' ' ? '\u00A0' : char
      const nextForeground = fg ? `#${fg}` : ''
      const nextBackground = bg ? `#${bg}` : ''
      const nextWeight = bold ? 'bold' : ''
      span.textContent = nextChar
      span.style.color = nextForeground
      span.style.background = nextBackground
      span.style.fontWeight = nextWeight

      if (!phosphor) return

      const restingEmission = fg ? `0 0 1.5px #${fg}66` : ''
      span.style.textShadow = restingEmission

      if (!excite || !fg || reducedMotion.matches) return

      span.getAnimations().forEach((animation) => animation.cancel())
      span.animate(
        [
          { textShadow: `0 0 2px #ffffff, 0 0 7px #${fg}, 0 0 13px #${fg}99` },
          { textShadow: `0 0 1px #${fg}, 0 0 4px #${fg}aa`, offset: 0.32 },
          { textShadow: restingEmission },
        ],
        { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      )
    }

    const handleMessage = (data: StreamMessage) => {
      if (data.t === 'f' && Array.isArray(data.c) && data.c.length === TOTAL_CELLS) {
        for (let i = 0; i < TOTAL_CELLS; i++) {
          const [char, fg, bg, bold] = data.c[i]
          updateCell(i, char, fg, bg, bold)
        }
        hasFullFrame = true
      } else if (data.t === 'd' && hasFullFrame && Array.isArray(data.d) && data.d.length <= TOTAL_CELLS) {
        const excitationStride = Math.max(
          1,
          Math.ceil(data.d.length / MAX_PHOSPHOR_EXCITATIONS_PER_DELTA),
        )
        for (let deltaIndex = 0; deltaIndex < data.d.length; deltaIndex++) {
          const [index, char, fg, bg, bold] = data.d[deltaIndex]
          const excite = char !== ' ' && deltaIndex % excitationStride === 0
          updateCell(index, char, fg, bg, bold, excite)
        }
      } else return false
      return true
    }

    // navigator.onLine is a platform heuristic, not reachability of this BFF.
    // Keep bounded retries even on a private network reported as offline.
    const canConnect = () => !disposed && !suspended
      && document.visibilityState === 'visible'

    const disconnect = () => {
      if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null }
      if (eventSource) { eventSource.close(); eventSource = null }
      hasFullFrame = false
      lastFrameAt = null
      if (!disposed) setIsOnline(false)
    }

    const retry = () => {
      disconnect()
      if (!canConnect()) return
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
      reconnectAttempts = Math.min(reconnectAttempts + 1, 5)
      reconnectTimeout = setTimeout(connect, delay)
    }

    const connect = () => {
      disconnect()
      if (!canConnect()) return
      connectedAt = performance.now()
      const source = new EventSource(`${apiPrefix}/stream`)
      eventSource = source
      source.onmessage = (event) => {
        if (eventSource !== source || disposed) return
        try {
          if (!handleMessage(JSON.parse(event.data))) { retry(); return }
          lastFrameAt = performance.now()
          reconnectAttempts = 0
          setIsOnline(true)
        } catch {
          retry()
        }
      }
      source.onerror = () => {
        if (eventSource === source && !disposed) retry()
      }
    }

    const wake = () => {
      reconnectAttempts = 0
      connect()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') wake()
      else disconnect()
    }
    const hidePage = () => { suspended = true; disconnect() }
    const showPage = () => { suspended = false; wake() }

    // Only received frames prove freshness. HTTP health and SSE comments do not.
    const watchdog = setInterval(() => {
      if (eventSource && performance.now() - (lastFrameAt ?? connectedAt) > STALE_FRAME_MS) retry()
    }, 1000)
    connect()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', hidePage)
    window.addEventListener('pageshow', showPage)
    window.addEventListener('offline', retry)
    window.addEventListener('online', wake)

    return () => {
      disposed = true
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', hidePage)
      window.removeEventListener('pageshow', showPage)
      window.removeEventListener('offline', retry)
      window.removeEventListener('online', wake)
      disconnect()
    }
  }, [apiPrefix, phosphor])

  useEffect(() => {
    const container = containerRef.current
    const terminal = terminalRef.current
    if (!container || !terminal) return

    const resize = () => {
      const scaleX = container.clientWidth / TERM_W
      const scaleY = container.clientHeight / TERM_H
      const scale = Math.min(scaleX, scaleY)
      terminal.style.transform = `scale(${scale})`
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={cn(className)} data-btop-node={label}>
      <div className="flex items-center justify-center gap-1.5 md:gap-2 py-1 md:py-1.5">
        <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2"
          role="status" aria-label={`${label}: ${isOnline ? 'live' : 'offline'}`}
          title={isOnline ? 'Receiving live frames' : 'No current frame'}>
          <span className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            isOnline && "animate-ping",
            isOnline ? "bg-lavender" : "bg-corpo-text/50"
          )} />
          <span className={cn(
            "relative inline-flex h-full w-full rounded-full",
            isOnline ? "bg-lavender" : "bg-corpo-text/50"
          )} />
        </span>
        <span className="font-mono text-xs md:text-sm uppercase tracking-wider text-corpo-text/60">
          {label}
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative bg-black w-full flex items-center justify-center overflow-hidden"
        style={{ aspectRatio: ASPECT_RATIO }}
      >
        <div
          ref={terminalRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${CELL_W}px)`,
            gridTemplateRows: `repeat(${ROWS}, ${CELL_H}px)`,
            fontFamily: "'JetBrainsMono NF', monospace",
            fontSize: `${CELL_H * 0.85}px`,
            lineHeight: 1,
            background: '#000',
            width: TERM_W,
            height: TERM_H,
            transformOrigin: 'center center',
          }}
        />
      </div>
    </div>
  )
}
