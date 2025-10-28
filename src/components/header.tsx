import { useEffect, useState } from 'react'
import { FileSystemNav, PathSegment } from './filesystem-nav'

interface HeaderProps {
  currentPath: PathSegment[]
  onNavigate: (path: string) => void
}

export function Header({ onNavigate }: HeaderProps) {
  const [time, setTime] = useState(new Date())
  const [hoveredTitle, setHoveredTitle] = useState(false)
  const [activeTitle, setActiveTitle] = useState(false)

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
        flexShrink: 0,
        backgroundColor: '#000000'
      }}
    >
      <div className="max-w-[1400px] mx-auto px-8 h-12 md:h-14 flex items-center justify-between">
        <button
          onClick={() => {
            onNavigate('~')
          }}
          onMouseEnter={() => setHoveredTitle(true)}
          onMouseLeave={() => {
            setHoveredTitle(false)
            setActiveTitle(false)
          }}
          onMouseDown={() => setActiveTitle(true)}
          onMouseUp={() => setActiveTitle(false)}
          onTouchStart={() => setActiveTitle(true)}
          onTouchEnd={() => setActiveTitle(false)}
          onTouchCancel={() => setActiveTitle(false)}
          className="font-mono tracking-tight transition-none"
          style={{ 
            fontSize: 'var(--text-size-base)',
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
            color: activeTitle 
              ? 'hsl(260, 35%, 68%)' 
              : hoveredTitle 
                ? 'hsl(220, 2%, 75%)' 
                : 'hsl(220, 3%, 65%)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer'
          }}
        >
          vedanta.systems
        </button>
        
        <time 
          className="font-mono tabular-nums" 
          style={{ 
            fontSize: 'var(--text-size-base)',
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
            color: 'hsl(220, 3%, 65%)'
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
      className="fixed bottom-0 left-0 right-0 border-t border-corpo-border bg-black h-12 md:h-14"
      style={{ 
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
