import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type InstrumentFrameProps = HTMLAttributes<HTMLDivElement>

/** A settled, crisp surface-plane frame. It never owns phosphor effects. */
export const InstrumentFrame = forwardRef<HTMLDivElement, InstrumentFrameProps>(
  function InstrumentFrame({ children, className, ...props }, ref) {
    return (
      <div ref={ref} className={cn('instrument-frame', className)} {...props}>
        <span className="instrument-frame__surface" aria-hidden="true" />
        <div className="instrument-frame__content">{children}</div>
      </div>
    )
  },
)
