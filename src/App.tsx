import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom'
import { RiFolderLine, RiFolderFill } from '@remixicon/react'
import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import { Header, BottomNav } from '@/components/header'
import { PathSegment } from '@/components/filesystem-nav'
import { PhotoGallery } from '@/components/photo-gallery'
import './App.css'

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

  const currentPath = getPathSegmentsFromUrl(location.pathname)
  const fsPath = currentPath[currentPath.length - 1].path

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
          bottom: '48px',
          overflowY: 'auto',
          overflowX: 'hidden',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <Header currentPath={currentPath} onNavigate={handleNavigate} />
      
        {/* GitHub Contribution Graph - Only on root/home */}
        {currentPath.length === 1 && currentPath[0].path === '~' && (
          <div className="w-full border-b border-corpo-border py-8">
            <div className="flex items-center justify-center">
              <GitHubContributionGraph username="vedantadhobley" />
            </div>
          </div>
        )}
        
        <div className="max-w-[1400px] w-full mx-auto px-8 pt-8 pb-8">
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
                    className={`flex items-center gap-2 w-full text-left px-4 py-2 font-mono text-sm transition-none ${
                      isActive 
                        ? 'text-lavender' 
                        : isHovered 
                          ? 'text-corpo-light' 
                          : 'text-corpo-text'
                    }`}
                  >
                    {isActive ? (
                      <RiFolderFill size={16} className="text-lavender" />
                    ) : isHovered ? (
                      <RiFolderFill size={16} className="text-corpo-light" />
                    ) : (
                      <RiFolderLine size={16} className="text-corpo-text" />
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

function App() {
  return (
    <Routes>
      <Route path="*" element={<DirectoryListing />} />
    </Routes>
  )
}

export default App
