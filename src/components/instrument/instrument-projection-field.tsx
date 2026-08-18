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
  occlusionDepth?: number
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
  occlusionDepth = 0,
  trailFalloff = 1.8,
  trailIntensity = 0.4,
  trailLength = 8,
}: InstrumentProjectionFieldProps) {
  const animationFrameRef = useRef<number | null>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const settingsRef = useRef({ enabled, occlusionDepth, trailFalloff, trailIntensity, trailLength })
  const targetsRef = useRef(new Set<HTMLElement>())

  settingsRef.current = { enabled, occlusionDepth, trailFalloff, trailIntensity, trailLength }

  const updateTargets = useCallback(() => {
    animationFrameRef.current = null

    const originX = window.innerWidth / 2
    const originY = window.innerHeight / 2
    const maximumDistance = Math.hypot(originX, originY) || 1
    const settings = settingsRef.current
    const field = fieldRef.current
    const scaleRange = settings.enabled
      ? Math.max(settings.trailLength, 0) / maximumDistance
      : 0
    const falloff = Math.max(settings.trailFalloff, 0.1)
    const intensity = Math.max(settings.trailIntensity, 0)
    const occlusionScale = 1 + Math.max(settings.occlusionDepth, 0) / maximumDistance

    field?.style.setProperty(
      '--instrument-projector-occlusion-scale',
      occlusionScale.toFixed(6),
    )

    for (let sample = 1; sample <= INSTRUMENT_PROJECTION_RAY_COUNT; sample += 1) {
      const progress = sample / (INSTRUMENT_PROJECTION_RAY_COUNT + 1)
      const scale = 1 - scaleRange * progress
      const opacity = settings.enabled
        ? 0.075 * intensity * ((1 - progress) ** falloff)
        : 0

      field?.style.setProperty(
        `--instrument-projector-ray-scale-${sample}`,
        scale.toFixed(6),
      )
      field?.style.setProperty(
        `--instrument-projector-ray-opacity-${sample}`,
        opacity.toFixed(5),
      )
    }

    targetsRef.current.forEach((target) => {
      const bounds = target.getBoundingClientRect()

      target.style.setProperty(
        '--instrument-projector-origin-x',
        `${(originX - bounds.left).toFixed(3)}px`,
      )
      target.style.setProperty(
        '--instrument-projector-origin-y',
        `${(originY - bounds.top).toFixed(3)}px`,
      )
    })
  }, [])

  const scheduleUpdate = useCallback(() => {
    if (animationFrameRef.current !== null) return
    animationFrameRef.current = window.requestAnimationFrame(updateTargets)
  }, [updateTargets])

  const register = useCallback((node: HTMLElement) => {
    if (node.style.getPropertyValue('--instrument-projector-occlusion-scale')) {
      node.style.removeProperty('--instrument-projector-occlusion-scale')
    }
    if (node.style.getPropertyValue('--instrument-projector-ray-scale-1')) {
      for (let sample = 1; sample <= INSTRUMENT_PROJECTION_RAY_COUNT; sample += 1) {
        node.style.removeProperty(`--instrument-projector-ray-scale-${sample}`)
        node.style.removeProperty(`--instrument-projector-ray-opacity-${sample}`)
      }
    }

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
  }, [enabled, occlusionDepth, scheduleUpdate, trailFalloff, trailIntensity, trailLength])

  useEffect(() => {
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleUpdate)
    resizeObserverRef.current = resizeObserver
    targetsRef.current.forEach((target) => resizeObserver?.observe(target))

    let scrollIdleTimer: number | null = null
    let resumeFrame: number | null = null
    const handleScroll = () => {
      const field = fieldRef.current
      if (field && !field.hasAttribute('data-projection-scrolling')) {
        field.setAttribute('data-projection-scrolling', 'true')
      }

      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer)
      scrollIdleTimer = window.setTimeout(() => {
        scrollIdleTimer = null
        scheduleUpdate()
        resumeFrame = window.requestAnimationFrame(() => {
          resumeFrame = null
          fieldRef.current?.removeAttribute('data-projection-scrolling')
        })
      }, 80)
    }

    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })

    return () => {
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', handleScroll, true)
      resizeObserver?.disconnect()
      resizeObserverRef.current = null
      if (scrollIdleTimer !== null) window.clearTimeout(scrollIdleTimer)
      if (resumeFrame !== null) window.cancelAnimationFrame(resumeFrame)
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [scheduleUpdate])

  const contextValue = useMemo(() => ({ register }), [register])

  return (
    <ProjectionFieldContext.Provider value={contextValue}>
      <div ref={fieldRef} className="instrument-projection-field">
        {children}
      </div>
    </ProjectionFieldContext.Provider>
  )
}
