import type { ComponentProps, HTMLAttributes } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusProps = ComponentProps<typeof Badge> & {
  status: 'online' | 'offline' | 'maintenance' | 'degraded';
};

export const Status = ({ className, status, ...props }: StatusProps) => (
  <Badge
    className={cn('flex items-center gap-2', 'group', status, className)}
    variant="secondary"
    {...props}
  />
);

export type StatusIndicatorProps = HTMLAttributes<HTMLSpanElement> & {
  color?: string; // Custom color override
};

export const StatusIndicator = ({
  className,
  color,
  ...props
}: StatusIndicatorProps) => (
  <span className="relative flex h-2 w-2" {...props}>
    <span
      className={cn(
        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
        !color && 'group-[.online]:bg-emerald-500',
        !color && 'group-[.offline]:bg-red-500',
        !color && 'group-[.maintenance]:bg-blue-500',
        !color && 'group-[.degraded]:bg-amber-500',
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
    <span
      className={cn(
        'relative inline-flex h-2 w-2 rounded-full',
        !color && 'group-[.online]:bg-emerald-500',
        !color && 'group-[.offline]:bg-red-500',
        !color && 'group-[.maintenance]:bg-blue-500',
        !color && 'group-[.degraded]:bg-amber-500',
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  </span>
);

export type StatusLabelProps = HTMLAttributes<HTMLSpanElement>;

export const StatusLabel = ({
  className,
  children,
  ...props
}: StatusLabelProps) => (
  <span className={cn('text-muted-foreground', className)} {...props}>
    {children ?? (
      <>
        <span className="hidden group-[.online]:block">Online</span>
        <span className="hidden group-[.offline]:block">Offline</span>
        <span className="hidden group-[.maintenance]:block">Maintenance</span>
        <span className="hidden group-[.degraded]:block">Degraded</span>
      </>
    )}
  </span>
);
