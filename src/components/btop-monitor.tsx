import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface BtopMonitorProps {
  className?: string
  /** Server identifier - for future multi-server support */
  server?: string
}

export function BtopMonitor({ className, server = 'local' }: BtopMonitorProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Reset state on mount or server change
  useEffect(() => {
    setIsLoading(true)
    setHasError(false)
  }, [server])

  // For now, all servers use /btop/ - future: /btop/{server}/
  const btopUrl = '/btop/'

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
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

      {/* btop wrapper iframe */}
      <iframe
        src={btopUrl}
        title={`System Monitor - ${server}`}
        className={cn(
          "w-full border-0 bg-black transition-opacity duration-300",
          isLoading ? "opacity-0" : "opacity-100"
        )}
        style={{ height: '500px' }}
        onLoad={() => setTimeout(() => setIsLoading(false), 200)}
        onError={() => {
          setIsLoading(false)
          setHasError(true)
        }}
      />
    </div>
  )
}
