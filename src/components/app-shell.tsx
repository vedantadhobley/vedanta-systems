import type { ReactNode } from 'react'
import type { PathSegment } from './filesystem-nav'
import { BottomNav, Header } from './header'
import { ViewportDiagnostics } from './dev/viewport-diagnostics'

interface AppShellProps {
  children: ReactNode
  currentPath: PathSegment[]
  onNavigate: (path: string) => void
}

/**
 * Owns the current production viewport, header, and bottom navigation.
 *
 * The document remains the vertical scroll owner until the contained shell
 * profile passes its desktop and physical-device acceptance matrix.
 */
export function AppShell({ children, currentPath, onNavigate }: AppShellProps) {
  return (
    <>
      <div className="content-scroll" data-shell-scroll-profile="document">
        <Header currentPath={currentPath} onNavigate={onNavigate} />
        {children}
      </div>

      <BottomNav currentPath={currentPath} onNavigate={onNavigate} />
      <ViewportDiagnostics />
    </>
  )
}
