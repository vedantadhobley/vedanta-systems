import { useEffect, useState } from 'react'

export function Header() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatUTC = (date: Date) => {
    const hours = date.getUTCHours().toString().padStart(2, '0')
    const minutes = date.getUTCMinutes().toString().padStart(2, '0')
    const seconds = date.getUTCSeconds().toString().padStart(2, '0')
    return `${hours}:${minutes}:${seconds} UTC`
  }

  return (
    <header className="w-full border-b border-corpo-border">
      <div className="max-w-[1400px] mx-auto px-8 py-6 flex items-center justify-between">
        <div className="flex-1" />
        
        <h1 className="text-corpo-light text-xl font-mono tracking-tight">
          vedanta.systems
        </h1>
        
        <div className="flex-1 flex justify-end">
          <time className="text-corpo-text text-sm font-mono tabular-nums">
            {formatUTC(time)}
          </time>
        </div>
      </div>
    </header>
  )
}
