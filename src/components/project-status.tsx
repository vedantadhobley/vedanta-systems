import { RiTerminalBoxLine, RiTerminalBoxFill, RiFileTextLine, RiFileTextFill } from '@remixicon/react'
import { cn } from '@/lib/utils'
import { ReadmeViewer, useReadme } from './readme-viewer'
import { useState, useRef } from 'react'

interface ProjectStatusProps {
  githubUrl: string
  isConnected?: boolean  // Optional - only show connection status if provided
}

export function ProjectStatus({ githubUrl, isConnected }: ProjectStatusProps) {
  const showConnection = isConnected !== undefined
  const { showReadme, setShowReadme, readme, loadingReadme, fetchReadme } = useReadme(githubUrl)
  const [repoHovered, setRepoHovered] = useState(false)
  const [repoActive, setRepoActive] = useState(false)
  const [readmeHovered, setReadmeHovered] = useState(false)
  const [readmeActive, setReadmeActive] = useState(false)
  const recentTouchRef = useRef(false)

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
          onMouseEnter={() => { if (!recentTouchRef.current) setReadmeHovered(true) }}
          onMouseLeave={() => { if (!recentTouchRef.current) { setReadmeHovered(false); setReadmeActive(false) } }}
          onMouseDown={() => setReadmeActive(true)}
          onMouseUp={() => setReadmeActive(false)}
          onTouchStart={() => { recentTouchRef.current = true; setReadmeActive(true); setReadmeHovered(false) }}
          onTouchEnd={() => { setReadmeActive(false); setReadmeHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
          onTouchCancel={() => { setReadmeActive(false); setReadmeHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
          className={cn(
            "flex items-center gap-1.5 md:gap-2 transition-none",
            readmeActive ? "text-lavender" : readmeHovered ? "text-corpo-light" : "text-corpo-text"
          )}
        >
          {readmeActive || readmeHovered ? (
            <RiFileTextFill className="w-4 h-4 md:w-5 md:h-5" />
          ) : (
            <RiFileTextLine className="w-4 h-4 md:w-5 md:h-5" />
          )}
          <span className="uppercase tracking-wider text-xs md:text-sm">readme</span>
        </button>

        {/* Divider */}
        <span className="text-corpo-border/50">/</span>

        {/* Repository link */}
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => { if (!recentTouchRef.current) setRepoHovered(true) }}
          onMouseLeave={() => { if (!recentTouchRef.current) { setRepoHovered(false); setRepoActive(false) } }}
          onMouseDown={() => setRepoActive(true)}
          onMouseUp={() => setRepoActive(false)}
          onTouchStart={() => { recentTouchRef.current = true; setRepoActive(true); setRepoHovered(false) }}
          onTouchEnd={() => { setRepoActive(false); setRepoHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
          onTouchCancel={() => { setRepoActive(false); setRepoHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
          className={cn(
            "flex items-center gap-1.5 md:gap-2 transition-none",
            repoActive ? "text-lavender" : repoHovered ? "text-corpo-light" : "text-corpo-text"
          )}
        >
          {repoActive || repoHovered ? (
            <RiTerminalBoxFill className="w-4 h-4 md:w-5 md:h-5" />
          ) : (
            <RiTerminalBoxLine className="w-4 h-4 md:w-5 md:h-5" />
          )}
          <span className="uppercase tracking-wider text-xs md:text-sm">repository</span>
        </a>
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
