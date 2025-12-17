import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type TimezoneMode = 'local' | 'utc'

interface TimezoneContextType {
  mode: TimezoneMode
  toggleMode: () => void
  localTimezone: string
  formatTime: (date: Date, includeSeconds?: boolean) => string
  formatTimeWithZone: (date: Date, includeSeconds?: boolean) => string
  getTimezoneAbbr: () => string
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined)

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TimezoneMode>('local')
  const [localTimezone, setLocalTimezone] = useState<string>('')

  useEffect(() => {
    // Get the user's local timezone abbreviation
    const getTimezoneAbbr = () => {
      const date = new Date()
      const timeString = date.toLocaleTimeString('en-US', { timeZoneName: 'short' })
      const match = timeString.match(/[A-Z]{2,5}$/)
      return match ? match[0] : Intl.DateTimeFormat().resolvedOptions().timeZone
    }
    setLocalTimezone(getTimezoneAbbr())
  }, [])

  const toggleMode = () => {
    setMode(prev => prev === 'local' ? 'utc' : 'local')
  }

  const getTimezoneAbbr = () => {
    return mode === 'utc' ? 'UTC' : localTimezone
  }

  const formatTime = (date: Date, includeSeconds = false) => {
    if (mode === 'utc') {
      const hours = date.getUTCHours().toString().padStart(2, '0')
      const minutes = date.getUTCMinutes().toString().padStart(2, '0')
      if (includeSeconds) {
        const seconds = date.getUTCSeconds().toString().padStart(2, '0')
        return `${hours}:${minutes}:${seconds}`
      }
      return `${hours}:${minutes}`
    } else {
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      if (includeSeconds) {
        const seconds = date.getSeconds().toString().padStart(2, '0')
        return `${hours}:${minutes}:${seconds}`
      }
      return `${hours}:${minutes}`
    }
  }

  const formatTimeWithZone = (date: Date, includeSeconds = false) => {
    return `${formatTime(date, includeSeconds)} ${getTimezoneAbbr()}`
  }

  return (
    <TimezoneContext.Provider value={{ 
      mode, 
      toggleMode, 
      localTimezone, 
      formatTime, 
      formatTimeWithZone,
      getTimezoneAbbr
    }}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone() {
  const context = useContext(TimezoneContext)
  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider')
  }
  return context
}
