import { useRef, useEffect, useLayoutEffect } from 'react'

/**
 * Prevents scroll "snapping" when content height decreases.
 * 
 * When content shrinks (date change, fixture collapse, etc.), the browser
 * clamps scrollTop to the new max scrollable position, causing a jarring snap.
 * 
 * This hook adds phantom padding to preserve the previous scroll height,
 * then removes it once the user scrolls and it's fully out of view.
 * 
 * Uses a "high water mark" approach: tracks the maximum scroll height seen
 * during a transition. This handles cascading content changes (e.g., date
 * change → fixture collapse → data swap) without accumulating rounding errors.
 * 
 * Usage:
 *   const spacerRef = useScrollStabilizer(scrollContainerRef, [dependencies])
 *   // Render: <div ref={spacerRef} /> at the bottom of scrollable content
 */
export function useScrollStabilizer(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  deps: React.DependencyList
) {
  const spacerRef = useRef<HTMLDivElement>(null)
  // High water mark: the tallest total height we've needed to preserve
  const highWaterRef = useRef({ top: 0, height: 0 })

  // Capture scroll state during render phase — BEFORE React commits DOM changes.
  // This gives us the exact scrollTop/scrollHeight at the moment of re-render.
  const container = scrollContainerRef.current
  if (container) {
    const currentTop = container.scrollTop
    const currentHeight = container.scrollHeight

    // Update high water mark — keep the largest scrollHeight and its scrollTop.
    // This ensures cascading content shrinks all compare against the original
    // (tallest) state rather than intermediate states that include partial spacers.
    if (currentHeight >= highWaterRef.current.height) {
      highWaterRef.current = { top: currentTop, height: currentHeight }
    }
    // Also always track the latest scrollTop (user might have scrolled)
    highWaterRef.current.top = currentTop
  }

  // useLayoutEffect runs synchronously after DOM mutation, BEFORE browser paint.
  // Set spacer height and restore scrollTop before any visual snap.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    const spacer = spacerRef.current
    if (!container || !spacer) return

    const oldScrollTop = highWaterRef.current.top
    const oldScrollHeight = highWaterRef.current.height

    // Current content height (minus any existing spacer)
    const currentSpacerHeight = spacer.offsetHeight
    const newContentHeight = container.scrollHeight - currentSpacerHeight

    if (oldScrollHeight > 0 && oldScrollTop > 0 && newContentHeight < oldScrollHeight) {
      // Content shrank — set spacer to restore original total height
      const deficit = oldScrollHeight - newContentHeight
      spacer.style.height = `${deficit}px`
      // Force reflow so browser recognizes new scrollHeight before we set scrollTop
      void container.scrollHeight
      container.scrollTop = oldScrollTop
    } else {
      // Content grew or stayed same — no spacer needed, reset high water mark
      spacer.style.height = '0px'
      highWaterRef.current = {
        top: container.scrollTop,
        height: container.scrollHeight
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Shrink spacer continuously as user scrolls — any portion that goes
  // below the viewport is immediately removed, so the scrollable area
  // contracts in real time.
  useEffect(() => {
    const container = scrollContainerRef.current
    const spacer = spacerRef.current
    if (!container || !spacer) return

    const shrinkSpacer = () => {
      const spacerHeight = spacer.offsetHeight
      if (spacerHeight === 0) return

      const containerBottom = container.getBoundingClientRect().bottom
      const spacerBottom = spacer.getBoundingClientRect().bottom

      // How many pixels of the spacer extend below the visible area
      const overflow = spacerBottom - containerBottom

      if (overflow >= spacerHeight) {
        // Entire spacer is below viewport — remove it all
        spacer.style.height = '0px'
      } else if (overflow > 0) {
        // Part of spacer is below viewport — trim that part off
        spacer.style.height = `${spacerHeight - overflow}px`
      }
      // If overflow <= 0, spacer is fully visible — keep it
    }

    container.addEventListener('scroll', shrinkSpacer, { passive: true })
    return () => container.removeEventListener('scroll', shrinkSpacer)
  }, [scrollContainerRef])

  return spacerRef
}
