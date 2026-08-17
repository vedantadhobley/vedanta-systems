import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface BtopMonitorProps {
  className?: string
  /** Display label for the node */
  label?: string
  /** API path prefix (e.g., "/api/btop-luv" or "/api/btop-joi") */
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

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiPrefix}/health`, { cache: 'no-store' })
      setIsOnline(res.ok)
    } catch {
      setIsOnline(false)
    }
  }, [apiPrefix])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 15000)
    return () => clearInterval(interval)
  }, [checkHealth])

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
      if (data.t === 'f') {
        for (let i = 0; i < TOTAL_CELLS; i++) {
          const [char, fg, bg, bold] = data.c[i]
          updateCell(i, char, fg, bg, bold)
        }
      } else if (data.t === 'd') {
        const excitationStride = Math.max(
          1,
          Math.ceil(data.d.length / MAX_PHOSPHOR_EXCITATIONS_PER_DELTA),
        )
        for (let deltaIndex = 0; deltaIndex < data.d.length; deltaIndex++) {
          const [index, char, fg, bg, bold] = data.d[deltaIndex]
          const excite = char !== ' ' && deltaIndex % excitationStride === 0
          updateCell(index, char, fg, bg, bold, excite)
        }
      }
    }

    const connect = () => {
      if (eventSource) eventSource.close()
      eventSource = new EventSource(`${apiPrefix}/stream`)
      eventSource.onopen = () => { reconnectAttempts = 0 }
      eventSource.onmessage = (event) => {
        try {
          handleMessage(JSON.parse(event.data))
        } catch (e) {
          console.error('[btop] Parse error:', e)
        }
      }
      eventSource.onerror = () => {
        eventSource?.close()
        eventSource = null
        if (document.visibilityState !== 'visible') return
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
        reconnectAttempts++
        reconnectTimeout = setTimeout(connect, delay)
      }
    }

    const disconnect = () => {
      if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null }
      if (eventSource) { eventSource.close(); eventSource = null }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!eventSource || eventSource.readyState !== EventSource.OPEN) {
          reconnectAttempts = 0
          connect()
        }
      } else {
        disconnect()
      }
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
    <div className={cn(className)}>
      <div className="flex items-center justify-center gap-1.5 md:gap-2 py-1 md:py-1.5">
        <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2">
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
