import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'
import { InstrumentFrame, type InstrumentFrameTone } from './instrument-frame'

interface StepSequence {
  id: number
  from: number
  middle: number
  to: number
}

const STEP_ZOOM_CLEANUP_MS = 520

interface InstrumentDisclosureProps {
  children: ReactNode
  className?: string
  contentId: string
  disabled?: boolean
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  summary: ReactNode
  tone?: InstrumentFrameTone
}

/**
 * A controlled disclosure whose real frame cuts directly to its new geometry.
 * Three short emission-plane registrations describe the semantic scale change.
 */
export function InstrumentDisclosure({
  children,
  className,
  contentId,
  disabled = false,
  expanded,
  onExpandedChange,
  summary,
  tone = 'neutral',
}: InstrumentDisclosureProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingFromHeightRef = useRef<number | null>(null)
  const previousHeightRef = useRef<number | null>(null)
  const previousExpandedRef = useRef(expanded)
  const sequenceIdRef = useRef(0)
  const [sequence, setSequence] = useState<StepSequence | null>(null)

  const toggle = () => {
    if (disabled) return
    pendingFromHeightRef.current = rootRef.current?.getBoundingClientRect().height ?? null
    onExpandedChange(!expanded)
  }

  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node) return

    const nextHeight = node.getBoundingClientRect().height
    if (previousExpandedRef.current !== expanded) {
      const from = pendingFromHeightRef.current ?? previousHeightRef.current ?? nextHeight
      const middle = from + (nextHeight - from) * 0.56

      sequenceIdRef.current += 1
      setSequence({
        id: sequenceIdRef.current,
        from,
        middle,
        to: nextHeight,
      })
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
        previousHeightRef.current = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [expanded])

  useEffect(() => {
    if (!sequence) return

    const sequenceId = sequence.id
    const cleanup = window.setTimeout(() => {
      setSequence((current) => current?.id === sequenceId ? null : current)
    }, STEP_ZOOM_CLEANUP_MS)

    return () => window.clearTimeout(cleanup)
  }, [sequence])

  return (
    <InstrumentFrame
      ref={rootRef}
      className={cn('instrument-disclosure', className)}
      data-expanded={expanded}
      tone={tone}
    >
      {sequence && (
        <span key={sequence.id} className="instrument-step-zoom" aria-hidden="true">
          <span className="instrument-step-zoom__beat instrument-step-zoom__beat--one" style={{ height: sequence.from }} />
          <span className="instrument-step-zoom__beat instrument-step-zoom__beat--two" style={{ height: sequence.middle }} />
          <span className="instrument-step-zoom__beat instrument-step-zoom__beat--three" style={{ height: sequence.to }} />
        </span>
      )}

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
    </InstrumentFrame>
  )
}
