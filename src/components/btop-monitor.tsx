import { useState, useEffect, useRef } from 'react'
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
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Check if btop is available
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/btop/health')
        if (response.ok) {
          setIsLoading(false)
          setHasError(false)
        } else {
          setHasError(true)
          setIsLoading(false)
        }
      } catch {
        setHasError(true)
        setIsLoading(false)
      }
    }
    
    checkHealth()
    // Re-check periodically in case it comes back up
    const interval = setInterval(checkHealth, 10000)
    return () => clearInterval(interval)
  }, [server])

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
      {/* Loading overlay */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex items-center gap-2 text-corpo-text/50 font-mono text-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-lavender opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lavender" />
            </span>
            loading system monitor...
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-corpo-text/50 font-mono text-sm">
            system monitor unavailable
          </div>
        </div>
      )}

      {/* btop viewer iframe - CSS Grid handles the rendering */}
      {!hasError && (
        <iframe
          ref={iframeRef}
          src="/api/btop/"
          className={cn(
            "absolute inset-0 w-full h-full border-0 transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setIsLoading(false)}
          onError={() => setHasError(true)}
          title={`System Monitor - ${server}`}
        />
      )}
    </div>
  )
}
