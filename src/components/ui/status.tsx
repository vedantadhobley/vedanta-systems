import * as React from "react"
import { cn } from "@/lib/utils"

export interface StatusProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "error" | "idle"
  children?: React.ReactNode
}

const statusVariants = {
  default: "bg-gray-400",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  error: "bg-red-500",
  idle: "bg-gray-600",
}

const Status = React.forwardRef<HTMLDivElement, StatusProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2", className)}
        {...props}
      >
        <div className="relative flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              variant === "success" && "animate-ping",
              statusVariants[variant]
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              statusVariants[variant]
            )}
          />
        </div>
        {children && (
          <span className="text-sm font-medium text-muted-foreground">
            {children}
          </span>
        )}
      </div>
    )
  }
)
Status.displayName = "Status"

export { Status }
