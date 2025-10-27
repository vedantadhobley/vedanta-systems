import { RiHome5Line, RiHome5Fill, RiFolderLine, RiFolderFill } from '@remixicon/react'
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

  // Clear hover state when path changes
  useEffect(() => {
    setHoveredPath(null)
  }, [currentPath])

  return (
    <Breadcrumb>
      <BreadcrumbList className="text-sm font-mono">
        {currentPath.map((segment, index) => {
          const isLast = index === currentPath.length - 1
          const isHovered = hoveredPath === segment.path
          const isHome = segment.icon === 'home'
          const isFolder = segment.icon === 'folder'

          return (
            <div key={`${segment.path}-${isLast}`} className="contents">
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="flex items-center gap-1.5 text-lavender">
                    {isHome && <RiHome5Fill size={14} className="text-lavender" />}
                    {isFolder && <RiFolderFill size={14} className="text-lavender" />}
                    <span>{segment.name}</span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    onClick={() => onNavigate(segment.path)}
                    onMouseEnter={() => setHoveredPath(segment.path)}
                    onMouseLeave={() => setHoveredPath(null)}
                    className="flex items-center gap-1.5 text-corpo-text cursor-pointer transition-none group"
                  >
                    {isHome && (
                      isHovered 
                        ? <RiHome5Fill size={14} className="text-corpo-text" />
                        : <RiHome5Line size={14} className="text-corpo-text" />
                    )}
                    {isFolder && (
                      isHovered 
                        ? <RiFolderFill size={14} className="text-corpo-text" />
                        : <RiFolderLine size={14} className="text-corpo-text" />
                    )}
                    <span>{segment.name}</span>
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


