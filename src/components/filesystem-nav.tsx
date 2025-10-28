import { RiHome6Line, RiHome6Fill, RiFolderLine, RiFolderFill } from '@remixicon/react'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { useState, useEffect } from 'react'

export interface PathSegment {
  name: string
  path: string
  icon?: 'home' | 'folder'
}

interface FileSystemNavProps {
  currentPath: PathSegment[]
  onNavigate: (path: string) => void
}

export function FileSystemNav({ currentPath, onNavigate }: FileSystemNavProps) {
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [hoveredText, setHoveredText] = useState<string | null>(null)
  const [activeText, setActiveText] = useState<string | null>(null)
  const [iconSize, setIconSize] = useState(window.innerWidth >= 768 ? 20 : 16)

  // Update icon size on resize
  useEffect(() => {
    const handleResize = () => {
      setIconSize(window.innerWidth >= 768 ? 20 : 16)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Clear hover state when path changes
  useEffect(() => {
    setHoveredPath(null)
    setActivePath(null)
    setHoveredText(null)
    setActiveText(null)
  }, [currentPath])

  return (
    <Breadcrumb key={currentPath.map(s => s.path).join('/')}>
      <BreadcrumbList className="font-mono" style={{ fontSize: 'var(--text-size-base)' }}>
        {currentPath.map((segment, index) => {
          const isLast = index === currentPath.length - 1
          const isHovered = hoveredPath === segment.path
          const isActive = activePath === segment.path
          const isHome = segment.icon === 'home'
          const isFolder = segment.icon === 'folder'

          return (
            <div key={`${segment.path}-${isLast}-${index}`} className="contents">
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="flex items-center gap-1.5 text-lavender">
                    {isHome && <RiHome6Fill size={iconSize} className="text-lavender" />}
                    {isFolder && <RiFolderFill size={iconSize} className="text-lavender" />}
                    <span>{segment.name}</span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    onClick={() => onNavigate(segment.path)}
                    onMouseEnter={() => {
                      setHoveredPath(segment.path)
                      setHoveredText(segment.path)
                    }}
                    onMouseLeave={() => {
                      setHoveredPath(null)
                      setActivePath(null)
                      setHoveredText(null)
                      setActiveText(null)
                    }}
                    onMouseDown={() => {
                      setActivePath(segment.path)
                      setActiveText(segment.path)
                    }}
                    onMouseUp={() => {
                      setActivePath(null)
                      setActiveText(null)
                    }}
                    onTouchStart={() => {
                      setActivePath(segment.path)
                      setActiveText(segment.path)
                    }}
                    onTouchEnd={() => {
                      setActivePath(null)
                      setActiveText(null)
                    }}
                    onTouchCancel={() => {
                      setActivePath(null)
                      setActiveText(null)
                    }}
                    className="flex items-center gap-1.5 cursor-pointer transition-none"
                  >
                    {isHome && (
                      isActive ? (
                        <RiHome6Fill size={iconSize} className="text-lavender" />
                      ) : isHovered ? (
                        <RiHome6Fill size={iconSize} className="text-corpo-light" />
                      ) : (
                        <RiHome6Line size={iconSize} className="text-corpo-text" />
                      )
                    )}
                    {isFolder && (
                      isActive ? (
                        <RiFolderFill size={iconSize} className="text-lavender" />
                      ) : isHovered ? (
                        <RiFolderFill size={iconSize} className="text-corpo-light" />
                      ) : (
                        <RiFolderLine size={iconSize} className="text-corpo-text" />
                      )
                    )}
                    <span 
                      className={`transition-none ${
                        activeText === segment.path 
                          ? 'text-lavender' 
                          : hoveredText === segment.path 
                            ? 'text-corpo-light' 
                            : 'text-corpo-text'
                      }`}
                    >
                      {segment.name}
                    </span>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator>
                  <span className="text-corpo-border">/</span>
                </BreadcrumbSeparator>
              )}
            </div>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}


