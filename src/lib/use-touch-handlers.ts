import { useState, useCallback, useRef } from 'react'

/**
 * Hook for handling hover/active states that work correctly on both mouse and touch devices.
 * 
 * The problem: On touch devices, browsers fire simulated mouse events AFTER touch events,
 * causing elements to get stuck in hover state after a tap.
 * 
 * The solution: Track recent touch activity and ignore mouse events that fire shortly after touch.
 */
export function useTouchHandlers() {
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const recentTouchRef = useRef(false)

  const onMouseEnter = useCallback(() => {
    // Ignore simulated mouse events after touch
    if (recentTouchRef.current) return
    setIsHovered(true)
  }, [])

  const onMouseLeave = useCallback(() => {
    // Ignore simulated mouse events after touch
    if (recentTouchRef.current) return
    setIsHovered(false)
    setIsActive(false)
  }, [])

  const onMouseDown = useCallback(() => {
    setIsActive(true)
  }, [])

  const onMouseUp = useCallback(() => {
    setIsActive(false)
  }, [])

  const onTouchStart = useCallback(() => {
    recentTouchRef.current = true
    setIsActive(true)
    setIsHovered(false)
  }, [])

  const onTouchEnd = useCallback(() => {
    setIsActive(false)
    setIsHovered(false)
    // Keep blocking mouse events for a brief period after touch ends
    // This prevents the simulated mouseenter from firing
    setTimeout(() => {
      recentTouchRef.current = false
    }, 300)
  }, [])

  const onTouchCancel = useCallback(() => {
    setIsActive(false)
    setIsHovered(false)
    setTimeout(() => {
      recentTouchRef.current = false
    }, 300)
  }, [])

  return {
    isHovered,
    isActive,
    handlers: {
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onMouseUp,
      onTouchStart,
      onTouchEnd,
      onTouchCancel,
    }
  }
}

/**
 * Simpler version - just returns the handlers with external state management
 * Use this when you need multiple hover states in one component
 */
export function createTouchHandlers(
  setIsHovered: (v: boolean) => void,
  setIsActive: (v: boolean) => void
) {
  let recentTouch = false

  return {
    onMouseEnter: () => {
      if (recentTouch) return
      setIsHovered(true)
    },
    onMouseLeave: () => {
      if (recentTouch) return
      setIsHovered(false)
      setIsActive(false)
    },
    onMouseDown: () => setIsActive(true),
    onMouseUp: () => setIsActive(false),
    onTouchStart: () => {
      recentTouch = true
      setIsActive(true)
      setIsHovered(false)
    },
    onTouchEnd: () => {
      setIsActive(false)
      setIsHovered(false)
      setTimeout(() => { recentTouch = false }, 300)
    },
    onTouchCancel: () => {
      setIsActive(false)
      setIsHovered(false)
      setTimeout(() => { recentTouch = false }, 300)
    },
  }
}
