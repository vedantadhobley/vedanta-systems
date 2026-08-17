import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export type InstrumentFrameTone = 'neutral' | 'accent' | 'live'

interface InstrumentFrameProps extends HTMLAttributes<HTMLDivElement> {
  tone?: InstrumentFrameTone
}

/** A settled, crisp surface-plane frame. It never owns phosphor effects. */
export const InstrumentFrame = forwardRef<HTMLDivElement, InstrumentFrameProps>(
  function InstrumentFrame({ children, className, tone = 'neutral', ...props }, ref) {
    return (
      <div ref={ref} className={cn('instrument-frame', className)} data-frame-tone={tone} {...props}>
        <span className="instrument-frame__surface" aria-hidden="true" />
        <div className="instrument-frame__content">{children}</div>
      </div>
    )
  },
)
