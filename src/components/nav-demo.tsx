import { useState } from 'react'
import { FileSystemNav, PathSegment } from './filesystem-nav'

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
}

export function NavDemo() {
  const [currentPath, setCurrentPath] = useState<PathSegment[]>([
    { name: '~', path: '~', icon: 'home' },
  ])

  const handleNavigate = (path: string) => {
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
      '~/about': [
        { name: '~', path: '~', icon: 'home' },
        { name: 'about', path: '~/about', icon: 'folder' }
      ]
    }

    const newPath = pathMap[path]
    if (newPath) {
      setCurrentPath(newPath)
    }
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto px-8 py-8 space-y-6">
      {/* Primary Navigation */}
      <div className="border border-corpo-border p-6">
        <FileSystemNav currentPath={currentPath} onNavigate={handleNavigate} />
      </div>

      {/* Folder Contents */}
      {folderContents[currentPath[currentPath.length - 1].path] && (
        <div className="space-y-4">
          <h2 className="text-corpo-text font-mono text-sm">
            Contents:
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {folderContents[currentPath[currentPath.length - 1].path].map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                className="px-4 py-3 border border-corpo-border text-corpo-text hover:text-lavender hover:border-lavender font-mono text-sm text-left transition-none"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
