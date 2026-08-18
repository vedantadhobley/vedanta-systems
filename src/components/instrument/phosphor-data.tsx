import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'
import { useInstrumentProjectionTarget } from './instrument-projection-context'
import { InstrumentProjectionRays } from './instrument-projection-rays'

export type PhosphorTone = 'neutral' | 'quiet' | 'accent'

interface PhosphorDataProps {
  children: ReactNode
  className?: string
  exciteKey?: string | number
  active?: boolean
  tone?: PhosphorTone
}

interface PhosphorAfterimage {
  children: ReactNode
  id: number
}

const PHOSPHOR_AFTERIMAGE_CLEANUP_MS = 220

/**
 * Keeps accessible data sharp while aria-hidden near, far, and previous-state
 * passes emit behind it. Real layout and selection come only from the core.
 */
export function PhosphorData({
  children,
  className,
  exciteKey,
  active = false,
  tone = 'neutral',
}: PhosphorDataProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  useInstrumentProjectionTarget(rootRef)

  const contentKey = typeof children === 'string' || typeof children === 'number'
    ? children
    : 'complex'
  const responseKey = `${tone}-${String(exciteKey ?? contentKey)}`
  const previousVisualRef = useRef({ children, responseKey })
  const afterimageIdRef = useRef(0)
  const [afterimage, setAfterimage] = useState<PhosphorAfterimage | null>(null)

  useLayoutEffect(() => {
    const previous = previousVisualRef.current

    if (previous.responseKey !== responseKey) {
      afterimageIdRef.current += 1
      setAfterimage({
        children: previous.children,
        id: afterimageIdRef.current,
      })
    }

    previousVisualRef.current = { children, responseKey }
  }, [children, responseKey])

  useEffect(() => {
    if (!afterimage) return

    const activeAfterimageId = afterimage.id
    const cleanup = window.setTimeout(() => {
      setAfterimage((current) => current?.id === activeAfterimageId ? null : current)
    }, PHOSPHOR_AFTERIMAGE_CLEANUP_MS)

    return () => window.clearTimeout(cleanup)
  }, [afterimage])

  return (
    <span
      ref={rootRef}
      className={cn('instrument-data', active && 'instrument-data--active', className)}
      data-tone={tone}
    >
      <span className="instrument-data__core">{children}</span>
      <InstrumentProjectionRays
        className="instrument-data__rays"
        rayClassName="instrument-data__ray"
      >
        {children}
      </InstrumentProjectionRays>
      <span
        key={`${responseKey}-near`}
        aria-hidden="true"
        className="instrument-data__emission instrument-data__emission--near"
      >
        {children}
      </span>
      <span
        key={`${responseKey}-far`}
        aria-hidden="true"
        className="instrument-data__emission instrument-data__emission--far"
      >
        {children}
      </span>
      {afterimage && (
        <>
          <InstrumentProjectionRays
            key={`${afterimage.id}-afterimage-rays`}
            className="instrument-data__afterimage-rays"
            rayClassName="instrument-data__afterimage-ray"
          >
            {afterimage.children}
          </InstrumentProjectionRays>
          <span
            key={`${afterimage.id}-afterimage-near`}
            aria-hidden="true"
            className="instrument-data__afterimage instrument-data__afterimage--near"
          >
            {afterimage.children}
          </span>
          <span
            key={`${afterimage.id}-afterimage-far`}
            aria-hidden="true"
            className="instrument-data__afterimage instrument-data__afterimage--far"
          >
            {afterimage.children}
          </span>
        </>
      )}
    </span>
  )
}
