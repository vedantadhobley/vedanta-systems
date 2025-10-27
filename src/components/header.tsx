import { useEffect, useState } from 'react'
import { FileSystemNav, PathSegment } from './filesystem-nav'

interface HeaderProps {
  currentPath: PathSegment[]
  onNavigate: (path: string) => void
}

export function Header({ currentPath, onNavigate }: HeaderProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatUTC = (date: Date) => {
    const hours = date.getUTCHours().toString().padStart(2, '0')
    const minutes = date.getUTCMinutes().toString().padStart(2, '0')
    const seconds = date.getUTCSeconds().toString().padStart(2, '0')
    return `${hours}:${minutes}:${seconds} UTC`
  }

  return (
    <header className="w-full border-b border-corpo-border">
      <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between gap-8">
        <div className="flex items-center gap-8 flex-1 min-w-0">
          <h1 className="text-corpo-light text-lg font-mono tracking-tight whitespace-nowrap">
            vedanta.systems
          </h1>
          
          <div className="flex-1 min-w-0">
            <FileSystemNav currentPath={currentPath} onNavigate={onNavigate} />
          </div>
        </div>
        
        <time className="text-corpo-text text-sm font-mono tabular-nums whitespace-nowrap">
          {formatUTC(time)}
        </time>
      </div>
    </header>
  )
}
