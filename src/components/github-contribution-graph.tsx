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
  const [waveActive, setWaveActive] = useState(true) // Track if wave is currently running
  const [wavePosition, setWavePosition] = useState(-5) // Start off-screen left
  const [error, setError] = useState<string | null>(null)
  const [weeksToShow, setWeeksToShow] = useState(52) // Start with max, will adjust
  const [unlockedSquares, setUnlockedSquares] = useState<Set<string>>(new Set()) // Track unlocked squares during erasure
  const containerRef = useRef<HTMLDivElement>(null)
  const waveIntervalRef = useRef<number | null>(null) // Track wave animation interval
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
    if (!waveActive) return
    
    // Clear any existing intervals/timers
    if (waveIntervalRef.current) clearInterval(waveIntervalRef.current)
    if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current)
    
    // Reset unlocked squares at start of each wave
    setUnlockedSquares(new Set())
    
    // Fetch data at start of each wave
    fetchContributions()
    
    let frame = 0
    const frameRate = 60
    const columnsPerSecond = 20
    const totalColumns = weeksToShow + 10
    const waveDuration = (totalColumns / columnsPerSecond) * 1000
    const framesPerWave = (waveDuration / 1000) * frameRate
    const distancePerFrame = totalColumns / framesPerWave
    
    waveIntervalRef.current = setInterval(() => {
      frame++
      const currentPosition = (frame * distancePerFrame) - 5
      setWavePosition(currentPosition)
      
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
        const delayMs = currentDataReady ? 10000 : 1000 // 10 seconds if data ready, 1 second if not
        
        autoRefreshTimerRef.current = setTimeout(() => {
          setWavePosition(-5) // Reset to start
          setWaveActive(false) // Trigger useEffect re-run
          setTimeout(() => setWaveActive(true), 0)
        }, delayMs) as unknown as number
      }
    }, 1000 / frameRate) as unknown as number
    
    return () => {
      if (waveIntervalRef.current) clearInterval(waveIntervalRef.current)
      if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current)
    }
    // Only re-run when wave restarts or weeks change, NOT when dataReady changes mid-wave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveActive, weeksToShow])

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
    // Only show wave when active
    if (!waveActive) return ''
    
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
                
                if (hasData) {
                  // We have contribution data in the array
                  const targetLevel = hasData.level
                  const targetColor = getColor(targetLevel)
                  
                  // Check if this is initial load (never revealed) vs connection lost (was revealed)
                  if (!dataReady && !hasBeenRevealed) {
                    // Initial load - data not ready yet, never been revealed
                    // Show wave gradient, then leave transparency AFTER wave fully passes
                    if (waveColor) {
                      // Wave is at this position - show gradient
                      colorClass = waveColor
                    } else if (distanceFromWave < -5) {
                      // Wave has FULLY passed (more than 5 columns behind) - leave transparency
                      colorClass = ''
                    } else {
                      // Wave hasn't reached yet OR is still within trailing edge - stay transparent
                      colorClass = ''
                    }
                  } else if (!dataReady && hasBeenRevealed) {
                    // Connection lost - had data before, but lost it
                    // Reverse reveal: unset each square when its matching color passes over it,
                    // then let the rest of the wave continue to darken it until it disappears
                    
                    const squareKey = `${weekIdx}-${dayIdx}`
                    const isUnlocked = unlockedSquares.has(squareKey)
                    const targetIntensity = levelToIntensityMap[targetLevel]
                    
                    if (isUnlocked) {
                      // Already unlocked - show wave gradient or disappear after wave passes
                      if (waveColor) {
                        colorClass = waveColor
                      } else if (distanceFromWave < -5) {
                        // Wave has FULLY passed - disappear
                        colorClass = ''
                      } else {
                        // Between wave colors - keep showing last wave color or black
                        colorClass = colors.level0
                      }
                    } else if (waveColor) {
                      const currentWaveIntensity = getWaveIntensity(waveColor)
                      
                      // Check if this square should be unlocked now
                      if (distanceFromWave < 0 && currentWaveIntensity <= targetIntensity) {
                        // Unlock this square!
                        setUnlockedSquares(prev => new Set(prev).add(squareKey))
                        colorClass = waveColor
                      } else if (currentWaveIntensity > targetIntensity) {
                        // Wave is passing but hasn't unlocked this square yet
                        // Show wave gradient OVER the original data
                        colorClass = waveColor
                      } else {
                        // Wave approaching but not here yet
                        colorClass = targetColor
                      }
                    } else if (distanceFromWave < -5) {
                      // Wave has FULLY passed - disappear (transparent)
                      colorClass = ''
                    } else {
                      // Wave hasn't reached yet - keep showing old data
                      colorClass = targetColor
                    }
                  } else if (hasBeenRevealed) {
                    // Data has been revealed before - wave just refreshes over visible data
                    if (waveColor) {
                      // Wave is passing - show wave gradient
                      const currentWaveIntensity = getWaveIntensity(waveColor)
                      const targetIntensity = levelToIntensityMap[targetLevel]
                      
                      // Show wave gradient until it passes, then lock to target color
                      if (distanceFromWave < 0 && currentWaveIntensity <= targetIntensity) {
                        colorClass = targetColor
                      } else {
                        colorClass = waveColor
                      }
                    } else {
                      // Wave not here - always show data (already revealed)
                      colorClass = targetColor
                    }
                  } else if (waveColor) {
                    // First reveal in progress - wave is passing
                    // Data is ready AND wave is passing over this square
                    const currentWaveIntensity = getWaveIntensity(waveColor)
                    const targetIntensity = levelToIntensityMap[targetLevel]
                    
                    // Show wave gradient until it passes, then lock to target color
                    if (distanceFromWave < 0 && currentWaveIntensity <= targetIntensity) {
                      colorClass = targetColor
                    } else {
                      colorClass = waveColor
                    }
                  } else {
                    // Wave not at this position
                    // Only show data if wave has already passed (distanceFromWave < 0)
                    if (distanceFromWave < 0) {
                      // Wave has passed - show the actual data color
                      colorClass = targetColor
                    } else {
                      // Wave hasn't reached yet - stay transparent
                      colorClass = ''
                    }
                  }
                } else if (!dataReady) {
                  // No data available and no contribution data in array for this square
                  // Show wave gradient as it passes, leave transparency after
                  if (waveColor) {
                    // Wave is at this position - show gradient
                    colorClass = waveColor
                  } else if (distanceFromWave < -5) {
                    // Wave has FULLY passed - leave transparency
                    colorClass = ''
                  } else {
                    // Before wave arrives or still in trailing zone - stay transparent
                    colorClass = ''
                  }
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
                    className={`w-3 h-3 ${colorClass}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
}
