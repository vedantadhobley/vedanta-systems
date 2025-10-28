import { useEffect, useState } from 'react'
import { FileSystemNav, PathSegment } from './filesystem-nav'
import { RiSkipUpLine, RiSkipUpFill } from '@remixicon/react'

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
      className="w-full" 
      style={{ 
        flexShrink: 0,
        backgroundColor: '#000000'
      }}
    >
      <div className="max-w-[1140px] mx-auto px-4 md:px-8 h-12 md:h-14 flex items-center justify-between">
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
  const [hoveredScrollTop, setHoveredScrollTop] = useState(false)
  const [activeScrollTop, setActiveScrollTop] = useState(false)
  const [iconSize, setIconSize] = useState(window.innerWidth >= 768 ? 20 : 16)

  useEffect(() => {
    const handleResize = () => {
      setIconSize(window.innerWidth >= 768 ? 20 : 16)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const scrollToTop = () => {
    const scrollContainer = document.querySelector('.content-scroll')
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
    }
    // Always clear states after scroll
    setActiveScrollTop(false)
    setHoveredScrollTop(false)
  }

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 border-t border-corpo-border bg-black h-12 md:h-14"
      style={{ 
        zIndex: 9999,
        WebkitTextSizeAdjust: '100%',
        textSizeAdjust: '100%'
      }}
    >
      <div className="max-w-[1140px] mx-auto px-4 md:px-8 h-full flex items-center justify-between">
        <FileSystemNav currentPath={currentPath} onNavigate={onNavigate} />
        
        <button
          onClick={scrollToTop}
          onMouseEnter={() => setHoveredScrollTop(true)}
          onMouseLeave={() => {
            setHoveredScrollTop(false)
            setActiveScrollTop(false)
          }}
          onMouseDown={() => setActiveScrollTop(true)}
          onMouseUp={() => setActiveScrollTop(false)}
          onTouchStart={() => {
            setActiveScrollTop(true)
            setHoveredScrollTop(false)
          }}
          onTouchEnd={() => {
            setActiveScrollTop(false)
            setHoveredScrollTop(false)
          }}
          onTouchCancel={() => {
            setActiveScrollTop(false)
            setHoveredScrollTop(false)
          }}
          className="flex items-center transition-none"
          style={{ 
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent'
          }}
        >
          {activeScrollTop ? (
            <RiSkipUpFill size={iconSize} className="text-lavender" />
          ) : hoveredScrollTop ? (
            <RiSkipUpFill size={iconSize} className="text-corpo-light" />
          ) : (
            <RiSkipUpLine size={iconSize} className="text-corpo-text" />
          )}
        </button>
      </div>
    </nav>
  )
}
