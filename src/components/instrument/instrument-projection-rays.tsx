import { type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const INSTRUMENT_PROJECTION_RAY_COUNT = 24

const projectionRaySamples = Array.from(
  { length: INSTRUMENT_PROJECTION_RAY_COUNT },
  (_, index) => index + 1,
)

interface InstrumentProjectionRaysProps {
  children?: ReactNode
  className?: string
  rayClassName?: string
}

/**
 * Draws a dense set of low-luminance samples behind one projected source.
 * The field supplies a center-relative scale and opacity for every sample.
 */
export function InstrumentProjectionRays({
  children,
  className,
  rayClassName,
}: InstrumentProjectionRaysProps) {
  return (
    <span aria-hidden="true" className={cn('instrument-projection-rays', className)}>
      {projectionRaySamples.map((sample) => (
        <span
          key={sample}
          className={cn('instrument-projection-ray', rayClassName)}
          style={{
            opacity: `var(--instrument-projector-ray-opacity-${sample}, 0)`,
            transform: `scale(var(--instrument-projector-ray-scale-${sample}, 1))`,
          }}
        >
          {children}
        </span>
      ))}
    </span>
  )
}
