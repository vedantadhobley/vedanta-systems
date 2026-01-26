import { RiTerminalBoxLine, RiTerminalBoxFill, RiFileTextLine, RiFileTextFill } from '@remixicon/react'
import { cn } from '@/lib/utils'
import { ReadmeViewer, useReadme } from './readme-viewer'

interface ProjectStatusProps {
  githubUrl: string
  isConnected?: boolean  // Optional - only show connection status if provided
  comingSoon?: boolean   // Optional - show "interface coming soon" message
}

export function ProjectStatus({ githubUrl, isConnected, comingSoon }: ProjectStatusProps) {
  const showConnection = isConnected !== undefined
  const { showReadme, setShowReadme, readme, loadingReadme, fetchReadme } = useReadme(githubUrl)

  return (
    <>
      <div className="flex items-center gap-3 md:gap-6 mb-6 font-mono">
        {/* Connection status with ping animation - first on mobile */}
        {showConnection && (
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="relative flex h-2 w-2">
              <span className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                isConnected && "animate-ping",
                isConnected ? "bg-lavender" : "bg-corpo-text/50"
              )} />
              <span className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                isConnected ? "bg-lavender" : "bg-corpo-text/50"
              )} />
            </span>
            <span className={cn(
              "uppercase tracking-wider text-xs md:text-sm",
              isConnected ? "text-lavender" : "text-corpo-text/50"
            )}>
              {isConnected ? 'online' : 'offline'}
            </span>
          </div>
        )}

        {/* Divider */}
        {showConnection && (
          <span className="text-corpo-border/50">/</span>
        )}

        {/* README button */}
        <button
          onClick={fetchReadme}
          onTouchStart={() => {}} // Required for iOS :active to work
          className="nav-btn flex items-center gap-1.5 md:gap-2"
        >
          <RiFileTextLine className="icon-line w-4 h-4 md:w-5 md:h-5" />
          <RiFileTextFill className="icon-fill w-4 h-4 md:w-5 md:h-5" />
          <span className="uppercase tracking-wider text-xs md:text-sm">readme</span>
        </button>

        {/* Divider */}
        <span className="text-corpo-border/50">/</span>

        {/* Repository link */}
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          onTouchStart={() => {}} // Required for iOS :active to work
          className="nav-btn flex items-center gap-1.5 md:gap-2"
        >
          <RiTerminalBoxLine className="icon-line w-4 h-4 md:w-5 md:h-5" />
          <RiTerminalBoxFill className="icon-fill w-4 h-4 md:w-5 md:h-5" />
          <span className="uppercase tracking-wider text-xs md:text-sm">repository</span>
        </a>
      </div>

      {/* Coming soon message for projects without interfaces */}
      {comingSoon && (
        <div className="text-corpo-text/40 font-mono font-light mb-6" style={{ fontSize: 'var(--text-size-base)' }}>
          interface under construction
        </div>
      )}

      {/* README Modal */}
      <ReadmeViewer
        isOpen={showReadme}
        onClose={() => setShowReadme(false)}
        content={readme}
        isLoading={loadingReadme}
      />
    </>
  )
}
