import { useEffect, useRef } from 'react'

export function MoonBackground() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null)
  const displayCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const sourceCanvas = sourceCanvasRef.current
    const displayCanvas = displayCanvasRef.current
    if (!video || !sourceCanvas || !displayCanvas) return

    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
    const displayCtx = displayCanvas.getContext('2d', { willReadFrequently: true })
    if (!sourceCtx || !displayCtx) return

    let animationId: number
    let lastFrameTime = 0
    let lastAnimationCheck = 0  // Track when animation last ran (for watchdog)
    const FPS = 15
    
    // Simple characters that look good as pixels
    const ASCII_CHARS = ' ░▒▓█'
    const COLS = 80
    const ROWS = 80
    const PIXEL_SIZE = 6 // Size of each "character" pixel

    const setupCanvases = () => {
      sourceCanvas.width = COLS
      sourceCanvas.height = ROWS
      displayCanvas.width = COLS * PIXEL_SIZE
      displayCanvas.height = ROWS * PIXEL_SIZE
      
      // Disable image smoothing for crisp pixels
      displayCtx.imageSmoothingEnabled = false
      console.log('Canvas setup:', displayCanvas.width, 'x', displayCanvas.height)
    }

    // Draw ASCII as pixel blocks on canvas
    const drawFrame = (timestamp: number) => {
      lastAnimationCheck = performance.now()  // Update watchdog timestamp
      
      if (video.paused || video.ended) {
        animationId = requestAnimationFrame(drawFrame)
        return
      }

      // Throttle to 15 FPS
      if (timestamp - lastFrameTime < 1000 / FPS) {
        animationId = requestAnimationFrame(drawFrame)
        return
      }
      lastFrameTime = timestamp

      // Draw video to small source canvas
      sourceCtx.drawImage(video, 0, 0, COLS, ROWS)
      const imageData = sourceCtx.getImageData(0, 0, COLS, ROWS)
      
      const centerX = COLS / 2
      const centerY = ROWS / 2
      const radius = COLS * 0.48
      
      // Clear display canvas
      displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
      
      // Draw each pixel as a solid block
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          // Circular mask
          const dx = x - centerX
          const dy = y - centerY
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          if (distance > radius) continue
          
          const offset = (y * COLS + x) * 4
          const red = imageData.data[offset]
          const green = imageData.data[offset + 1]
          const blue = imageData.data[offset + 2]
          
          // let brightness = (red + green + blue) / 3
          
          // // Skip very dark pixels
          // if (brightness < 16) continue
          
          // // Expand dynamic range in highlights only
          // // Remap 40-255 to use more of the brightness spectrum
          // brightness = ((brightness - 16) / (255 - 16)) * 255
          
          // // Very aggressive power curve to reveal detail in bright areas
          // brightness = Math.pow(brightness / 255, 1) * 255
          
          // const charIndex = Math.floor((brightness / 255) * (ASCII_CHARS.length - 1))
          // const char = ASCII_CHARS[charIndex]
          
          // // Skip spaces
          // if (char === ' ') continue
          
          // const gray = Math.floor(brightness)
          // displayCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`

          // // --- Get average brightness ---
          // let brightness = (red + green + blue) / 3

          // // Skip absolute black pixels (noise floor)
          // if (brightness < 4) continue

          // // Normalize 0–1
          // let b = brightness / 255
          // b = Math.min(1, Math.max(0, b))

          // // --- Shadow island expansion (static, no temporal smoothing) ---
          // if (b < 0.04) {
          //     // Floor pure black pixels
          //     b = 0
          // } else if (b < 0.15) {
          //     // Expand small bright islands in dark craters
          //     // Exponent < 1 brightens tiny highlights
          //     b = Math.pow((b - 0.04) / 0.11, 0.6) * 0.25
          // }

          // // --- Midtone S-curve for crater lines ---
          // else if (b < 0.92) {
          //     b = 0.5 + 0.5 * Math.tanh((b - 0.5) * 4.5)
          // }

          // // --- Highlight expansion ---
          // else {
          //     b = 0.92 + Math.pow((b - 0.92) / 0.08, 0.9) * 0.08
          // }

          // // --- Optional soft clip near pure white ---
          // if (b > 0.995) b = 0.995 + (b - 0.995) * 0.3

          // // Map back to 0–255
          // brightness = b * 255

          // // Map brightness to ASCII
          // const charIndex = Math.floor((brightness / 255) * (ASCII_CHARS.length - 1))
          // const char = ASCII_CHARS[charIndex]

          // // Skip spaces
          // if (char === ' ') continue

          // // Use brightness for grayscale
          // const gray = Math.floor(brightness)
          // displayCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`

          // --- Get average brightness ---
          let brightness = (red + green + blue) / 3

          // Normalize 0–1
          let b = brightness / 255
          b = Math.min(1, Math.max(0, b))

          // --- 1️⃣ Hard clamp for pitch-black areas ---
          // Any pixel below 0.07 is completely black before any curve
          if (b < 0.08) {
              b = 0
          }

          // --- 2️⃣ Shadow island expansion above black floor ---
          else if (b < 0.16) {
              // Start expansion only above black floor
              b = Math.pow((b - 0.08) / 0.09, 0.55) * 0.28
          }

          // --- 3️⃣ Midtones: smooth low-mid, sharp high-mid ---
          else if (b < 0.92) {
              let mid = (b - 0.16) / (0.92 - 0.16)
              b = 0.16 + 0.76 * (0.5 + 0.5 * Math.tanh((mid - 0.5) * 5.0))
          }

          // --- 4️⃣ Highlights: gentle crater rim lift ---
          else {
              b = 0.92 + Math.pow((b - 0.92) / 0.08, 0.88) * 0.08
          }

          // --- Optional soft clip near pure white ---
          if (b > 0.995) b = 0.995 + (b - 0.995) * 0.3

          // Map back to 0–255
          brightness = b * 255

          // Map brightness to ASCII
          const charIndex = Math.floor((brightness / 255) * (ASCII_CHARS.length - 1))
          const char = ASCII_CHARS[charIndex]
          if (char === ' ') continue

          // Set grayscale color
          const gray = Math.floor(brightness)
          displayCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`

          // Draw pixel block
          displayCtx.fillRect(
            x * PIXEL_SIZE,
            y * PIXEL_SIZE,
            PIXEL_SIZE,
            PIXEL_SIZE
          )
        }
      }

      animationId = requestAnimationFrame(drawFrame)
    }

    const handleLoadedMetadata = () => {
      setupCanvases()
      video.play().catch(err => {
        console.error('Autoplay prevented:', err)
      })
    }

    const handlePlay = () => {
      if (displayCanvas.width === 0) setupCanvases()
      drawFrame(0)
    }

    // Check if metadata already loaded
    if (video.readyState >= 1) {
      setupCanvases()
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('play', handlePlay)

    // Handle page visibility and mobile app switching
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (video.paused) {
          video.play().catch(err => {
            console.error('Failed to resume playback:', err)
          })
        }
        // Restart animation loop when becoming visible
        cancelAnimationFrame(animationId)
        animationId = requestAnimationFrame(drawFrame)
      } else {
        // Pause when not visible to save battery
        if (!video.paused) {
          video.pause()
        }
        // Stop animation loop when hidden
        cancelAnimationFrame(animationId)
      }
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      // Handle back/forward cache (bfcache) on mobile
      if (event.persisted) {
        if (video.paused) {
          video.play().catch(err => {
            console.error('Failed to resume from bfcache:', err)
          })
        }
        // Restart animation loop after bfcache restore
        cancelAnimationFrame(animationId)
        animationId = requestAnimationFrame(drawFrame)
      }
    }

    // Handle focus events (mobile browser tab switches)
    const handleFocus = () => {
      if (video.paused) {
        video.play().catch(err => {
          console.error('Failed to resume on focus:', err)
        })
      }
      // Restart animation loop on focus
      cancelAnimationFrame(animationId)
      animationId = requestAnimationFrame(drawFrame)
    }

    // Watchdog timer - periodically check if animation needs restart
    // This catches cases where visibility/focus events don't fire (mobile screen off/on)
    const watchdogInterval = setInterval(() => {
      const now = performance.now()
      // If more than 2 seconds since last animation frame and page is visible, restart
      if (document.visibilityState === 'visible' && now - lastAnimationCheck > 2000) {
        if (video.paused) {
          video.play().catch(() => {})
        }
        cancelAnimationFrame(animationId)
        animationId = requestAnimationFrame(drawFrame)
      }
    }, 1000)
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      cancelAnimationFrame(animationId)
      clearInterval(watchdogInterval)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('play', handlePlay)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return (
    <div className="moon-background-container">
      {/* Hidden video source */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/videos/moon.mp4" type="video/mp4" />
      </video>
      
      {/* Hidden source canvas for video processing */}
      <canvas
        ref={sourceCanvasRef}
        style={{ display: 'none' }}
      />
      
      {/* Display canvas for ASCII pixel art */}
      <canvas
        ref={displayCanvasRef}
        className="moon-canvas"
      />

      <style>{`
        .moon-background-container {
          position: fixed;
          left: 0;
          right: 0;
          top: 48px;
          bottom: 48px;
          z-index: 1;
          pointer-events: none;
          padding: 10px;
        }
        
        @media (min-width: 768px) {
          .moon-background-container {
            top: 56px;
            bottom: 56px;
            padding: 20px;
          }
        }

        .moon-canvas {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          image-rendering: -moz-crisp-edges;
          max-width: 90%;
          max-height: 90%;
          width: auto;
          height: auto;
          opacity: 0.35;
        }
      `}</style>
    </div>
  )
}
