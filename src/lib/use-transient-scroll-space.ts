import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

interface LayoutSnapshot {
  contentHeight: number
  scrollTop: number
}

export function nextSpacerHeight(
  currentSpacerHeight: number,
  previousContentHeight: number,
  nextContentHeight: number,
): number {
  return Math.max(0, currentSpacerHeight + previousContentHeight - nextContentHeight)
}

export function requiredSpacerHeight(
  currentSpacerHeight: number,
  scrollTop: number,
  viewportHeight: number,
  contentHeight: number,
): number {
  const heightNeededToSupportViewport = Math.max(0, scrollTop + viewportHeight - contentHeight)
  return Math.min(currentSpacerHeight, heightNeededToSupportViewport)
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
 * As the user scrolls toward real content, that space contracts to the minimum
 * still needed to support the current viewport, then resets to zero.
 *
 * This is transition-scoped. It has no route-lifetime high-water mark and it
 * never grows in response to scrolling or an unannounced render.
 */
export function useTransientScrollSpace() {
  const spacerRef = useRef<HTMLDivElement>(null)
  const pendingSnapshotRef = useRef<LayoutSnapshot | null>(null)
  const suppressScrollRef = useRef(false)
  const suppressionFrameRef = useRef<number | null>(null)

  const preserveThroughNextLayout = useCallback(() => {
    const root = getScrollRoot()
    const spacer = spacerRef.current
    if (!root || !spacer) return

    pendingSnapshotRef.current = {
      contentHeight: root.scrollHeight - getSpacerHeight(spacer),
      scrollTop: root.scrollTop,
    }
  }, [])

  const trimToViewport = useCallback(() => {
    const root = getScrollRoot()
    const spacer = spacerRef.current
    if (!root || !spacer) return

    const currentSpacerHeight = getSpacerHeight(spacer)
    if (currentSpacerHeight <= 0) return

    const contentHeight = root.scrollHeight - currentSpacerHeight
    setSpacerHeight(spacer, requiredSpacerHeight(
      currentSpacerHeight,
      root.scrollTop,
      root.clientHeight,
      contentHeight,
    ))
  }, [])

  useLayoutEffect(() => {
    const snapshot = pendingSnapshotRef.current
    if (!snapshot) return
    pendingSnapshotRef.current = null

    const root = getScrollRoot()
    const spacer = spacerRef.current
    if (!root || !spacer) return

    const currentSpacerHeight = getSpacerHeight(spacer)
    const nextContentHeight = root.scrollHeight - currentSpacerHeight
    const nextHeight = nextSpacerHeight(
      currentSpacerHeight,
      snapshot.contentHeight,
      nextContentHeight,
    )

    setSpacerHeight(spacer, nextHeight)
    if (root.scrollTop !== snapshot.scrollTop) {
      // Restoring a position after the browser clamps it can emit `scroll`.
      // That event is not the user's signal to consume the retained space.
      suppressScrollRef.current = true
      root.scrollTop = snapshot.scrollTop
      if (suppressionFrameRef.current !== null) {
        window.cancelAnimationFrame(suppressionFrameRef.current)
      }
      suppressionFrameRef.current = window.requestAnimationFrame(() => {
        suppressScrollRef.current = false
        suppressionFrameRef.current = null
      })
    }
  })

  useEffect(() => {
    let frameId: number | null = null
    const handleScroll = () => {
      if (suppressScrollRef.current) return
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        trimToViewport()
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (suppressionFrameRef.current !== null) {
        window.cancelAnimationFrame(suppressionFrameRef.current)
      }
    }
  }, [trimToViewport])

  return { spacerRef, preserveThroughNextLayout }
}
