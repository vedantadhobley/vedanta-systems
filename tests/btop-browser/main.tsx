import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BtopMonitor } from '../../src/components/btop-monitor'
import '../../src/index.css'

export function Preview() {
  const [visible, setVisible] = useState(true)
  return <main style={{ maxWidth: 1100, margin: '24px auto', padding: 12 }}>
    <h1>btop · luv preview</h1>
    <p>Real luv data. Isolated broker. Production unchanged.</p>
    <p>Try locking and reopening your phone; the clock and readings should resume without a reload.</p>
    <button onClick={() => setVisible(value => !value)}>
      {visible ? 'Hide monitor' : 'Show monitor'}
    </button>
    {visible && <section id="monitor"><BtopMonitor label="luv" apiPrefix="/api/btop/luv" /></section>}
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
