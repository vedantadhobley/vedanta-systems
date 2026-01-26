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
  const [iconSize, setIconSize] = useState(window.innerWidth >= 768 ? 20 : 16)

  // Update icon size on resize
  useEffect(() => {
    const handleResize = () => {
      setIconSize(window.innerWidth >= 768 ? 20 : 16)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <Breadcrumb key={currentPath.map(s => s.path).join('/')}>
      <BreadcrumbList className="font-mono" style={{ fontSize: 'var(--text-size-base)' }}>
        {currentPath.map((segment, index) => {
          const isLast = index === currentPath.length - 1
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
                    onTouchStart={() => {}} // Required for iOS :active to work
                    className="nav-btn flex items-center gap-1.5 cursor-pointer"
                  >
                    {isHome && (
                      <>
                        <RiHome6Line size={iconSize} className="icon-line" />
                        <RiHome6Fill size={iconSize} className="icon-fill" />
                      </>
                    )}
                    {isFolder && (
                      <>
                        <RiFolderLine size={iconSize} className="icon-line" />
                        <RiFolderFill size={iconSize} className="icon-fill" />
                      </>
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


