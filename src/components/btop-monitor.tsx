import { cn } from '@/lib/utils'

interface BtopMonitorProps {
  className?: string
  /** Server identifier - for future multi-server support */
  server?: string
}

// btop terminal dimensions: 132 cols x 43 rows
// CSS Grid viewer: 6px wide x 12px tall cells
// Aspect ratio: (132*6) / (43*12) = 792/516 ≈ 1.534
const DEFAULT_ASPECT_RATIO = 1.534

export function BtopMonitor({ 
  className, 
  server = 'local',
}: BtopMonitorProps) {
  // No loading/error states - viewer.html handles everything with its own skeleton grid
  // The iframe shows immediately and the viewer manages its own connection state

  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-lg bg-black w-full",
        className
      )}
      style={{ 
        // Fixed aspect ratio for CSS Grid terminal
        aspectRatio: DEFAULT_ASPECT_RATIO,
      }}
    >
      {/* btop viewer iframe - viewer.html handles skeleton/loading/reconnect */}
      <iframe
        src="/api/btop/"
        className="absolute inset-0 w-full h-full border-0"
        title={`System Monitor - ${server}`}
      />
    </div>
  )
}
