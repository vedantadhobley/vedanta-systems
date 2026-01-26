import { useEffect, useState } from 'react'
import { FileSystemNav, PathSegment } from './filesystem-nav'
import { RiSkipUpLine, RiSkipUpFill } from '@remixicon/react'
import { useTimezone } from '@/contexts/timezone-context'

/**
 * CSS-based button styles - no React state for hover/active, pure CSS handles it
 * 
 * .nav-btn: For icon buttons - swaps line/fill icons on hover/active
 * .text-btn: For text-only buttons - just changes color on hover/active
 * 
 * Key: @media (hover: hover) ensures hover only on mouse devices
 * Touch devices go straight from normal → active → normal (no hover)
 * 
 * This is injected in BottomNav so it's available globally.
 */
const navButtonStyles = `
  .nav-btn, .text-btn {
    position: relative;
    color: hsl(var(--corpo-text));
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .nav-btn:disabled, .text-btn:disabled {
    color: hsl(var(--corpo-text));
    opacity: 0.2;
    cursor: not-allowed;
  }
  .nav-btn .icon-line { display: block; }
  .nav-btn .icon-fill { display: none; }
  
  /* Hover - ONLY on devices that support hover (mouse/trackpad) */
  @media (hover: hover) {
    .nav-btn:not(:disabled):hover,
    .text-btn:not(:disabled):hover {
      color: hsl(var(--corpo-light));
    }
    .nav-btn:not(:disabled):hover .icon-line { display: none; }
    .nav-btn:not(:disabled):hover .icon-fill { display: block; }
  }
  
  /* Active/pressed - works on both touch and mouse */
  .nav-btn:not(:disabled):active,
  .text-btn:not(:disabled):active {
    color: hsl(var(--lavender)) !important;
  }
  .nav-btn:not(:disabled):active .icon-line { display: none !important; }
  .nav-btn:not(:disabled):active .icon-fill { display: block !important; }
`

interface HeaderProps {
  currentPath: PathSegment[]
  onNavigate: (path: string) => void
}

export function Header({ onNavigate }: HeaderProps) {
  const [time, setTime] = useState(new Date())
  const { formatTimeWithZone, toggleMode } = useTimezone()

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
          onClick={() => onNavigate('~')}
          onTouchStart={() => {}} // Required for iOS :active to work
          className="text-btn font-mono tracking-tight"
          style={{ 
            fontSize: 'var(--text-size-base)',
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
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
          onTouchStart={() => {}} // Required for iOS :active to work
          className="text-btn font-mono tabular-nums"
          style={{ 
            fontSize: 'var(--text-size-base)',
            lineHeight: '1',
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
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
  }

  return (
    <>
      {/* Global nav-btn styles */}
      <style dangerouslySetInnerHTML={{ __html: navButtonStyles }} />
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
            onTouchStart={() => {}} // Required for iOS :active to work
            className="nav-btn flex items-center p-1"
            aria-label="Scroll to top"
          >
            <RiSkipUpLine size={iconSize} className="icon-line" />
            <RiSkipUpFill size={iconSize} className="icon-fill" />
          </button>
        </div>
      </nav>
    </>
  )
}
