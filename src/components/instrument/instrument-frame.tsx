import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from 'react'

import { cn } from '@/lib/utils'
import { useInstrumentProjectionTarget } from './instrument-projection-context'

type InstrumentFrameProps = HTMLAttributes<HTMLDivElement>

/** A settled, crisp surface-plane frame. It never owns phosphor effects. */
export const InstrumentFrame = forwardRef<HTMLDivElement, InstrumentFrameProps>(
  function InstrumentFrame({ children, className, ...props }, ref) {
    const projectionRef = useRef<HTMLDivElement>(null)
    useInstrumentProjectionTarget(projectionRef)
    useImperativeHandle(ref, () => projectionRef.current as HTMLDivElement)

    return (
      <div ref={projectionRef} className={cn('instrument-frame', className)} {...props}>
        <span className="instrument-frame__rear-field" aria-hidden="true" />
        <span className="instrument-frame__projected-occlusion" aria-hidden="true" />
        <span className="instrument-frame__surface" aria-hidden="true" />
        <div className="instrument-frame__content">{children}</div>
      </div>
    )
  },
)
