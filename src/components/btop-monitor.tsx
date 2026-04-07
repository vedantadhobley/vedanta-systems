import { cn } from '@/lib/utils'

interface BtopMonitorProps {
  className?: string
  /** Display label for the node */
  label?: string
  /** API path prefix (e.g., "/api/btop" or "/api/btop-joi") */
  apiPrefix?: string
}

// btop terminal dimensions: 132 cols x 43 rows
// CSS Grid viewer: 6px wide x 12px tall cells
// Aspect ratio: (132*6) / (43*12) = 792/516 ≈ 1.534
const DEFAULT_ASPECT_RATIO = 1.534

export function BtopMonitor({
  className,
  label = 'local',
  apiPrefix = '/api/btop',
}: BtopMonitorProps) {
  // No loading/error states - viewer.html handles everything with its own skeleton grid
  // The iframe shows immediately and the viewer manages its own connection state

  return (
    <div className={cn(className)}>
      {/* Node label */}
      <div className="text-corpo-text/50 text-sm font-mono font-light mb-1 uppercase tracking-wider">
        {label}
      </div>
      <div
        className="relative overflow-hidden rounded-lg bg-black w-full"
        style={{ aspectRatio: DEFAULT_ASPECT_RATIO }}
      >
        <iframe
          src={`${apiPrefix}/`}
          className="absolute inset-0 w-full h-full border-0"
          title={`System Monitor - ${label}`}
        />
      </div>
    </div>
  )
}
