import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { PhosphorData, type PhosphorTone } from './phosphor-data'

interface InstrumentActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  exciteKey?: string | number
  tone?: PhosphorTone
}

/** A composite control: crisp hit surface with an emitted label. */
export function InstrumentAction({
  children,
  className,
  exciteKey,
  tone = 'neutral',
  type = 'button',
  ...props
}: InstrumentActionProps) {
  return (
    <button type={type} className={cn('instrument-action', className)} onTouchStart={() => {}} {...props}>
      <span className="instrument-action__surface" aria-hidden="true" />
      <PhosphorData exciteKey={exciteKey} tone={tone}>{children}</PhosphorData>
    </button>
  )
}
