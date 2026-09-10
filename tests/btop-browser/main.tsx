import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BtopMonitor } from '../../src/components/btop-monitor'
import '../../src/index.css'

export function Preview() {
  const [visible, setVisible] = useState(true)
  return <main style={{ maxWidth: 1100, margin: '24px auto', padding: 12 }}>
    <h1>btop · packaged-image acceptance</h1>
    <p>Isolated broker. Existing renderer. No production tile changes.</p>
    <button onClick={() => setVisible(value => !value)}>
      {visible ? 'Hide monitor' : 'Show monitor'}
    </button>
    {visible && <section id="monitor"><BtopMonitor label="luv" apiPrefix="/api/btop/luv" /></section>}
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
