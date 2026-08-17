import {
  RiArrowLeftSFill,
  RiArrowLeftSLine,
  RiArrowRightSFill,
  RiArrowRightSLine,
  RiContractUpDownFill,
  RiContractUpDownLine,
  RiExpandUpDownFill,
  RiExpandUpDownLine,
  RiHourglass2Fill,
  RiHourglass2Line,
  RiScan2Line,
  RiSearchFill,
  RiSearchLine,
  type RemixiconComponentType,
} from '@remixicon/react'

import { cn } from '@/lib/utils'

export type InstrumentIconName =
  | 'collapse'
  | 'expand'
  | 'extract'
  | 'next'
  | 'previous'
  | 'search'
  | 'validate'

const icons: Record<InstrumentIconName, { line: RemixiconComponentType; fill: RemixiconComponentType }> = {
  collapse: { line: RiContractUpDownLine, fill: RiContractUpDownFill },
  expand: { line: RiExpandUpDownLine, fill: RiExpandUpDownFill },
  extract: { line: RiScan2Line, fill: RiScan2Line },
  next: { line: RiArrowRightSLine, fill: RiArrowRightSFill },
  previous: { line: RiArrowLeftSLine, fill: RiArrowLeftSFill },
  search: { line: RiSearchLine, fill: RiSearchFill },
  validate: { line: RiHourglass2Line, fill: RiHourglass2Fill },
}

interface InstrumentIconProps {
  name: InstrumentIconName
  className?: string
}

/** Semantic icon names isolate project components from the current icon pack. */
export function InstrumentIcon({ name, className }: InstrumentIconProps) {
  const IconLine = icons[name].line
  const IconFill = icons[name].fill

  return (
    <span className={cn('instrument-icon', className)} aria-hidden="true">
      <IconLine className="instrument-icon__line" />
      <IconFill className="instrument-icon__fill" />
    </span>
  )
}
