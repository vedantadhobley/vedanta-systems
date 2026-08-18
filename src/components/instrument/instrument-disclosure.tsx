import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'
import { InstrumentFrame } from './instrument-frame'

interface StepSequence {
  id: number
  from: number
  middle: number
  phase: 0 | 1 | 2 | 3
  to: number
}

const STEP_ZOOM_BEAT_MS = 120
const STEP_ZOOM_AFTERGLOW_MS = 200
const STEP_ZOOM_ARRIVAL_MS = STEP_ZOOM_BEAT_MS * 3
const STEP_ZOOM_CLEANUP_MS = STEP_ZOOM_ARRIVAL_MS + STEP_ZOOM_AFTERGLOW_MS

interface InstrumentDisclosureProps {
  children: ReactNode
  className?: string
  contentId: string
  disabled?: boolean
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  summary: ReactNode
}

/**
 * A controlled disclosure that keeps a foreground aperture above one
 * three-position emission frame while application layout updates underneath.
 */
export function InstrumentDisclosure({
  children,
  className,
  contentId,
  disabled = false,
  expanded,
  onExpandedChange,
  summary,
}: InstrumentDisclosureProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingFromHeightRef = useRef<number | null>(null)
  const previousHeightRef = useRef<number | null>(null)
  const previousExpandedRef = useRef(expanded)
  const sequenceIdRef = useRef(0)
  const [sequence, setSequence] = useState<StepSequence | null>(null)
  const transitioning = Boolean(sequence && sequence.phase < 3)
  const reservedCollapseHeight = transitioning && sequence && sequence.from > sequence.to
    ? sequence.from
    : undefined

  const toggle = () => {
    if (disabled) return
    pendingFromHeightRef.current = rootRef.current?.getBoundingClientRect().height ?? null
    onExpandedChange(!expanded)
  }

  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node) return

    const nextHeight = Math.round(node.getBoundingClientRect().height)
    if (previousExpandedRef.current !== expanded) {
      const from = pendingFromHeightRef.current ?? previousHeightRef.current ?? nextHeight
      const middle = Math.round(from + (nextHeight - from) * 0.56)

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setSequence(null)
      } else {
        sequenceIdRef.current += 1
        setSequence({
          id: sequenceIdRef.current,
          from: Math.round(from),
          middle,
          phase: 0,
          to: nextHeight,
        })
      }
      previousExpandedRef.current = expanded
      pendingFromHeightRef.current = null
    }

    previousHeightRef.current = nextHeight
  }, [expanded])

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      if (previousExpandedRef.current === expanded) {
        previousHeightRef.current = Math.round(
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
        )
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [expanded])

  const activeSequenceId = sequence?.id

  useEffect(() => {
    if (activeSequenceId === undefined) return

    const middleBeat = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId
        ? { ...current, phase: 1 }
        : current)
    }, STEP_ZOOM_BEAT_MS)
    const destinationBeat = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId
        ? { ...current, phase: 2 }
        : current)
    }, STEP_ZOOM_BEAT_MS * 2)
    const arrival = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId
        ? { ...current, phase: 3 }
        : current)
    }, STEP_ZOOM_ARRIVAL_MS)
    const cleanup = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId ? null : current)
    }, STEP_ZOOM_CLEANUP_MS)

    return () => {
      window.clearTimeout(middleBeat)
      window.clearTimeout(destinationBeat)
      window.clearTimeout(arrival)
      window.clearTimeout(cleanup)
    }
  }, [activeSequenceId])

  const stepHeight = sequence
    ? [sequence.from, sequence.middle, sequence.to, sequence.to][sequence.phase]
    : 0
  const transitionFrameHeight = sequence
    ? sequence.phase < 3 ? Math.max(sequence.from, sequence.to) : sequence.to
    : 0
  const afterimageHeights = sequence
    ? [
        ...(sequence.phase >= 1 ? [{ id: 'source', height: sequence.from }] : []),
        ...(sequence.phase >= 2 ? [{ id: 'middle', height: sequence.middle }] : []),
        ...(sequence.phase >= 3 ? [{ id: 'destination', height: sequence.to }] : []),
      ]
    : []

  return (
    <div
      className={cn('instrument-disclosure-layout', className)}
      style={reservedCollapseHeight ? { minHeight: reservedCollapseHeight } : undefined}
    >
      <InstrumentFrame
        ref={rootRef}
        className="instrument-disclosure"
        data-expanded={expanded}
        data-transitioning={transitioning ? 'true' : undefined}
        style={sequence ? {
          '--instrument-disclosure-transition-height': `${Math.max(sequence.from, sequence.to)}px`,
        } as CSSProperties : undefined}
      >
        {sequence && (
          <span
            key={sequence.id}
            className="instrument-step-zoom"
            data-step={sequence.phase < 3 ? sequence.phase + 1 : 'afterglow'}
            aria-hidden="true"
            style={{ height: transitionFrameHeight }}
          >
            {sequence.phase < 3 ? (
              <span className="instrument-step-zoom__registration" style={{ height: stepHeight }}>
                <span className="instrument-step-zoom__core" />
                <span
                  key={`${sequence.id}-${sequence.phase}-near`}
                  className="instrument-step-zoom__emission instrument-step-zoom__emission--near"
                />
                <span
                  key={`${sequence.id}-${sequence.phase}-far`}
                  className="instrument-step-zoom__emission instrument-step-zoom__emission--far"
                />
              </span>
            ) : null}

            {afterimageHeights.map(({ id, height }) => (
              <span
                key={`${sequence.id}-${id}`}
                className="instrument-step-zoom__afterimage"
                style={{ height }}
              >
                <span className="instrument-step-zoom__afterimage-pass instrument-step-zoom__afterimage-pass--near" />
                <span className="instrument-step-zoom__afterimage-pass instrument-step-zoom__afterimage-pass--far" />
              </span>
            ))}
          </span>
        )}

        <div className="instrument-disclosure__aperture">
          <div className="instrument-disclosure__crt-plane">
            <button
              type="button"
              aria-controls={contentId}
              aria-expanded={expanded}
              className="instrument-disclosure__toggle"
              disabled={disabled}
              onClick={toggle}
              onTouchStart={() => {}}
            >
              {summary}
            </button>

            {expanded && (
              <div id={contentId} className="instrument-disclosure__content">
                {children}
              </div>
            )}
          </div>
        </div>
      </InstrumentFrame>
    </div>
  )
}
