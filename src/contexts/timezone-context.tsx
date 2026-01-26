import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type TimezoneMode = 'local' | 'utc'

interface TimezoneContextType {
  mode: TimezoneMode
  toggleMode: () => void
  localTimezone: string
  formatTime: (date: Date, includeSeconds?: boolean) => string
  formatTimeWithZone: (date: Date, includeSeconds?: boolean) => string
  getTimezoneAbbr: () => string
  // Timezone-aware date utilities
  getDateForTimestamp: (isoTimestamp: string) => string  // Returns YYYY-MM-DD in current mode
  getToday: () => string      // Today's date in current mode
  getTomorrow: () => string   // Tomorrow's date in current mode
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

  // Get YYYY-MM-DD for a timestamp in current timezone mode
  const getDateForTimestamp = (isoTimestamp: string): string => {
    const date = new Date(isoTimestamp)
    if (mode === 'utc') {
      return date.toISOString().slice(0, 10)
    } else {
      // Use en-CA locale which gives YYYY-MM-DD format in local timezone
      return date.toLocaleDateString('en-CA')
    }
  }

  // Get today's date in current timezone mode
  const getToday = (): string => {
    const now = new Date()
    if (mode === 'utc') {
      return now.toISOString().slice(0, 10)
    } else {
      return now.toLocaleDateString('en-CA')
    }
  }

  // Get tomorrow's date in current timezone mode
  const getTomorrow = (): string => {
    const now = new Date()
    if (mode === 'utc') {
      const tomorrow = new Date(now)
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      return tomorrow.toISOString().slice(0, 10)
    } else {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow.toLocaleDateString('en-CA')
    }
  }

  return (
    <TimezoneContext.Provider value={{ 
      mode, 
      toggleMode, 
      localTimezone, 
      formatTime, 
      formatTimeWithZone,
      getTimezoneAbbr,
      getDateForTimestamp,
      getToday,
      getTomorrow
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
