import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

import { ProjectionFieldContext } from './instrument-projection-context'
import { INSTRUMENT_PROJECTION_RAY_COUNT } from './instrument-projection-rays'

interface InstrumentProjectionFieldProps {
  children: ReactNode
  enabled?: boolean
  trailFalloff?: number
  trailIntensity?: number
  trailLength?: number
}

/**
 * Gives every registered emission source sampled rays converging on one
 * viewport origin. Readable cores and local bloom stay fixed; only the
 * low-luminance ray copies use the generated scales.
 */
export function InstrumentProjectionField({
  children,
  enabled = true,
  trailFalloff = 1.8,
  trailIntensity = 0.4,
  trailLength = 8,
}: InstrumentProjectionFieldProps) {
  const animationFrameRef = useRef<number | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const settingsRef = useRef({ enabled, trailFalloff, trailIntensity, trailLength })
  const targetsRef = useRef(new Set<HTMLElement>())

  settingsRef.current = { enabled, trailFalloff, trailIntensity, trailLength }

  const updateTargets = useCallback(() => {
    animationFrameRef.current = null

    const originX = window.innerWidth / 2
    const originY = window.innerHeight / 2
    const maximumDistance = Math.hypot(originX, originY) || 1
    const settings = settingsRef.current

    targetsRef.current.forEach((target) => {
      const bounds = target.getBoundingClientRect()
      const scaleRange = settings.enabled
        ? Math.max(settings.trailLength, 0) / maximumDistance
        : 0
      const falloff = Math.max(settings.trailFalloff, 0.1)
      const intensity = Math.max(settings.trailIntensity, 0)

      target.style.setProperty(
        '--instrument-projector-origin-x',
        `${(originX - bounds.left).toFixed(3)}px`,
      )
      target.style.setProperty(
        '--instrument-projector-origin-y',
        `${(originY - bounds.top).toFixed(3)}px`,
      )

      for (let sample = 1; sample <= INSTRUMENT_PROJECTION_RAY_COUNT; sample += 1) {
        const progress = sample / (INSTRUMENT_PROJECTION_RAY_COUNT + 1)
        const scale = 1 - scaleRange * progress
        const opacity = settings.enabled
          ? 0.075 * intensity * ((1 - progress) ** falloff)
          : 0

        target.style.setProperty(
          `--instrument-projector-ray-scale-${sample}`,
          scale.toFixed(6),
        )
        target.style.setProperty(
          `--instrument-projector-ray-opacity-${sample}`,
          opacity.toFixed(5),
        )
      }
    })
  }, [])

  const scheduleUpdate = useCallback(() => {
    if (animationFrameRef.current !== null) return
    animationFrameRef.current = window.requestAnimationFrame(updateTargets)
  }, [updateTargets])

  const register = useCallback((node: HTMLElement) => {
    targetsRef.current.add(node)
    resizeObserverRef.current?.observe(node)
    scheduleUpdate()

    return () => {
      targetsRef.current.delete(node)
      resizeObserverRef.current?.unobserve(node)
    }
  }, [scheduleUpdate])

  useLayoutEffect(() => {
    scheduleUpdate()
  }, [enabled, scheduleUpdate, trailFalloff, trailIntensity, trailLength])

  useEffect(() => {
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleUpdate)
    resizeObserverRef.current = resizeObserver
    targetsRef.current.forEach((target) => resizeObserver?.observe(target))

    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)

    return () => {
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      resizeObserver?.disconnect()
      resizeObserverRef.current = null
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [scheduleUpdate])

  const contextValue = useMemo(() => ({ register }), [register])

  return (
    <ProjectionFieldContext.Provider value={contextValue}>
      {children}
    </ProjectionFieldContext.Provider>
  )
}
