import { useState, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A button component that properly handles touch and mouse input.
 * 
 * Solves the recurring issue where buttons get stuck in active/hover states
 * on touch devices because browsers fire simulated mouse events after touch.
 * 
 * States:
 * - Normal: text-corpo-text, shows lineIcon
 * - Hovered (mouse only): text-corpo-light, shows fillIcon
 * - Active (pressed): text-lavender, shows fillIcon
 * - Disabled: text-corpo-text/20, shows lineIcon, cursor-not-allowed
 */

interface InteractiveIconButtonProps {
  /** The line (outline) version of the icon - shown in normal state */
  lineIcon: ReactNode
  /** The fill (solid) version of the icon - shown in hover/active states */
  fillIcon: ReactNode
  /** Click handler */
  onClick: () => void
  /** Whether the button is disabled */
  disabled?: boolean
  /** Accessible label for screen readers */
  ariaLabel: string
  /** Additional className for the button */
  className?: string
}

export function InteractiveIconButton({
  lineIcon,
  fillIcon,
  onClick,
  disabled = false,
  ariaLabel,
  className,
}: InteractiveIconButtonProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const isTouchRef = useRef(false)

  // Determine which icon to show - match readme/repository pattern
  const showFillIcon = isActive || isHovered

  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onClick() }}
      disabled={disabled}
      onMouseEnter={() => { if (!isTouchRef.current) setIsHovered(true) }}
      onMouseLeave={() => { if (!isTouchRef.current) { setIsHovered(false); setIsActive(false) } }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      onTouchStart={() => { isTouchRef.current = true; setIsActive(true); setIsHovered(false) }}
      onTouchEnd={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { isTouchRef.current = false }, 300) }}
      onTouchCancel={() => { setIsActive(false); setIsHovered(false); setTimeout(() => { isTouchRef.current = false }, 300) }}
      className={cn(
        "flex items-center transition-none",
        disabled
          ? "text-corpo-text/20 cursor-not-allowed"
          : isActive
            ? "text-lavender"
            : isHovered
              ? "text-corpo-light"
              : "text-corpo-text",
        className
      )}
      aria-label={ariaLabel}
    >
      {showFillIcon && !disabled ? fillIcon : lineIcon}
    </button>
  )
}

/**
 * A simpler variant for static indicators (not clickable)
 * Always shows the fill icon in lavender
 */
interface StaticIconIndicatorProps {
  icon: ReactNode
  ariaLabel: string
  className?: string
}

export function StaticIconIndicator({
  icon,
  ariaLabel,
  className,
}: StaticIconIndicatorProps) {
  return (
    <span
      className={cn("p-1 text-lavender", className)}
      aria-label={ariaLabel}
    >
      {icon}
    </span>
  )
}
