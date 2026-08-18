import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type PhosphorTone = 'neutral' | 'quiet' | 'accent'

interface PhosphorDataProps {
  children: ReactNode
  className?: string
  exciteKey?: string | number
  active?: boolean
  tone?: PhosphorTone
}

/**
 * Keeps the accessible data sharp and adds a disposable, aria-hidden emission
 * copy behind it. Real layout and selection always come from the core layer.
 */
export function PhosphorData({
  children,
  className,
  exciteKey = 0,
  active = false,
  tone = 'neutral',
}: PhosphorDataProps) {
  const emissionKey = `${tone}-${String(exciteKey)}`

  return (
    <span
      className={cn('instrument-data', active && 'instrument-data--active', className)}
      data-tone={tone}
    >
      <span className="instrument-data__core">{children}</span>
      <span
        key={`${emissionKey}-near`}
        aria-hidden="true"
        className="instrument-data__emission instrument-data__emission--near"
      >
        {children}
      </span>
      <span
        key={`${emissionKey}-far`}
        aria-hidden="true"
        className="instrument-data__emission instrument-data__emission--far"
      >
        {children}
      </span>
    </span>
  )
}
