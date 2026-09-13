// Mounted only by the browser test inside its existing dev-page context.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '../../src/components/ui/button'
import { BreadcrumbLink } from '../../src/components/ui/breadcrumb'
import { Badge } from '../../src/components/ui/badge'
import { Switch } from '../../src/components/ui/switch'

function Controls() {
  const [clicks, setClicks] = useState(0)
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button id="feedback-action" className="text-btn" onTouchStart={() => {}}
        onClick={() => setClicks(value => value + 1)}>Action</Button>
      <Button id="feedback-disabled" className="text-btn" disabled>Disabled</Button>
      <output id="feedback-clicks">{clicks}</output>
      <BreadcrumbLink id="feedback-link" href="#" onClick={event => event.preventDefault()}>
        Shared link
      </BreadcrumbLink>
      <Badge id="feedback-badge">Badge</Badge>
      <Switch id="feedback-switch" aria-label="Test switch" />
      <span id="feedback-signal" className="animate-pulse">Loading signal</span>
      {(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const).map(variant => (
        <Button key={variant} data-feedback-variant={variant} variant={variant}>{variant}</Button>
      ))}
    </div>
  )
}

export function mount() {
  const host = document.createElement('section')
  host.id = 'control-feedback-fixtures'
  host.setAttribute('aria-label', 'Control feedback test fixtures')
  Object.assign(host.style, {
    position: 'fixed', top: '100px', left: '0', right: '0',
    padding: '16px', background: 'black', zIndex: '10000',
  })
  document.body.append(host)
  createRoot(host).render(<Controls />)
}
