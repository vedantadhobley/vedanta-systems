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
 * Usage:
 *   const spacerRef = useScrollStabilizer(scrollContainerRef, [dependencies])
 *   // Render: <div ref={spacerRef} /> at the bottom of scrollable content
 */
export function useScrollStabilizer(
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  deps: React.DependencyList
) {
  const spacerRef = useRef<HTMLDivElement>(null)
  const savedScrollTopRef = useRef(0)
  const savedScrollHeightRef = useRef(0)

  // Continuously track scroll position so we always have the latest
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const onScroll = () => {
      savedScrollTopRef.current = container.scrollTop
      savedScrollHeightRef.current = container.scrollHeight
    }

    // Capture initial
    onScroll()

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [scrollContainerRef])

  // useLayoutEffect runs synchronously after DOM mutation, BEFORE browser paint.
  // This means we can set the spacer height and restore scrollTop before the
  // user sees any visual snap.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    const spacer = spacerRef.current
    if (!container || !spacer) return

    const oldScrollTop = savedScrollTopRef.current
    const oldScrollHeight = savedScrollHeightRef.current

    // Current content height (minus any existing spacer)
    const currentSpacerHeight = spacer.offsetHeight
    const newContentHeight = container.scrollHeight - currentSpacerHeight

    if (oldScrollHeight > 0 && oldScrollTop > 0 && newContentHeight < oldScrollHeight) {
      // Content shrank — add phantom space to preserve scroll position
      const deficit = oldScrollHeight - newContentHeight
      spacer.style.height = `${deficit}px`
      container.scrollTop = oldScrollTop
    } else {
      spacer.style.height = '0px'
    }

    // Update saved values after adjustment
    savedScrollTopRef.current = container.scrollTop
    savedScrollHeightRef.current = container.scrollHeight
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
