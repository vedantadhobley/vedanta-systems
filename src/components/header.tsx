import { useEffect, useState, useRef } from 'react'
import { FileSystemNav, PathSegment } from './filesystem-nav'
import { RiSkipUpLine, RiSkipUpFill } from '@remixicon/react'
import { useTimezone } from '@/contexts/timezone-context'

interface HeaderProps {
  currentPath: PathSegment[]
  onNavigate: (path: string) => void
}

export function Header({ onNavigate }: HeaderProps) {
  const [time, setTime] = useState(new Date())
  const [hoveredTitle, setHoveredTitle] = useState(false)
  const [activeTitle, setActiveTitle] = useState(false)
  const [hoveredTime, setHoveredTime] = useState(false)
  const [activeTime, setActiveTime] = useState(false)
  const { formatTimeWithZone, toggleMode } = useTimezone()
  
  // Track recent touch to ignore simulated mouse events
  const recentTouchTitleRef = useRef(false)
  const recentTouchTimeRef = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return (
    <header 
      className="w-full" 
      style={{ 
        flexShrink: 0,
        backgroundColor: 'transparent'
      }}
    >
      <div className="max-w-[1140px] mx-auto px-4 md:px-8 h-12 md:h-14 flex items-center justify-between relative">
        <button
          onClick={() => {
            onNavigate('~')
          }}
          onMouseEnter={() => { if (!recentTouchTitleRef.current) setHoveredTitle(true) }}
          onMouseLeave={() => {
            if (recentTouchTitleRef.current) return
            setHoveredTitle(false)
            setActiveTitle(false)
          }}
          onMouseDown={() => setActiveTitle(true)}
          onMouseUp={() => setActiveTitle(false)}
          onTouchStart={() => { 
            recentTouchTitleRef.current = true
            setActiveTitle(true)
            setHoveredTitle(false) 
          }}
          onTouchEnd={() => { 
            setActiveTitle(false)
            setHoveredTitle(false)
            setTimeout(() => { recentTouchTitleRef.current = false }, 300)
          }}
          onTouchCancel={() => { 
            setActiveTitle(false)
            setHoveredTitle(false)
            setTimeout(() => { recentTouchTitleRef.current = false }, 300)
          }}
          className="font-mono tracking-tight transition-none"
          style={{ 
            fontSize: 'var(--text-size-base)',
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
            color: activeTitle 
              ? 'hsl(260, 35%, 68%)' 
              : hoveredTitle 
                ? 'rgba(255, 255, 255, 1)' 
                : 'rgba(255, 255, 255, 0.8)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer'
          }}
        >
          vedanta.systems
        </button>
        
        {/* Logo - centered */}
        <img 
          src="/og-image.svg" 
          alt="Vedanta Systems Logo"
          className="absolute left-1/2 -translate-x-1/2"
          style={{ height: '24px', width: 'auto' }}
        />
        
        <button
          onClick={toggleMode}
          onMouseEnter={() => { if (!recentTouchTimeRef.current) setHoveredTime(true) }}
          onMouseLeave={() => {
            if (recentTouchTimeRef.current) return
            setHoveredTime(false)
            setActiveTime(false)
          }}
          onMouseDown={() => setActiveTime(true)}
          onMouseUp={() => setActiveTime(false)}
          onTouchStart={() => { 
            recentTouchTimeRef.current = true
            setActiveTime(true)
            setHoveredTime(false) 
          }}
          onTouchEnd={() => { 
            setActiveTime(false)
            setHoveredTime(false)
            setTimeout(() => { recentTouchTimeRef.current = false }, 300)
          }}
          onTouchCancel={() => { 
            setActiveTime(false)
            setHoveredTime(false)
            setTimeout(() => { recentTouchTimeRef.current = false }, 300)
          }}
          className="font-mono tabular-nums transition-none" 
          style={{ 
            fontSize: 'var(--text-size-base)',
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
            color: activeTime 
              ? 'hsl(260, 35%, 68%)' 
              : hoveredTime 
                ? 'rgba(255, 255, 255, 1)' 
                : 'rgba(255, 255, 255, 0.8)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer'
          }}
        >
          {formatTimeWithZone(time, true)}
        </button>
      </div>
    </header>
  )
}

export function BottomNav({ currentPath, onNavigate }: HeaderProps) {
  const [hoveredScrollTop, setHoveredScrollTop] = useState(false)
  const [activeScrollTop, setActiveScrollTop] = useState(false)
  const [iconSize, setIconSize] = useState(window.innerWidth >= 768 ? 20 : 16)
  const isTouchRef = useRef(false)

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
          onMouseEnter={() => { if (!isTouchRef.current) setHoveredScrollTop(true) }}
          onMouseLeave={() => { if (!isTouchRef.current) { setHoveredScrollTop(false); setActiveScrollTop(false) } }}
          onMouseDown={() => { if (!isTouchRef.current) setActiveScrollTop(true) }}
          onMouseUp={() => { if (!isTouchRef.current) setActiveScrollTop(false) }}
          onTouchStart={() => {
            isTouchRef.current = true
            setActiveScrollTop(true)
            setHoveredScrollTop(false)
          }}
          onTouchEnd={() => {
            setActiveScrollTop(false)
            setHoveredScrollTop(false)
            setTimeout(() => { isTouchRef.current = false }, 300)
          }}
          onTouchCancel={() => {
            setActiveScrollTop(false)
            setHoveredScrollTop(false)
            setTimeout(() => { isTouchRef.current = false }, 300)
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
