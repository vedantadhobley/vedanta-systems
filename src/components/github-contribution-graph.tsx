import { useEffect, useState, useRef } from 'react'

interface ContributionDay {
  date: string
  count: number
  level: 'NONE' | 'FIRST_QUARTILE' | 'SECOND_QUARTILE' | 'THIRD_QUARTILE' | 'FOURTH_QUARTILE'
}

export function GitHubContributionGraph({ username }: { username: string }) {
  const [contributions, setContributions] = useState<ContributionDay[]>([])
  const [loading, setLoading] = useState(true)
  const [dataReady, setDataReady] = useState(false) // Track if data is fetched
  const [startWave, setStartWave] = useState(false) // Only start wave after first attempt
  const [wavePosition, setWavePosition] = useState(-5) // Start off-screen left
  const [error, setError] = useState<string | null>(null)
  const [weeksToShow, setWeeksToShow] = useState(52) // Start with max, will adjust
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchAttemptedRef = useRef(false) // Track if we've tried fetching

  // Calculate weeks to show based on available width
  useEffect(() => {
    const calculateWeeks = () => {
      if (!containerRef.current?.parentElement) return
      
      // Get the full viewport width
      const viewportWidth = window.innerWidth
      // On mobile (< 640px), use px-4 (32px total horizontal padding)
      // On desktop (>= 640px), use px-8 (64px total horizontal padding)
      const horizontalPadding = viewportWidth < 640 ? 32 : 64
      const availableWidth = viewportWidth - horizontalPadding
      
      const weekWidth = 16 // 12px square + 4px gap
      // Be more aggressive - fill the full width
      const calculatedWeeks = Math.min(Math.floor(availableWidth / weekWidth), 52)
      
      setWeeksToShow(Math.max(calculatedWeeks, 10))
    }

    // Wait for next tick to ensure ref is attached
    const timer = setTimeout(calculateWeeks, 0)

    // Use ResizeObserver for live updates
    const resizeObserver = new ResizeObserver(calculateWeeks)
    if (containerRef.current?.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement)
    }
    
    // Also listen to window resize
    window.addEventListener('resize', calculateWeeks)

    return () => {
      clearTimeout(timer)
      resizeObserver.disconnect()
      window.removeEventListener('resize', calculateWeeks)
    }
  }, [])

  // Fetch contributions - try immediately, then retry every second if fails
  useEffect(() => {
    const fetchContributions = async () => {
      if (fetchAttemptedRef.current && dataReady) return // Already have data
      
      fetchAttemptedRef.current = true
      
      try {
        const token = import.meta.env.VITE_GITHUB_TOKEN
        
        if (!token) {
          throw new Error('GitHub token not configured')
        }

        const query = `
          query($userName:String!) {
            user(login: $userName) {
              contributionsCollection {
                contributionCalendar {
                  totalContributions
                  weeks {
                    contributionDays {
                      contributionCount
                      date
                      contributionLevel
                    }
                  }
                }
              }
            }
          }
        `

        const response = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            query,
            variables: { userName: username },
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to fetch GitHub data')
        }

        const data = await response.json()

        if (data.errors) {
          throw new Error(data.errors[0].message)
        }

        const weeks = data.data.user.contributionsCollection.contributionCalendar.weeks
        const allContributions: ContributionDay[] = []

        weeks.forEach((week: any) => {
          week.contributionDays.forEach((day: any) => {
            allContributions.push({
              date: day.date,
              count: day.contributionCount,
              level: day.contributionLevel,
            })
          })
        })
        
        setContributions(allContributions)
        setDataReady(true) // Data ready!
        
        // If data loaded on first try, start wave to reveal it
        if (!startWave) {
          setStartWave(true)
        }
      } catch (err) {
        console.error('Error fetching contributions:', err)
        setError(err instanceof Error ? err.message : 'Failed to load contributions')
        // If first attempt fails, start wave animation and retry
        if (!startWave) {
          setStartWave(true)
        }
      }
    }

    // First attempt immediately
    fetchContributions()
    
    // If data not ready after first attempt, retry every second
    const retryInterval = setInterval(() => {
      if (!dataReady) {
        fetchContributions()
      }
    }, 1000)
    
    return () => clearInterval(retryInterval)
  }, [username, dataReady, startWave])

  // Wave animation effect - only starts after first fetch attempt
  useEffect(() => {
    if (!loading || !startWave) return // Don't animate until wave should start
    
    let frame = 0
    let isWaiting = false
    const frameRate = 60
    const columnsPerSecond = 20 // Speed: 20 columns per second (adjust this for faster/slower)
    const totalColumns = weeksToShow + 10 // Width of graph + buffer
    const waveDuration = (totalColumns / columnsPerSecond) * 1000 // Calculate duration based on width
    const framesPerWave = (waveDuration / 1000) * frameRate
    const distancePerFrame = totalColumns / framesPerWave
    
    const interval = setInterval(() => {
      if (isWaiting) return // Skip frames during wait period
      
      frame++
      const currentPosition = (frame * distancePerFrame) - 5 // Start at -5
      
      setWavePosition(currentPosition)
      
      // When wave reaches the end
      if (currentPosition >= weeksToShow + 5) {
        if (dataReady) {
          // Data is ready - reveal it!
          clearInterval(interval)
          setLoading(false)
        } else {
          // Data not ready yet - wait 1 second before resetting
          isWaiting = true
          setTimeout(() => {
            frame = 0
            setWavePosition(-5)
            isWaiting = false
          }, 1000)
        }
      }
    }, 1000 / frameRate)
    
    return () => clearInterval(interval)
  }, [loading, startWave, dataReady, weeksToShow])

  const getColor = (level: string) => {
    switch (level) {
      case 'NONE':
        return 'bg-[#1a1a1a]' // Very dark gray for no contributions (darker than level 1)
      case 'FIRST_QUARTILE':
        return 'bg-[#3d2d5c]' // Dark lavender
      case 'SECOND_QUARTILE':
        return 'bg-[#5a4080]' // Medium-dark lavender
      case 'THIRD_QUARTILE':
        return 'bg-[#7a5aaf]' // Medium lavender
      case 'FOURTH_QUARTILE':
        return 'bg-[#a57fd8]' // Bright lavender
      default:
        return 'bg-[#1a1a1a]'
    }
  }

  // Generate wave pattern colors - bright leading edge (right) fading to dark trailing edge (left)
  const getWaveColor = (weekIdx: number, _dayIdx: number) => {
    // Don't show wave if it hasn't started
    if (!startWave) return ''
    
    // Distance from wave position (positive = ahead of wave, negative = behind wave)
    const distanceFromWave = weekIdx - wavePosition
    
    // Ahead of wave - no color yet
    if (distanceFromWave > 1) return ''
    
    // Far behind wave - no color (data will be revealed)
    if (distanceFromWave < -5) return ''
    
    // Inside the wave - bright at RIGHT (front), fading to dark at LEFT (back)
    // Wave spans about 6 columns
    let intensity: number
    
    if (distanceFromWave > 0) {
      // Right side (leading edge): brightest
      intensity = 1 - distanceFromWave
    } else if (distanceFromWave > -5) {
      // Left side (trailing edge): fading from bright to dark
      intensity = 1 + (distanceFromWave / 5) // 0 to -5 becomes 1 to 0
    } else {
      intensity = 0
    }
    
    intensity = Math.max(0, Math.min(1, intensity))
    
    // Map intensity: 1.0 = brightest (RIGHT/front), 0.0 = darkest (LEFT/back)
    // Wave goes: Bright → Medium-bright → Medium → Dark → Very dark gray
    if (intensity > 0.8) return 'bg-[#a57fd8]' // Brightest lavender
    if (intensity > 0.6) return 'bg-[#7a5aaf]' // Medium-bright lavender
    if (intensity > 0.4) return 'bg-[#5a4080]' // Medium lavender
    if (intensity > 0.2) return 'bg-[#3d2d5c]' // Dark lavender
    if (intensity > 0) return 'bg-[#1a1a1a]'   // Very dark gray (like level 0)
    return '' // After wave passes completely
  }

  if (loading) {
    // Group contributions into weeks for display
    const weeks: ContributionDay[][] = []
    for (let i = 0; i < contributions.length; i += 7) {
      weeks.push(contributions.slice(i, i + 7))
    }
    const displayWeeks = weeks.slice(-weeksToShow)
    
    return (
      <div ref={containerRef} className="flex justify-center w-full">
        <div className="inline-flex gap-1">
          {Array.from({ length: weeksToShow }).map((_, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-1">
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const hasData = displayWeeks[weekIdx]?.[dayIdx]
                const distanceFromWave = weekIdx - wavePosition
                const waveColor = getWaveColor(weekIdx, dayIdx)
                
                // Determine the color
                let colorClass: string = ''
                
                if (hasData && dataReady) {
                  // We have real data - show wave until matching color passes
                  const targetLevel = hasData.level
                  
                  // Map levels to intensity thresholds
                  const levelToIntensity: Record<string, number> = {
                    'NONE': 0.1,  // Gray - locks when wave fades to gray
                    'FIRST_QUARTILE': 0.25,
                    'SECOND_QUARTILE': 0.5,
                    'THIRD_QUARTILE': 0.75,
                    'FOURTH_QUARTILE': 1.0
                  }
                  
                  // Get wave's current intensity at this position
                  const getWaveIntensity = (color: string): number => {
                    if (color.includes('#a57fd8')) return 1.0
                    if (color.includes('#7a5aaf')) return 0.75
                    if (color.includes('#5a4080')) return 0.5
                    if (color.includes('#3d2d5c')) return 0.25
                    if (color.includes('#1a1a1a')) return 0.1
                    return 0
                  }
                  
                  const currentWaveIntensity = getWaveIntensity(waveColor)
                  const targetIntensity = levelToIntensity[targetLevel]
                  
                  // Lock when wave intensity drops to or below target intensity
                  if (distanceFromWave < 0 && currentWaveIntensity <= targetIntensity) {
                    colorClass = getColor(targetLevel)
                  } else {
                    colorClass = waveColor
                  }
                } else if (!dataReady) {
                  // No data yet - NO SQUARES AT ALL (stay black background)
                  colorClass = ''
                } else if (!hasData) {
                  // Data ready but no data for this square (future) - don't render
                  return (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      className="w-3 h-3"
                    />
                  )
                }
                
                // Don't render empty squares (before wave or after wave with no data)
                if (!colorClass) {
                  return (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      className="w-3 h-3"
                    />
                  )
                }
                
                return (
                  <div
                    key={`${weekIdx}-${dayIdx}`}
                    className={`w-3 h-3 ${colorClass} transition-colors duration-150 ease-linear`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="text-sm text-corpo-text">{error}</div>
  }

  // Group into weeks for display (7 rows)
  // Keep all contributions as they come from GitHub (already properly structured by week)
  const weeks: ContributionDay[][] = []
  for (let i = 0; i < contributions.length; i += 7) {
    weeks.push(contributions.slice(i, i + 7))
  }
  
  // Dynamically calculate weeks to fit available width
  // Uses ResizeObserver to recalculate as container size changes
  // Fills available space automatically from 13 weeks (min) to 52 weeks (max)
  const displayWeeks = weeks.slice(-weeksToShow)

  return (
    <div ref={containerRef} className="flex justify-center w-full">
      <div className="inline-flex gap-1">
        {/* Dynamically fills available width */}
        {displayWeeks.map((week: ContributionDay[], weekIdx: number) => (
          <div key={weekIdx} className="flex flex-col gap-1">
            {week.map((day: ContributionDay) => (
              <div
                key={day.date}
                className={`w-3 h-3 ${getColor(day.level)}`}
                title={`${day.date}: ${day.count} contributions`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
