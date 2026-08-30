import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

interface LayoutSnapshot {
  targetHeight: number
  scrollTop: number
}

export function spacerHeightForTarget(
  targetHeight: number,
  nextContentHeight: number,
): number {
  return Math.max(0, targetHeight - nextContentHeight)
}

export function isSpacerOutsideViewport(
  spacerTop: number,
  viewportHeight: number,
): boolean {
  return spacerTop >= viewportHeight
}

function getScrollRoot(): HTMLElement | null {
  return document.scrollingElement as HTMLElement | null
}

function getSpacerHeight(spacer: HTMLDivElement): number {
  return spacer.getBoundingClientRect().height
}

function setSpacerHeight(spacer: HTMLDivElement, height: number): void {
  spacer.style.height = height > 0 ? `${Math.ceil(height)}px` : '0px'
}

/**
 * Preserves the viewport through an explicitly announced disclosure change.
 *
 * A collapse may make the document too short to retain its current scrollTop.
 * The hook replaces only the removed height with temporary space before paint.
 * The retained space remains stable while any part of it is visible. Once the
 * user has scrolled it completely below the viewport, it resets to zero in one
 * step without changing the visible page.
 *
 * This is transition-scoped. It has no route-lifetime high-water mark and it
 * never grows in response to scrolling or an unannounced render.
 */
export function useTransientScrollSpace(transitionActive = false) {
  const spacerRef = useRef<HTMLDivElement>(null)
  const pendingSnapshotRef = useRef<LayoutSnapshot | null>(null)
  const heldSnapshotRef = useRef<LayoutSnapshot | null>(null)
  const heldTransitionStartedRef = useRef(false)
  const suppressScrollRef = useRef(false)
  const suppressionFrameRef = useRef<number | null>(null)

  const captureLayout = useCallback((): LayoutSnapshot | null => {
    const root = getScrollRoot()
    const spacer = spacerRef.current
    if (!root || !spacer) return null

    return {
      targetHeight: root.scrollHeight,
      scrollTop: root.scrollTop,
    }
  }, [])

  const preserveThroughNextLayout = useCallback(() => {
    const snapshot = captureLayout()
    if (!snapshot) return
    pendingSnapshotRef.current = snapshot
    document.documentElement.classList.add('scroll-space-transition')
  }, [captureLayout])

  const preserveUntilTransitionSettles = useCallback(() => {
    const snapshot = captureLayout()
    if (!snapshot) return
    heldSnapshotRef.current = snapshot
    heldTransitionStartedRef.current = false
    document.documentElement.classList.add('scroll-space-transition')
  }, [captureLayout])

  const releaseOutsideViewport = useCallback(() => {
    const root = getScrollRoot()
    const spacer = spacerRef.current
    if (!root || !spacer) return

    const currentSpacerHeight = getSpacerHeight(spacer)
    if (currentSpacerHeight <= 0) return

    if (isSpacerOutsideViewport(spacer.getBoundingClientRect().top, root.clientHeight)) {
      setSpacerHeight(spacer, 0)
    }
  }, [])

  useLayoutEffect(() => {
    const heldSnapshot = heldSnapshotRef.current
    const snapshot = heldSnapshot ?? pendingSnapshotRef.current
    if (!snapshot) return
    pendingSnapshotRef.current = null

    if (heldSnapshot && transitionActive) {
      heldTransitionStartedRef.current = true
    }
    const heldTransitionFinished = Boolean(
      heldSnapshot
      && heldTransitionStartedRef.current
      && !transitionActive,
    )
    if (heldTransitionFinished) {
      heldSnapshotRef.current = null
      heldTransitionStartedRef.current = false
    }

    const root = getScrollRoot()
    const spacer = spacerRef.current
    if (!root || !spacer) return

    const currentSpacerHeight = getSpacerHeight(spacer)
    const nextContentHeight = root.scrollHeight - currentSpacerHeight
    const nextHeight = spacerHeightForTarget(snapshot.targetHeight, nextContentHeight)

    setSpacerHeight(spacer, nextHeight)
    // Restoring a position after the browser clamps it can emit `scroll`.
    // Keep both that event and native scroll anchoring out of this handoff.
    suppressScrollRef.current = true
    if (root.scrollTop !== snapshot.scrollTop) {
      root.scrollTop = snapshot.scrollTop
    }
    if (suppressionFrameRef.current !== null) {
      window.cancelAnimationFrame(suppressionFrameRef.current)
    }
    suppressionFrameRef.current = window.requestAnimationFrame(() => {
      suppressionFrameRef.current = window.requestAnimationFrame(() => {
        suppressScrollRef.current = false
        suppressionFrameRef.current = null
        if (!heldSnapshotRef.current) {
          document.documentElement.classList.remove('scroll-space-transition')
        }
      })
    })
  })

  useEffect(() => {
    let frameId: number | null = null
    const handleScroll = () => {
      if (suppressScrollRef.current) return
      const heldSnapshot = heldSnapshotRef.current
      const root = getScrollRoot()
      if (heldSnapshot && root) {
        heldSnapshot.scrollTop = root.scrollTop
        return
      }
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        releaseOutsideViewport()
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (suppressionFrameRef.current !== null) {
        window.cancelAnimationFrame(suppressionFrameRef.current)
      }
      document.documentElement.classList.remove('scroll-space-transition')
    }
  }, [releaseOutsideViewport])

  return { spacerRef, preserveThroughNextLayout, preserveUntilTransitionSettles }
}
