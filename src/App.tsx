import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom'
import { RiFolderLine, RiFolderFill } from '@remixicon/react'
import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import { Header, BottomNav } from '@/components/header'
import { PathSegment } from '@/components/filesystem-nav'
import { PhotoGallery } from '@/components/photo-gallery'
import { MoonBackground } from '@/components/moon-background'
import { FoundFootyBrowser } from '@/components/found-footy-browser'
import { ProjectStatus } from '@/components/project-status'
import { useFootyStream } from '@/hooks/useFootyStream'
import './App.css'

// Project GitHub links - maps project paths to their repos
const projectGithubLinks: Record<string, string> = {
  '~/projects/found-footy': 'https://github.com/vedantadhobley/found-footy',
  '~/projects/vedanta-systems': 'https://github.com/vedantadhobley/vedanta-systems',
  // Add more projects here as needed
}

interface FolderContent {
  name: string
  path: string
  type: 'folder' | 'file'
}

const folderContents: Record<string, FolderContent[]> = {
  '~': [
    { name: 'projects', path: '~/projects', type: 'folder' },
    { name: 'music', path: '~/music', type: 'folder' },
    { name: 'photos', path: '~/photos', type: 'folder' },
    { name: 'about', path: '~/about', type: 'folder' },
  ],
  '~/projects': [
    { name: 'vedanta-systems', path: '~/projects/vedanta-systems', type: 'folder' },
    { name: 'legal-tender', path: '~/projects/legal-tender', type: 'folder' },
    { name: 'found-footy', path: '~/projects/found-footy', type: 'folder' },
  ],
  '~/photos': [
    { name: 'nepal-2024', path: '~/photos/nepal-2024', type: 'folder' },
  ],
  '~/photos/nepal-2024': [], // Photos will be displayed by PhotoGallery component
}

// Convert URL path to file system path
function urlToFsPath(url: string): string {
  if (url === '/' || url === '') return '~'
  // Remove leading slash and convert to ~/ format
  return '~/' + url.substring(1)
}

// Convert file system path to URL path
function fsPathToUrl(fsPath: string): string {
  if (fsPath === '~') return '/'
  // Remove ~/ prefix
  return '/' + fsPath.substring(2)
}

// Get PathSegments from URL
function getPathSegmentsFromUrl(url: string): PathSegment[] {
  const fsPath = urlToFsPath(url)
  
  const pathMap: Record<string, PathSegment[]> = {
    '~': [
      { name: '~', path: '~', icon: 'home' }
    ],
    '~/projects': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'projects', path: '~/projects', icon: 'folder' }
    ],
    '~/projects/vedanta-systems': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'projects', path: '~/projects', icon: 'folder' },
      { name: 'vedanta-systems', path: '~/projects/vedanta-systems', icon: 'folder' }
    ],
    '~/projects/legal-tender': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'projects', path: '~/projects', icon: 'folder' },
      { name: 'legal-tender', path: '~/projects/legal-tender', icon: 'folder' }
    ],
    '~/projects/found-footy': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'projects', path: '~/projects', icon: 'folder' },
      { name: 'found-footy', path: '~/projects/found-footy', icon: 'folder' }
    ],
    '~/music': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'music', path: '~/music', icon: 'folder' }
    ],
    '~/photos': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'photos', path: '~/photos', icon: 'folder' }
    ],
    '~/photos/nepal-2024': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'photos', path: '~/photos', icon: 'folder' },
      { name: 'nepal-2024', path: '~/photos/nepal-2024', icon: 'folder' }
    ],
    '~/about': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'about', path: '~/about', icon: 'folder' }
    ]
  }

  return pathMap[fsPath] || pathMap['~']
}

// Photo albums configuration
const photoAlbums: Record<string, string[]> = {
  '~/photos/nepal-2024': [
    'DSCF0363.JPG',
    'DSCF0438.JPG',
    'DSCF0455.JPG',
    'DSCF0478.JPG',
    'DSCF0564.JPG',
    'DSCF0581.JPG',
    'DSCF0633.JPG',
    'DSCF0697.JPG',
    'DSCF0810.JPG',
  ],
}

function DirectoryListing() {
  const location = useLocation()
  const navigate = useNavigate()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const [iconSize, setIconSize] = useState(window.innerWidth >= 768 ? 20 : 16)

  const currentPath = getPathSegmentsFromUrl(location.pathname)
  const fsPath = currentPath[currentPath.length - 1].path

  // Update icon size on resize
  useEffect(() => {
    const handleResize = () => {
      setIconSize(window.innerWidth >= 768 ? 20 : 16)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Clear hover and active states when path changes
  useEffect(() => {
    setHoveredItem(null)
    setActiveItem(null)
  }, [location.pathname])

  const handleNavigate = (path: string) => {
    navigate(fsPathToUrl(path))
  }

  return (
    <>
      <div 
        className="content-scroll" 
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: 'transparent',
          zIndex: 10
        }}
      >
        <Header currentPath={currentPath} onNavigate={handleNavigate} />
      
        {/* GitHub Contribution Graph - shows on all pages */}
        <div className="w-full">
          <GitHubContributionGraph username="vedantadhobley" />
        </div>
        
        <div className="w-full max-w-[1140px] mx-auto px-4 md:px-8 pt-4 pb-8">
          {/* Found Footy Browser - ~/projects/found-footy */}
          {fsPath === '~/projects/found-footy' && (
            <FoundFootyContent />
          )}

          {/* Other project pages - just show GitHub link */}
          {fsPath !== '~/projects/found-footy' && projectGithubLinks[fsPath] && (
            <ProjectStatus githubUrl={projectGithubLinks[fsPath]} />
          )}

          {/* Photo Gallery - if current path is a photo album */}
          {photoAlbums[fsPath] && (
            <PhotoGallery
              photos={photoAlbums[fsPath].map(filename => ({
                filename,
                path: `/photos/nepal-2024/${filename}`
              }))}
              albumName={currentPath[currentPath.length - 1].name}
            />
          )}

          {/* Folder Contents - Terminal style listing */}
          {folderContents[fsPath] && folderContents[fsPath].length > 0 && (
            <div className="space-y-1">
              {folderContents[fsPath].map((item) => {
                const isHovered = hoveredItem === item.path
                const isActive = activeItem === item.path
                
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    onMouseEnter={() => setHoveredItem(item.path)}
                    onMouseLeave={() => {
                      setHoveredItem(null)
                      setActiveItem(null)
                    }}
                    onMouseDown={() => setActiveItem(item.path)}
                    onMouseUp={() => setActiveItem(null)}
                    onTouchStart={() => setActiveItem(item.path)}
                    onTouchEnd={() => setActiveItem(null)}
                    onTouchCancel={() => setActiveItem(null)}
                    className={`flex items-center gap-2 w-full text-left py-2 font-mono transition-none ${
                      isActive 
                        ? 'text-lavender' 
                        : isHovered 
                          ? 'text-corpo-light' 
                          : 'text-corpo-text'
                    }`}
                    style={{ fontSize: 'var(--text-size-base)' }}
                  >
                    {isActive ? (
                      <RiFolderFill size={iconSize} className="text-lavender" />
                    ) : isHovered ? (
                      <RiFolderFill size={iconSize} className="text-corpo-light" />
                    ) : (
                      <RiFolderLine size={iconSize} className="text-corpo-text" />
                    )}
                    <span>{item.name}/</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      
      <BottomNav currentPath={currentPath} onNavigate={handleNavigate} />
    </>
  )
}

// FoundFooty content component - rendered inside DirectoryListing
function FoundFootyContent() {
  const { fixtures, completedFixtures, isConnected, lastUpdate } = useFootyStream()
  const location = useLocation()
  
  // Parse URL params for deep linking (e.g., ?v=event_id&h=video_hash)
  const searchParams = new URLSearchParams(location.search)
  const eventId = searchParams.get('v')
  const hash = searchParams.get('h')
  
  const initialVideo = eventId ? { eventId, hash: hash || undefined } : null
  
  return (
    <>
      <ProjectStatus 
        githubUrl="https://github.com/vedantadhobley/found-footy"
        isConnected={isConnected}
        connectionLabel="stream"
      />
      <FoundFootyBrowser 
        fixtures={fixtures}
        completedFixtures={completedFixtures}
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        initialVideo={initialVideo}
      />
    </>
  )
}

function App() {
  return (
    <>
      <MoonBackground />
      <Routes>
        <Route path="*" element={<DirectoryListing />} />
      </Routes>
    </>
  )
}

export default App
