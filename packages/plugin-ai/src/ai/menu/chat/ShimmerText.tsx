import React from 'react'
import { cn } from '@kn/ui'

/**
 * Sweeping-highlight label for in-progress states — thinking, running tools,
 * streaming answers. Mirrors the DeepSeek/Harness "working" shimmer: a soft
 * highlight travels across the text via `background-position`.
 *
 * Under `prefers-reduced-motion` both the animation and the gradient are
 * dropped, so the label degrades to plain, legible muted text.
 */
export const ShimmerText: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
    children,
    className,
}) => (
    <span
        className={cn(
            'animate-text-shimmer bg-gradient-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40',
            'bg-[length:200%_100%] bg-clip-text text-transparent',
            'motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted-foreground',
            className,
        )}
    >
        {children}
    </span>
)
