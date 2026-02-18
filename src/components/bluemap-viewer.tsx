import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface BlueMapViewerProps {
  className?: string
  /** Map title for accessibility */
  title?: string
}

// CSS injected into BlueMap's iframe (same-origin so we can access contentDocument)
// Compacts toolbar, sidebar, and zoom buttons for embedded use
const EMBED_CSS = `
  /* Compact control bar */
  .control-bar {
    height: 1.6em !important;
    margin: 0 !important;
    font-size: 12px !important;
  }
  .control-bar .svg-button {
    min-width: 1.6em !important;
    min-height: 1.6em !important;
  }
  .control-bar .svg-button svg {
    height: 1.3em !important;
  }
  .control-bar .pos-input {
    font-size: 10px !important;
  }

  /* Compact zoom buttons */
  #zoom-buttons {
    width: 1.6em !important;
    margin: 0.3em !important;
  }
  #zoom-buttons .svg-button {
    min-width: 1.6em !important;
    min-height: 1.6em !important;
  }
  #zoom-buttons .svg-button svg {
    height: 1.3em !important;
  }

  /* Compact side menu */
  .side-menu {
    max-width: 16em !important;
    font-size: 0.85em !important;
  }
  .side-menu .title {
    font-size: 0.9em !important;
    line-height: 1.6em !important;
    padding: 0.3em !important;
  }
  .side-menu .simple-button,
  .side-menu .switch-button {
    line-height: 1.6em !important;
    padding: 0 0.4em !important;
  }
  .side-menu .group {
    margin: 1em 0 0.5em !important;
    padding-top: 0.5em !important;
  }
  .side-menu > .menu-button {
    min-width: 1.6em !important;
    min-height: 1.6em !important;
  }
  .side-menu > .content {
    padding: 0.3em !important;
  }
`

export function BlueMapViewer({ 
  className, 
  title = 'Minecraft Map',
}: BlueMapViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isCssFullscreen, setIsCssFullscreen] = useState(false)

  // Inject styles into same-origin iframe
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const injectStyles = () => {
      try {
        const doc = iframe.contentDocument
        if (!doc) return
        if (doc.getElementById('vedanta-embed-css')) return

        const style = doc.createElement('style')
        style.id = 'vedanta-embed-css'
        style.textContent = EMBED_CSS
        doc.head.appendChild(style)
      } catch {
        // Cross-origin or not ready — ignore
      }
    }

    iframe.addEventListener('load', injectStyles)
    injectStyles()
    return () => iframe.removeEventListener('load', injectStyles)
  }, [])

  // Intercept BlueMap's fullscreen button — override document.body.requestFullscreen
  // inside the iframe so it triggers our CSS fullscreen instead (works on iOS)
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const interceptFullscreen = () => {
      try {
        const doc = iframe.contentDocument
        const win = iframe.contentWindow
        if (!doc || !win) return
        if ((win as any).__fullscreenIntercepted) return

        const script = doc.createElement('script')
        script.textContent = `
          // Override requestFullscreen to message parent
          const origRequestFullscreen = Element.prototype.requestFullscreen;
          Element.prototype.requestFullscreen = function() {
            window.parent.postMessage({ type: 'bluemap-fullscreen-toggle' }, '*');
            return Promise.resolve();
          };
          // Also override webkit version for Safari
          if (Element.prototype.webkitRequestFullscreen) {
            Element.prototype.webkitRequestFullscreen = function() {
              window.parent.postMessage({ type: 'bluemap-fullscreen-toggle' }, '*');
            };
          }
        `
        doc.head.appendChild(script)
        ;(win as any).__fullscreenIntercepted = true
      } catch {
        // Cross-origin — ignore
      }
    }

    iframe.addEventListener('load', interceptFullscreen)
    interceptFullscreen()
    return () => iframe.removeEventListener('load', interceptFullscreen)
  }, [])

  // Listen for fullscreen toggle messages from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'bluemap-fullscreen-toggle') {
        // Try native fullscreen first (works on desktop + Android)
        if (!document.fullscreenElement && wrapperRef.current?.requestFullscreen) {
          wrapperRef.current.requestFullscreen().catch(() => {
            // Native fullscreen failed (iOS) — use CSS fullscreen
            setIsCssFullscreen(prev => !prev)
          })
        } else if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          // No native support — toggle CSS fullscreen
          setIsCssFullscreen(prev => !prev)
        }
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Listen for native fullscreen exit
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) {
        setIsCssFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ESC key to exit CSS fullscreen
  useEffect(() => {
    if (!isCssFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCssFullscreen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isCssFullscreen])

  const exitCssFullscreen = useCallback(() => {
    setIsCssFullscreen(false)
  }, [])

  return (
    <div 
      ref={wrapperRef}
      className={cn(
        "relative overflow-hidden rounded-lg bg-[#0a0a0a] w-full h-full min-h-0",
        isCssFullscreen && "fixed inset-0 z-[99999] rounded-none",
        className
      )}
    >
      <iframe
        ref={iframeRef}
        src="/bluemap/"
        className="absolute inset-0 w-full h-full border-0"
        title={title}
        allow="fullscreen"
        allowFullScreen
      />
      {/* Exit button for CSS fullscreen (iOS) */}
      {isCssFullscreen && (
        <button
          onClick={exitCssFullscreen}
          className="absolute top-2 left-2 z-10 bg-black/70 hover:bg-black/90 text-white/80 hover:text-white rounded px-2 py-1 text-xs"
        >
          ✕ Exit
        </button>
      )}
    </div>
  )
}
