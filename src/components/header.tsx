import { useEffect, useState } from 'react'
import { FileSystemNav, PathSegment } from './filesystem-nav'

interface HeaderProps {
  currentPath: PathSegment[]
  onNavigate: (path: string) => void
}

export function Header(_props: HeaderProps) {
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
    <header 
      className="w-full border-b border-corpo-border" 
      style={{ 
        height: '48px', 
        minHeight: '48px', 
        maxHeight: '48px',
        flexShrink: 0,
        backgroundColor: '#000000'
      }}
    >
      <div className="max-w-[1400px] mx-auto px-8 h-full flex items-center justify-between">
        <h1 
          className="text-corpo-light font-mono tracking-tight" 
          style={{ 
            fontSize: '14px', 
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%'
          }}
        >
          vedanta.systems
        </h1>
        
        <time 
          className="text-corpo-text font-mono tabular-nums" 
          style={{ 
            fontSize: '14px', 
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%'
          }}
        >
          {formatUTC(time)}
        </time>
      </div>
    </header>
  )
}

export function BottomNav({ currentPath, onNavigate }: HeaderProps) {
  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 border-t border-corpo-border bg-black"
      style={{ 
        height: '48px',
        minHeight: '48px',
        maxHeight: '48px',
        fontSize: '14px',
        zIndex: 9999,
        WebkitTextSizeAdjust: '100%',
        textSizeAdjust: '100%'
      }}
    >
      <div className="max-w-[1400px] mx-auto px-8 h-full flex items-center">
        <FileSystemNav currentPath={currentPath} onNavigate={onNavigate} />
      </div>
    </nav>
  )
}
