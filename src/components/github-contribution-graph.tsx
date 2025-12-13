import { useEffect, useState, useRef, useMemo, useCallback } from 'react'

/**
 * GitHub Contribution Graph - Standalone Component
 * 
 * Features:
 * - Fetches real GitHub contribution data via GraphQL API
 * - Animated wave effect that reveals data left-to-right
 * - Fully responsive width calculation
 * - Background-agnostic (unrevealed squares are transparent/invisible)
 * - Customizable 5-color gradient system
 * 
 * Color System:
 * - level0: 0 contributions (default: dark gray #1a1a1a)
 * - level1-4: Low to high contributions (default: lavender gradient)
 * - "No data" state: Transparent/invisible until wave reveals
 * 
 * The wave sweeps at 20 columns/second, revealing actual contribution data
 * as matching colors pass. Squares before the wave remain invisible.
 */

interface ContributionDay {
  date: string
  count: number
  level: 'NONE' | 'FIRST_QUARTILE' | 'SECOND_QUARTILE' | 'THIRD_QUARTILE' | 'FOURTH_QUARTILE'
}

/**
 * Color scheme configuration - customize to match your design system
 * 
 * @example
 * // Default lavender on black background
 * <div className="bg-black">
 *   <GitHubContributionGraph username="yourname" />
 * </div>
 * 
 * @example
 * // Custom green theme
 * <GitHubContributionGraph 
 *   username="yourname"
 *   colors={{
 *     level0: 'bg-gray-800',
 *     level1: 'bg-green-900',
 *     level2: 'bg-green-700',
 *     level3: 'bg-green-500',
 *     level4: 'bg-green-300',
 *   }}
 * />
 */
interface ColorScheme {
  level0: string         // NONE - 0 contributions (visible, e.g., dark gray)
  level1: string         // FIRST_QUARTILE - low contribution level
  level2: string         // SECOND_QUARTILE - medium-low
  level3: string         // THIRD_QUARTILE - medium-high
  level4: string         // FOURTH_QUARTILE - highest contribution level
}

// Default lavender gradient with dark gray for 0 contributions
const DEFAULT_COLORS: ColorScheme = {
  level0: 'bg-[#1a1a1a]',  // Very dark gray for 0 contributions
  level1: 'bg-[#3d2d5c]',  // Dark lavender
  level2: 'bg-[#5a4080]',  // Medium-dark lavender
  level3: 'bg-[#7a5aaf]',  // Medium lavender
  level4: 'bg-[#a57fd8]',  // Bright lavender
}

interface GitHubContributionGraphProps {
  username: string
  colors?: ColorScheme  // Optional: customize colors
}

export function GitHubContributionGraph({ 
  username, 
  colors = DEFAULT_COLORS
}: GitHubContributionGraphProps) {
  const [contributions, setContributions] = useState<ContributionDay[]>([])
  const [dataReady, setDataReady] = useState(false) // Track if data is fetched
  const [hasBeenRevealed, setHasBeenRevealed] = useState(false) // Track if data has been revealed once
  const [wavePosition, setWavePosition] = useState(-5) // Start off-screen left
  const [waveCycle, setWaveCycle] = useState(0) // Trigger for new wave cycles
  const [error, setError] = useState<string | null>(null)
  const [weeksToShow, setWeeksToShow] = useState(52) // Start with max, will adjust
  const [revealTimes, setRevealTimes] = useState<Map<string, number>>(new Map()) // When each square was revealed
  const [, setRenderTick] = useState(0) // Force re-renders for fade updates
  const containerRef = useRef<HTMLDivElement>(null)
  const waveIntervalRef = useRef<number | null>(null) // Track wave animation interval
  const fadeAnimationRef = useRef<number | null>(null) // Track continuous fade animation
  const autoRefreshTimerRef = useRef<number | null>(null) // Track auto-refresh timer
  const dataReadyRef = useRef(dataReady) // Track current dataReady value for wave completion
  const hasBeenRevealedRef = useRef(hasBeenRevealed) // Track current hasBeenRevealed value

  // Memoize intensity mappings (calculated once, reused for all squares)
  const levelToIntensityMap = useMemo(() => ({
    'NONE': 0.1,
    'FIRST_QUARTILE': 0.25,
    'SECOND_QUARTILE': 0.5,
    'THIRD_QUARTILE': 0.75,
    'FOURTH_QUARTILE': 1.0
  }), [])

  const getWaveIntensity = useCallback((color: string): number => {
    if (color === colors.level4) return 1.0
    if (color === colors.level3) return 0.75
    if (color === colors.level2) return 0.5
    if (color === colors.level1) return 0.25
    if (color === colors.level0) return 0.1
    return 0
  }, [colors.level0, colors.level1, colors.level2, colors.level3, colors.level4])

  // Keep refs in sync with state
  useEffect(() => {
    dataReadyRef.current = dataReady
  }, [dataReady])

  useEffect(() => {
    hasBeenRevealedRef.current = hasBeenRevealed
  }, [hasBeenRevealed])

  // Continuous fade animation - runs independently of wave movement
  useEffect(() => {
    const frameRate = 60 // 60fps for smooth fade updates
    
    fadeAnimationRef.current = setInterval(() => {
      setRenderTick(tick => tick + 1) // Force re-render to update fade calculations
    }, 1000 / frameRate) as unknown as number
    
    return () => {
      if (fadeAnimationRef.current) clearInterval(fadeAnimationRef.current)
    }
  }, []) // Run once on mount, never stop

  // Calculate weeks to show based on available width
  useEffect(() => {
    const calculateWeeks = () => {
      if (!containerRef.current?.parentElement) return
      
      // Get the container's actual width (respects max-width)
      const containerWidth = containerRef.current.parentElement.offsetWidth
      
      // Bigger squares on desktop (768px+)
      const weekWidth = window.innerWidth >= 768 ? 22 : 16 // 18px square + 4px gap on desktop, 12px + 4px on mobile
      // Calculate weeks to show based on container width
      const calculatedWeeks = Math.min(Math.floor(containerWidth / weekWidth), 52)
      
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

  // Fetch contributions - called every time a wave starts
  const fetchContributions = async () => {
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
      if (!dataReady) {
        setDataReady(true) // Mark data as ready on first successful fetch
      }
      // Clear any previous errors
      setError(null)
    } catch (err) {
      console.error('Error fetching contributions:', err)
      
      // Only show error UI if we've never successfully loaded data
      if (!hasBeenRevealed) {
        setError(err instanceof Error ? err.message : 'Failed to load contributions')
      }
      
      // If data fetch fails, mark data as not ready (will trigger erasure on next wave)
      // But keep hasBeenRevealed as true so old data stays visible until wave erases it
      if (dataReady) {
        setDataReady(false)
      }
    }
  }

  // Wave animation effect - fetches data and animates continuously
  useEffect(() => {
    // Clear any existing intervals/timers
    if (waveIntervalRef.current) clearInterval(waveIntervalRef.current)
    if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current)
    
    // DO NOT clear reveal times - they persist across waves
    // This ensures squares continue their natural fade until repainted
    
    // Fetch data at start of each wave
    fetchContributions()
    
    let frame = 0
    const frameRate = 60
    const columnsPerSecond = 20
    const totalColumns = weeksToShow + 30 // Extended to account for fade wave starting earlier
    const waveDuration = (totalColumns / columnsPerSecond) * 1000
    const framesPerWave = (waveDuration / 1000) * frameRate
    const distancePerFrame = totalColumns / framesPerWave
    
    // Reset wave position - start from left edge
    setWavePosition(-5)
    
    waveIntervalRef.current = setInterval(() => {
      frame++
      const currentPosition = (frame * distancePerFrame) - 5
      setWavePosition(currentPosition)
      
      // Track when squares are revealed by the wave (for all waves, including first)
      // Set timestamp when wave front passes - this is when the square gets "painted"
      const now = Date.now()
      
      for (let weekIdx = 0; weekIdx < weeksToShow; weekIdx++) {
        const distanceFromWave = weekIdx - currentPosition
        // Update reveal time when wave is RIGHT at this column (narrow window)
        if (distanceFromWave >= -0.5 && distanceFromWave <= 0.5) {
          for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
            const key = `${weekIdx}-${dayIdx}`
            // ALWAYS update - this resets the fade when wave repaints
            setRevealTimes(prev => new Map(prev).set(key, now))
          }
        }
      }
      
      // When wave reaches the end
      if (currentPosition >= weeksToShow + 5) {
        if (waveIntervalRef.current) clearInterval(waveIntervalRef.current)
        
        // Read current values from refs (not stale closure values)
        const currentDataReady = dataReadyRef.current
        const currentHasBeenRevealed = hasBeenRevealedRef.current
        
        // Update revealed state based on data availability
        if (currentDataReady && !currentHasBeenRevealed) {
          // Data is ready and this is first reveal - mark as revealed
          setHasBeenRevealed(true)
        } else if (!currentDataReady && currentHasBeenRevealed) {
          // Data was lost and erasure wave just completed - reset revealed state
          setHasBeenRevealed(false)
        }
        
        // Wave completed - schedule next wave based on data availability
        const delayMs = currentDataReady ? 5000 : 1000 // 5 seconds if data ready, 1 second if not
        
        autoRefreshTimerRef.current = setTimeout(() => {
          setWaveCycle(prev => prev + 1) // Increment to trigger new wave
        }, delayMs) as unknown as number
      }
    }, 1000 / frameRate) as unknown as number
    
    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current)
      if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current)
    }
  }, [waveCycle, weeksToShow])

  const getColor = (level: string) => {
    switch (level) {
      case 'NONE':
        return colors.level0
      case 'FIRST_QUARTILE':
        return colors.level1
      case 'SECOND_QUARTILE':
        return colors.level2
      case 'THIRD_QUARTILE':
        return colors.level3
      case 'FOURTH_QUARTILE':
        return colors.level4
      default:
        return colors.level0
    }
  }

  // Generate wave pattern colors - bright leading edge (right) fading to dark trailing edge (left)
  const getWaveColor = (weekIdx: number, _dayIdx: number) => {
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
    // Wave goes: Bright → Medium-bright → Medium → Dark → Very dark
    if (intensity > 0.8) return colors.level4 // Brightest
    if (intensity > 0.6) return colors.level3 // Medium-bright
    if (intensity > 0.4) return colors.level2 // Medium
    if (intensity > 0.2) return colors.level1 // Dark
    if (intensity > 0) return colors.level0   // Very dark (0 contributions color)
    return '' // After wave passes completely
  }

  // Calculate radar-style fade for a specific square
  const getRadarFade = (squareKey: string): number => {
    const revealTime = revealTimes.get(squareKey)
    if (revealTime === undefined) {
      // Square has never been painted yet - show at minimum opacity
      return 0.25
    }
    
    const elapsed = Date.now() - revealTime
    const fadeProgress = Math.min(elapsed / 7500, 1) // 7.5 second fade (2.5s wave + 5s delay)
    const opacity = 1 - (fadeProgress * 0.75) // Fade from 100% to 25%
    
    // Clamp to minimum 25% - squares that finished fading stay at 25% until repainted
    return Math.max(opacity, 0.25)
  }

  // Only show error if we have never loaded data and have an error
  // Otherwise, keep showing the graph (even if empty/pulsing)
  if (error && !hasBeenRevealed && contributions.length === 0) {
    return (
      <div className="flex justify-center w-full">
        <div className="text-sm text-corpo-text opacity-50">
          {error}
        </div>
      </div>
    )
  }

  // Group contributions into weeks for display
  const weeks: ContributionDay[][] = []
  for (let i = 0; i < contributions.length; i += 7) {
    weeks.push(contributions.slice(i, i + 7))
  }
  const displayWeeks = weeks.slice(-weeksToShow)
  
  return (
    <a 
      href={`https://github.com/${username}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full cursor-pointer"
      style={{ backgroundColor: 'transparent' }}
    >
      <div ref={containerRef} className="w-full" style={{ backgroundColor: 'transparent' }}>
        <div className="max-w-[1140px] mx-auto px-4 md:px-8 pt-0 pb-0 h-[148px] md:h-[198px]">
          {/* Graph container - responsive width */}
          <div 
            className="flex flex-col gap-3 w-full"
            style={{
              opacity: displayWeeks.length > 0 ? 1 : 0,
              transition: 'opacity 0.3s ease-in'
            }}
          >
            {/* Contribution graph */}
            <div className="inline-flex gap-1 justify-center w-full">
          {Array.from({ length: weeksToShow }).map((_, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-1">
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const hasData = displayWeeks[weekIdx]?.[dayIdx]
                const distanceFromWave = weekIdx - wavePosition
                const waveColor = getWaveColor(weekIdx, dayIdx)
                const squareKey = `${weekIdx}-${dayIdx}`
                
                // Determine the color and opacity
                let colorClass: string = ''
                let opacity: number = 1
                
                if (hasData) {
                  const targetLevel = hasData.level
                  const targetColor = getColor(targetLevel)
                  const squareKey = `${weekIdx}-${dayIdx}`
                  
                  // Check if wave is currently painting this square
                  if (waveColor) {
                    const currentWaveIntensity = getWaveIntensity(waveColor)
                    const targetIntensity = levelToIntensityMap[targetLevel]
                    
                    if (distanceFromWave < 0 && currentWaveIntensity <= targetIntensity) {
                      // Wave front has passed - show data color at full brightness
                      colorClass = targetColor
                      opacity = 1
                    } else {
                      // Still in wave gradient
                      colorClass = waveColor
                      opacity = 1
                    }
                  } else if (distanceFromWave < 0 || hasBeenRevealed) {
                    // Wave has passed OR data was previously revealed - show with fade
                    colorClass = targetColor
                    opacity = getRadarFade(squareKey)
                  } else {
                    // First wave hasn't reached this square yet - invisible
                    colorClass = ''
                  }
                } else if (!hasData) {
                  // No data for this square
                  return (
                    <div
                      key={squareKey}
                      className="w-3 h-3 md:w-[18px] md:h-[18px]"
                    />
                  )
                }
                
                // Don't render empty squares
                if (!colorClass) {
                  return (
                    <div
                      key={squareKey}
                      className="w-3 h-3 md:w-[18px] md:h-[18px]"
                    />
                  )
                }
                
                return (
                  <div
                    key={squareKey}
                    className={`w-3 h-3 md:w-[18px] md:h-[18px] ${colorClass}`}
                    style={opacity < 1 ? { opacity } : undefined}
                  />
                )
              })}
            </div>
          ))}
          </div>
        </div>
        </div>
      </div>
    </a>
  )
}