import { useState, useEffect, useRef } from 'react'
import { RiCloseLine, RiCloseFill } from '@remixicon/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import mermaid from 'mermaid'

// Initialize mermaid with dark theme matching site aesthetic
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#b4a7d6',
    primaryTextColor: '#e8e3e3',
    primaryBorderColor: '#4a4458',
    lineColor: '#b4a7d6',
    secondaryColor: '#2d2d3d',
    tertiaryColor: '#1a1a2e',
    background: '#0d0d14',
    mainBkg: '#1a1a2e',
    nodeBorder: '#4a4458',
    clusterBkg: '#1a1a2e',
    clusterBorder: '#4a4458',
    titleColor: '#e8e3e3',
    edgeLabelBackground: '#1a1a2e',
  },
  fontFamily: 'IBM Plex Mono, monospace',
})

// Mermaid diagram component
function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg } = await mermaid.render(id, chart)
        setSvg(svg)
        setError(null)
      } catch (e: any) {
        setError(e.message || 'Failed to render diagram')
      }
    }
    renderDiagram()
  }, [chart])

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded p-4 mb-4 text-red-400 text-sm font-mono">
        Mermaid error: {error}
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="bg-black/30 border border-corpo-border rounded p-4 mb-4 overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// Custom components for ReactMarkdown
const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-mono text-corpo-text mb-4 mt-6 first:mt-0 border-b border-corpo-border/30 pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-mono text-corpo-text mb-3 mt-5">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-mono text-corpo-text mb-2 mt-4">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-corpo-text/80 font-mono text-sm mb-3 leading-relaxed break-words">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-lavender hover:underline">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-corpo-text/80 font-mono text-sm mb-3 space-y-1 ml-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-corpo-text/80 font-mono text-sm mb-3 space-y-1 ml-2">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-corpo-text/80">{children}</li>
  ),
  code: ({ className, children }) => {
    const isInline = !className
    const content = String(children).replace(/\n$/, '')
    
    if (isInline) {
      return (
        <code className="text-lavender bg-corpo-border/40 px-1.5 py-0.5 rounded text-sm font-mono break-words">
          {children}
        </code>
      )
    }
    
    // Check if it's a mermaid diagram
    const language = className?.replace('language-', '') || ''
    if (language === 'mermaid') {
      return <MermaidDiagram chart={content} />
    }
    
    // Regular code block
    return (
      <code className="block text-sm font-mono whitespace-pre-wrap break-words md:whitespace-pre text-corpo-text/90">
        {content}
      </code>
    )
  },
  pre: ({ children, node }) => {
    // Check if the child is a mermaid code block - if so, don't wrap in pre
    const codeChild = node?.children?.[0] as any
    if (codeChild?.properties?.className?.includes('language-mermaid')) {
      return <>{children}</>
    }
    return (
      <pre className="bg-black/50 border border-corpo-border rounded p-3 md:p-4 mb-4 overflow-x-auto max-w-full text-xs md:text-sm">
        {children}
      </pre>
    )
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-lavender/50 pl-4 italic text-corpo-text/60 mb-3">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border border-corpo-border text-sm font-mono">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-corpo-border px-3 py-2 bg-corpo-border/20 text-left text-corpo-text">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-corpo-border px-3 py-2 text-corpo-text/80">
      {children}
    </td>
  ),
  hr: () => <hr className="border-corpo-border/50 my-6" />,
  img: ({ src, alt }) => (
    <img src={src} alt={alt || ''} className="max-w-full h-auto rounded border border-corpo-border/30 my-4" />
  ),
}

interface ReadmeViewerProps {
  isOpen: boolean
  onClose: () => void
  content: string | null
  isLoading: boolean
}

export function ReadmeViewer({ isOpen, onClose, content, isLoading }: ReadmeViewerProps) {
  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[80vh] mx-4 bg-corpo-bg border border-corpo-border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-corpo-border">
          <span className="font-mono text-corpo-text/60 uppercase tracking-wider text-sm">readme.md</span>
          <button
            onClick={onClose}
            onTouchStart={() => {}} // Required for iOS :active to work
            className="nav-btn p-1"
            aria-label="Close"
          >
            <RiCloseLine className="icon-line w-5 h-5" />
            <RiCloseFill className="icon-fill w-5 h-5" />
          </button>
        </div>
        
        {/* Content - overflow-x-hidden prevents horizontal scroll on mobile */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {isLoading ? (
            <div className="text-corpo-text/50 font-mono">Loading...</div>
          ) : (
            <div className="max-w-full overflow-hidden">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {content || ''}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Hook to manage README fetching
export function useReadme(githubUrl: string) {
  const [showReadme, setShowReadme] = useState(false)
  const [readme, setReadme] = useState<string | null>(null)
  const [loadingReadme, setLoadingReadme] = useState(false)

  // Extract owner/repo from GitHub URL
  const getRepoPath = () => {
    const match = githubUrl.match(/github\.com\/([^/]+\/[^/]+)/)
    return match?.[1] || ''
  }

  const fetchReadme = async () => {
    if (readme) {
      setShowReadme(true)
      return
    }
    
    setLoadingReadme(true)
    setShowReadme(true)
    
    try {
      const repoPath = getRepoPath()
      const response = await fetch(`https://raw.githubusercontent.com/${repoPath}/main/README.md`)
      if (!response.ok) {
        // Try master branch
        const masterResponse = await fetch(`https://raw.githubusercontent.com/${repoPath}/master/README.md`)
        if (!masterResponse.ok) throw new Error('README not found')
        setReadme(await masterResponse.text())
      } else {
        setReadme(await response.text())
      }
    } catch (error) {
      setReadme('# README\n\nFailed to load README from repository.')
    } finally {
      setLoadingReadme(false)
    }
  }

  return {
    showReadme,
    setShowReadme,
    readme,
    loadingReadme,
    fetchReadme,
  }
}
