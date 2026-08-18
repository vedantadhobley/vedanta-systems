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
import { useInstrumentProjectionTarget } from './instrument-projection-context'
import { InstrumentProjectionRays } from './instrument-projection-rays'

interface StepSequence {
  destinationExpanded: boolean
  id: number
  from: number
  middle: number
  phase: 0 | 1 | 2 | 3
  to: number
}

const DEFAULT_STEP_ZOOM_BEAT_MS = 100
const STEP_ZOOM_AFTERGLOW_MS = 200

export type InstrumentFrameBehavior = 'handoff' | 'persistent'

interface InstrumentDisclosureProps {
  children: ReactNode
  className?: string
  contentId: string
  disabled?: boolean
  expanded: boolean
  frameBehavior?: InstrumentFrameBehavior
  onExpandedChange: (expanded: boolean) => void
  stepBeatMs?: number
  summary: ReactNode
}

interface StepAfterimageProps {
  from: number
  id: string
  to?: number
}

function StepRegistration({ height }: { height: number }) {
  const registrationRef = useRef<HTMLSpanElement>(null)
  useInstrumentProjectionTarget(registrationRef)

  return (
    <span
      ref={registrationRef}
      className="instrument-step-zoom__registration"
      style={{ height }}
    >
      <span className="instrument-step-zoom__core" />
      <InstrumentProjectionRays
        className="instrument-step-zoom__rays"
        rayClassName="instrument-step-zoom__ray"
      />
      <span
        className="instrument-step-zoom__emission instrument-step-zoom__emission--near"
      />
      <span
        className="instrument-step-zoom__emission instrument-step-zoom__emission--far"
      />
    </span>
  )
}

function StepAfterimage({ from, id, to }: StepAfterimageProps) {
  const afterimageRef = useRef<HTMLSpanElement>(null)
  useInstrumentProjectionTarget(afterimageRef)

  const fullFrame = to === undefined
  const contraction = to !== undefined && from > to
  const height = fullFrame ? from : Math.max(from, to)
  const style = {
    height,
    '--instrument-step-previous-height': `${from}px`,
    '--instrument-step-next-height': `${to ?? from}px`,
  } as CSSProperties

  return (
    <span
      ref={afterimageRef}
      className="instrument-step-zoom__afterimage"
      data-contraction={contraction ? 'true' : undefined}
      data-kind={fullFrame ? 'full' : 'difference'}
      style={style}
    >
      <InstrumentProjectionRays
        className="instrument-step-zoom__afterimage-rays"
        rayClassName="instrument-step-zoom__afterimage-ray"
      >
        {fullFrame ? (
          <span className="instrument-step-zoom__afterimage-ray-frame" />
        ) : (
          <>
            <span className="instrument-step-zoom__afterimage-edge instrument-step-zoom__afterimage-edge--bottom" />
            {contraction && (
              <>
                <span className="instrument-step-zoom__afterimage-edge instrument-step-zoom__afterimage-edge--left" />
                <span className="instrument-step-zoom__afterimage-edge instrument-step-zoom__afterimage-edge--right" />
              </>
            )}
          </>
        )}
      </InstrumentProjectionRays>
      {(['near', 'far'] as const).map((pass) => (
        <span
          key={`${id}-${pass}`}
          className={`instrument-step-zoom__afterimage-pass instrument-step-zoom__afterimage-pass--${pass}`}
        >
          {!fullFrame && (
            <>
              <span className="instrument-step-zoom__afterimage-edge instrument-step-zoom__afterimage-edge--bottom" />
              {contraction && (
                <>
                  <span className="instrument-step-zoom__afterimage-edge instrument-step-zoom__afterimage-edge--left" />
                  <span className="instrument-step-zoom__afterimage-edge instrument-step-zoom__afterimage-edge--right" />
                </>
              )}
            </>
          )}
        </span>
      ))}
    </span>
  )
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
  frameBehavior = 'persistent',
  onExpandedChange,
  stepBeatMs = DEFAULT_STEP_ZOOM_BEAT_MS,
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
          destinationExpanded: expanded,
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

    const arrivalMs = stepBeatMs * 3

    const middleBeat = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId
        ? { ...current, phase: 1 }
        : current)
    }, stepBeatMs)
    const destinationBeat = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId
        ? { ...current, phase: 2 }
        : current)
    }, stepBeatMs * 2)
    const arrival = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId
        ? { ...current, phase: 3 }
        : current)
    }, arrivalMs)
    const cleanup = window.setTimeout(() => {
      setSequence((current) => current?.id === activeSequenceId ? null : current)
    }, arrivalMs + STEP_ZOOM_AFTERGLOW_MS)

    return () => {
      window.clearTimeout(middleBeat)
      window.clearTimeout(destinationBeat)
      window.clearTimeout(arrival)
      window.clearTimeout(cleanup)
    }
  }, [activeSequenceId, stepBeatMs])

  const stepHeight = sequence
    ? [sequence.from, sequence.middle, sequence.to, sequence.to][sequence.phase]
    : 0
  const transitionFrameHeight = sequence
    ? sequence.phase < 3 ? Math.max(sequence.from, sequence.to) : sequence.to
    : 0
  const afterimages: StepAfterimageProps[] = sequence
    ? [
        ...(sequence.phase >= 1
          ? [{ id: 'source', from: sequence.from, to: sequence.middle }]
          : []),
        ...(sequence.phase >= 2
          ? [{ id: 'middle', from: sequence.middle, to: sequence.to }]
          : []),
        ...(sequence.phase >= 3
          ? [{ id: 'destination', from: sequence.to }]
          : []),
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
        data-frame-behavior={frameBehavior}
        data-transition-direction={transitioning && sequence
          ? sequence.destinationExpanded ? 'expand' : 'contract'
          : undefined}
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
            <span className="instrument-step-zoom__aperture">
              <span className="instrument-step-zoom__overscan">
                {sequence.phase < 3 ? (
                  <StepRegistration height={stepHeight} />
                ) : null}

                {afterimages.map(({ id, from, to }) => (
                  <StepAfterimage
                    key={`${sequence.id}-${id}`}
                    from={from}
                    id={`${sequence.id}-${id}`}
                    to={to}
                  />
                ))}
              </span>
            </span>
          </span>
        )}

        <div className="instrument-disclosure__aperture">
          <div className="instrument-disclosure__data-plane">
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
