import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom'
import { RiFolder2Line, RiFolder2Fill } from '@remixicon/react'
import { GitHubContributionGraph } from '@/components/github-contribution-graph'
import { Header, BottomNav } from '@/components/header'
import { PathSegment } from '@/components/filesystem-nav'
// TODO: Re-enable moon background video when performance issues are resolved
// import { MoonBackground } from '@/components/moon-background'
import { FoundFootyBrowser } from '@/components/found-footy-browser'
import { ResumeViewer } from '@/components/resume-viewer'
import { ProjectStatus } from '@/components/project-status'
import { FootyStreamProvider, useFootyStream } from '@/contexts/FootyStreamContext'
import { TimezoneProvider } from '@/contexts/timezone-context'
import './App.css'

// Project GitHub links - maps project paths to their repos
const projectGithubLinks: Record<string, string> = {
  '~/workspace/found-footy': 'https://github.com/vedantadhobley/found-footy',
  '~/workspace/vedanta-systems': 'https://github.com/vedantadhobley/vedanta-systems',
  // Add more projects here as needed
}

// Project descriptions for the workspace page
const projectDescriptions: Record<string, { name: string; blurb: string }> = {
  '~/workspace/vedanta-systems': {
    name: 'vedanta-systems',
    blurb: 'System monitoring dashboard and project hub. Displays real-time btop metrics, service status, and hosted project interfaces.'
  },
  '~/workspace/found-footy': {
    name: 'found-footy',
    blurb: 'Automated football goal clip aggregator. Monitors live fixtures, detects goals, and automatically finds and archives video clips from social media.'
  },
  '~/workspace/legal-tender': {
    name: 'legal-tender',
    blurb: 'AI-driven political influence analysis. Connects campaign finance, lobbying, and voting records to expose money in US politics.'
  },
}

interface FolderContent {
  name: string
  path: string
  type: 'folder' | 'file'
}

const folderContents: Record<string, FolderContent[]> = {
  '~': [
    { name: 'workspace', path: '~/workspace', type: 'folder' },
    { name: 'about', path: '~/about', type: 'folder' },
  ],
  '~/workspace': [
    { name: 'vedanta-systems', path: '~/workspace/vedanta-systems', type: 'folder' },
    { name: 'found-footy', path: '~/workspace/found-footy', type: 'folder' },
    { name: 'legal-tender', path: '~/workspace/legal-tender', type: 'folder' },
  ],
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
    '~/workspace': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'workspace', path: '~/workspace', icon: 'folder' }
    ],
    '~/workspace/vedanta-systems': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'workspace', path: '~/workspace', icon: 'folder' },
      { name: 'vedanta-systems', path: '~/workspace/vedanta-systems', icon: 'folder' }
    ],
    '~/workspace/legal-tender': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'workspace', path: '~/workspace', icon: 'folder' },
      { name: 'legal-tender', path: '~/workspace/legal-tender', icon: 'folder' }
    ],
    '~/workspace/found-footy': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'workspace', path: '~/workspace', icon: 'folder' },
      { name: 'found-footy', path: '~/workspace/found-footy', icon: 'folder' }
    ],
    '~/about': [
      { name: '~', path: '~', icon: 'home' },
      { name: 'about', path: '~/about', icon: 'folder' }
    ]
  }

  return pathMap[fsPath] || pathMap['~']
}



function DirectoryListing() {
  const location = useLocation()
  const navigate = useNavigate()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const [iconSize, setIconSize] = useState(window.innerWidth >= 768 ? 20 : 16)
  const recentTouchRef = useRef(false)

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
          {/* Found Footy Browser - ~/workspace/found-footy */}
          {fsPath === '~/workspace/found-footy' && (
            <FoundFootyContent />
          )}

          {/* About page - Resume */}
          {fsPath === '~/about' && (
            <AboutContent />
          )}

          {/* Other project pages - just show GitHub link */}
          {fsPath !== '~/workspace/found-footy' && projectGithubLinks[fsPath] && (
            <ProjectStatus 
              githubUrl={projectGithubLinks[fsPath]} 
              comingSoon={fsPath === '~/workspace/vedanta-systems' || fsPath === '~/workspace/legal-tender'}
            />
          )}

          {/* Folder Contents - Terminal style listing */}
          {folderContents[fsPath] && folderContents[fsPath].length > 0 && (
            <div className="space-y-1">
              {folderContents[fsPath].map((item) => {
                const isHovered = hoveredItem === item.path
                const isActive = activeItem === item.path
                const projectInfo = projectDescriptions[item.path]
                
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    onMouseEnter={() => { if (!recentTouchRef.current) setHoveredItem(item.path) }}
                    onMouseLeave={() => {
                      if (recentTouchRef.current) return
                      setHoveredItem(null)
                      setActiveItem(null)
                    }}
                    onMouseDown={() => setActiveItem(item.path)}
                    onMouseUp={() => setActiveItem(null)}
                    onTouchStart={() => { recentTouchRef.current = true; setActiveItem(item.path); setHoveredItem(null) }}
                    onTouchEnd={() => { setActiveItem(null); setHoveredItem(null); setTimeout(() => { recentTouchRef.current = false }, 300) }}
                    onTouchCancel={() => { setActiveItem(null); setHoveredItem(null); setTimeout(() => { recentTouchRef.current = false }, 300) }}
                    className={`flex items-start gap-2 w-full text-left py-2 font-mono transition-none ${
                      isActive 
                        ? 'text-lavender' 
                        : isHovered 
                          ? 'text-corpo-light' 
                          : 'text-corpo-text'
                    }`}
                    style={{ fontSize: 'var(--text-size-base)' }}
                  >
                    <span className="flex-shrink-0 mt-0.5">
                      {isActive ? (
                        <RiFolder2Fill size={iconSize} className="text-lavender" />
                      ) : isHovered ? (
                        <RiFolder2Fill size={iconSize} className="text-corpo-light" />
                      ) : (
                        <RiFolder2Line size={iconSize} className="text-corpo-text" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <span>{item.name}/</span>
                      {/* Show project description if on projects page */}
                      {projectInfo && (
                        <div className={`text-sm mt-1 leading-relaxed ${
                          isActive ? 'text-lavender/70' : isHovered ? 'text-corpo-light/70' : 'text-corpo-text/50'
                        }`}>
                          {projectInfo.blurb}
                        </div>
                      )}
                    </div>
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

// About page content component
function AboutContent() {
  return (
    <ResumeViewer pdfUrl="/Vedanta_Dhobley_Resume_20260121.pdf" />
  )
}

// FoundFooty content component - rendered inside DirectoryListing
function FoundFootyContent() {
  const { 
    stagingFixtures, 
    activeFixtures,
    completedFixtures, 
    isBackendOnline, 
    isLoading,
    isChangingDate,
    lastUpdate, 
    pauseStream, 
    resumeStream,
    currentDate,
    availableDates,
    setDate,
    goToToday,
    goToPreviousDate,
    goToNextDate,
    navigateToEvent
  } = useFootyStream()
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
        isConnected={isBackendOnline}
      />
      <FoundFootyBrowser 
        stagingFixtures={stagingFixtures}
        fixtures={activeFixtures}
        completedFixtures={completedFixtures}
        isConnected={isBackendOnline}
        isLoading={isLoading}
        isChangingDate={isChangingDate}
        lastUpdate={lastUpdate}
        initialVideo={initialVideo}
        onPauseStream={pauseStream}
        onResumeStream={resumeStream}
        currentDate={currentDate}
        availableDates={availableDates}
        onDateChange={setDate}
        onGoToToday={goToToday}
        onPreviousDate={goToPreviousDate}
        onNextDate={goToNextDate}
        onNavigateToEvent={navigateToEvent}
      />
    </>
  )
}

function App() {
  return (
    <TimezoneProvider>
      <FootyStreamProvider>
        {/* TODO: Re-enable moon background video when performance issues are resolved */}
        {/* <MoonBackground /> */}
        <Routes>
          <Route path="*" element={<DirectoryListing />} />
        </Routes>
      </FootyStreamProvider>
    </TimezoneProvider>
  )
}

export default App
