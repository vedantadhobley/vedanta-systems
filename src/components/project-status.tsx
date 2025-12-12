import { RiTerminalBoxLine, RiFileTextLine } from '@remixicon/react'
import { cn } from '@/lib/utils'
import { ReadmeViewer, useReadme } from './readme-viewer'

interface ProjectStatusProps {
  githubUrl: string
  isConnected?: boolean  // Optional - only show connection status if provided
  connectionLabel?: string  // Custom label like "stream" or "api"
}

export function ProjectStatus({ githubUrl, isConnected, connectionLabel = 'stream' }: ProjectStatusProps) {
  const showConnection = isConnected !== undefined
  const { showReadme, setShowReadme, readme, loadingReadme, fetchReadme } = useReadme(githubUrl)

  return (
    <>
      <div className="flex items-center gap-6 mb-6 font-mono">
        {/* Repository link */}
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-corpo-text/60 hover:text-lavender transition-colors"
        >
          <RiTerminalBoxLine className="w-5 h-5" />
          <span className="uppercase tracking-wider text-sm">repository</span>
        </a>

        {/* Divider */}
        <span className="text-corpo-border/50">/</span>

        {/* README button */}
        <button
          onClick={fetchReadme}
          className="flex items-center gap-2 text-corpo-text/60 hover:text-lavender transition-colors"
        >
          <RiFileTextLine className="w-5 h-5" />
          <span className="uppercase tracking-wider text-sm">readme</span>
        </button>

        {/* Divider */}
        {showConnection && (
          <span className="text-corpo-border/50">/</span>
        )}

        {/* Connection status */}
        {showConnection && (
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-2.5 h-2.5",
              isConnected ? "bg-lavender animate-pulse" : "bg-corpo-text/30"
            )} />
            <span className={cn(
              "uppercase tracking-wider text-sm",
              isConnected ? "text-lavender" : "text-corpo-text/50"
            )}>
              {connectionLabel}: {isConnected ? 'live' : 'offline'}
            </span>
          </div>
        )}
      </div>

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
