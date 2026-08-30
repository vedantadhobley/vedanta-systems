import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

interface ViewportSnapshot {
  bottomFiller: number
  clientHeight: number
  displayMode: string
  innerHeight: number
  navOcclusion: number
  navRow: number
  safeBottom: number
  safeTop: number
  scrollClientHeight: number
  scrollHeight: number
  scrollOwner: string
  scrollTop: number
  shellProfile: string
  visualHeight: number | null
  visualOffsetTop: number | null
  visualScale: number | null
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function displayMode(): string {
  const modes = ['fullscreen', 'standalone', 'minimal-ui'] as const
  const matched = modes.find(mode => window.matchMedia(`(display-mode: ${mode})`).matches)
  if (matched) return matched
  if ((window.navigator as NavigatorWithStandalone).standalone) return 'standalone-ios'
  return 'browser'
}

function elementHeight(selector: string): number {
  const element = document.querySelector<HTMLElement>(selector)
  return element ? round(element.getBoundingClientRect().height) : 0
}

function scrollOwnerName(owner: Element | null): string {
  if (owner === document.documentElement) return 'documentElement'
  if (owner === document.body) return 'body'
  if (owner instanceof HTMLElement) {
    return owner.id || owner.dataset.shellScrollProfile || owner.tagName.toLowerCase()
  }
  return 'none'
}

function collectSnapshot(probe: HTMLDivElement): ViewportSnapshot {
  const probeStyle = window.getComputedStyle(probe)
  const owner = document.scrollingElement as HTMLElement | null
  const navOcclusion = elementHeight('.site-bottom-nav')
  const navRow = elementHeight('.site-bottom-nav-content')
  const visualViewport = window.visualViewport
  const shell = document.querySelector<HTMLElement>('[data-shell-scroll-profile]')

  return {
    bottomFiller: round(Math.max(0, navOcclusion - navRow)),
    clientHeight: document.documentElement.clientHeight,
    displayMode: displayMode(),
    innerHeight: window.innerHeight,
    navOcclusion,
    navRow,
    safeBottom: round(Number.parseFloat(probeStyle.paddingBottom) || 0),
    safeTop: round(Number.parseFloat(probeStyle.paddingTop) || 0),
    scrollClientHeight: owner?.clientHeight ?? 0,
    scrollHeight: owner?.scrollHeight ?? 0,
    scrollOwner: scrollOwnerName(owner),
    scrollTop: round(owner?.scrollTop ?? 0),
    shellProfile: shell?.dataset.shellScrollProfile ?? 'unknown',
    visualHeight: visualViewport ? round(visualViewport.height) : null,
    visualOffsetTop: visualViewport ? round(visualViewport.offsetTop) : null,
    visualScale: visualViewport ? round(visualViewport.scale) : null,
  }
}

function Metric({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-white/50">{label}</dt>
      <dd className="m-0 tabular-nums text-white">{value ?? 'n/a'}</dd>
    </div>
  )
}

/**
 * Local viewport telemetry for physical browser and installed-app testing.
 * Enable it explicitly with `?layoutDebug=1`; no values leave the browser.
 */
export function ViewportDiagnostics() {
  const location = useLocation()
  const probeRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const [snapshot, setSnapshot] = useState<ViewportSnapshot | null>(null)
  const enabled = new URLSearchParams(location.search).get('layoutDebug') === '1'

  const scheduleCollection = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      if (probeRef.current) setSnapshot(collectSnapshot(probeRef.current))
    })
  }, [])

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null)
      return
    }

    const visualViewport = window.visualViewport
    scheduleCollection()
    window.addEventListener('resize', scheduleCollection)
    window.addEventListener('orientationchange', scheduleCollection)
    window.addEventListener('scroll', scheduleCollection, { passive: true })
    window.addEventListener('pageshow', scheduleCollection)
    document.addEventListener('visibilitychange', scheduleCollection)
    visualViewport?.addEventListener('resize', scheduleCollection)
    visualViewport?.addEventListener('scroll', scheduleCollection)

    return () => {
      window.removeEventListener('resize', scheduleCollection)
      window.removeEventListener('orientationchange', scheduleCollection)
      window.removeEventListener('scroll', scheduleCollection)
      window.removeEventListener('pageshow', scheduleCollection)
      document.removeEventListener('visibilitychange', scheduleCollection)
      visualViewport?.removeEventListener('resize', scheduleCollection)
      visualViewport?.removeEventListener('scroll', scheduleCollection)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [enabled, scheduleCollection])

  if (!enabled) return null

  return (
    <>
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none fixed invisible"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      />
      {snapshot && (
        <aside
          aria-label="Viewport diagnostics"
          className="pointer-events-none fixed z-[10000] max-w-[calc(100vw-1rem)] border border-white/40 bg-black/95 p-2 font-mono text-[11px] leading-4"
          style={{
            left: 'calc(0.5rem + var(--shell-safe-left))',
            top: 'calc(0.5rem + var(--shell-safe-top))',
          }}
        >
          <dl className="m-0 min-w-[250px] space-y-0">
            <Metric label="mode / profile" value={`${snapshot.displayMode} / ${snapshot.shellProfile}`} />
            <Metric label="scroll owner" value={snapshot.scrollOwner} />
            <Metric label="inner / client" value={`${snapshot.innerHeight} / ${snapshot.clientHeight}`} />
            <Metric label="visual h / top / scale" value={`${snapshot.visualHeight ?? 'n/a'} / ${snapshot.visualOffsetTop ?? 'n/a'} / ${snapshot.visualScale ?? 'n/a'}`} />
            <Metric label="safe top / bottom" value={`${snapshot.safeTop} / ${snapshot.safeBottom}`} />
            <Metric label="nav row / filler / total" value={`${snapshot.navRow} / ${snapshot.bottomFiller} / ${snapshot.navOcclusion}`} />
            <Metric label="scroll h / client / top" value={`${snapshot.scrollHeight} / ${snapshot.scrollClientHeight} / ${snapshot.scrollTop}`} />
          </dl>
        </aside>
      )}
    </>
  )
}
