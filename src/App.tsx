import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="w-full h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-foreground">
          Welcome to Vedanta Systems
        </h1>
        <p className="text-xl text-muted-foreground">
          A modern React + Vite + shadcn/ui frontend
        </p>
        
        <div className="bg-card border border-border rounded-lg p-8 shadow-lg">
          <p className="text-lg mb-4">Counter: {count}</p>
          <button
            onClick={() => setCount((count) => count + 1)}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-semibold"
          >
            Click me
          </button>
        </div>

        <p className="text-sm text-muted-foreground mt-8">
          Edit <code className="bg-muted px-2 py-1 rounded">src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </div>
  )
}

export default App
