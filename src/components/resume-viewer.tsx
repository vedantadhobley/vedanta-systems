import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { RiDownloadLine, RiExternalLinkLine } from '@remixicon/react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface ResumeViewerProps {
  pdfUrl: string
  downloadFilename?: string
  lastUpdated?: string
}

export function ResumeViewer({ 
  pdfUrl, 
  downloadFilename = 'Vedanta_Dhobley_Resume_20260121.pdf',
  lastUpdated = 'January 21, 2026'
}: ResumeViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Button states for proper touch/hover/press handling
  const [openHovered, setOpenHovered] = useState(false)
  const [openActive, setOpenActive] = useState(false)
  const [downloadHovered, setDownloadHovered] = useState(false)
  const [downloadActive, setDownloadActive] = useState(false)
  const recentTouchRef = useRef(false)

  // Track container width for responsive PDF rendering
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
  }

  function onDocumentLoadError() {
    setLoadError(true)
  }

  // Get button class based on state
  const getButtonClass = (isHovered: boolean, isActive: boolean) => {
    if (isActive) {
      return 'text-lavender border-lavender'
    } else if (isHovered) {
      return 'text-corpo-light border-corpo-light'
    }
    return 'text-corpo-text border-corpo-border'
  }

  return (
    <div className="space-y-4">
      {/* Header row - last updated on left, buttons on right */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Last updated */}
        <span className="text-corpo-text/50 font-mono" style={{ fontSize: 'var(--text-size-sm)' }}>
          Last updated: {lastUpdated}
        </span>
        
        {/* Buttons */}
        <div className="flex items-center gap-2">
          {/* Open button */}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => { if (!recentTouchRef.current) setOpenHovered(true) }}
            onMouseLeave={() => {
              if (recentTouchRef.current) return
              setOpenHovered(false)
              setOpenActive(false)
            }}
            onMouseDown={() => setOpenActive(true)}
            onMouseUp={() => setOpenActive(false)}
            onTouchStart={() => { recentTouchRef.current = true; setOpenActive(true); setOpenHovered(false) }}
            onTouchEnd={() => { setOpenActive(false); setOpenHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
            onTouchCancel={() => { setOpenActive(false); setOpenHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
            className={`flex items-center gap-2 px-3 py-1.5 font-mono text-sm border transition-none ${getButtonClass(openHovered, openActive)}`}
          >
            <RiExternalLinkLine size={16} />
            <span>Open</span>
          </a>
          
          {/* Download button */}
          <a
            href={pdfUrl}
            download={downloadFilename}
            onMouseEnter={() => { if (!recentTouchRef.current) setDownloadHovered(true) }}
            onMouseLeave={() => {
              if (recentTouchRef.current) return
              setDownloadHovered(false)
              setDownloadActive(false)
            }}
            onMouseDown={() => setDownloadActive(true)}
            onMouseUp={() => setDownloadActive(false)}
            onTouchStart={() => { recentTouchRef.current = true; setDownloadActive(true); setDownloadHovered(false) }}
            onTouchEnd={() => { setDownloadActive(false); setDownloadHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
            onTouchCancel={() => { setDownloadActive(false); setDownloadHovered(false); setTimeout(() => { recentTouchRef.current = false }, 300) }}
            className={`flex items-center gap-2 px-3 py-1.5 font-mono text-sm border transition-none ${getButtonClass(downloadHovered, downloadActive)}`}
          >
            <RiDownloadLine size={16} />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* PDF Pages - rendered directly inline */}
      <div ref={containerRef} className="space-y-4">
        {loadError ? (
          <div className="bg-corpo-bg/50 border border-corpo-border/30 p-6 text-center space-y-4">
            <p className="text-corpo-text/60 font-mono text-sm">
              Unable to load PDF
            </p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 font-mono text-sm border border-corpo-border text-corpo-text hover:text-corpo-light hover:border-corpo-light transition-colors"
            >
              <RiExternalLinkLine size={16} />
              <span>Open PDF in new tab</span>
            </a>
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center py-12">
                <div className="text-corpo-text/60 font-mono text-sm">Loading...</div>
              </div>
            }
          >
            {numPages && containerWidth > 0 && Array.from(new Array(numPages), (_, index) => (
              <div key={`page_${index + 1}`} className="border border-corpo-border/30 mb-4 last:mb-0">
                <Page
                  pageNumber={index + 1}
                  width={containerWidth}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  )
}
