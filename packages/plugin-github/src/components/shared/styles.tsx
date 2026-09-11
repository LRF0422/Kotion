import React from 'react'
import { cn } from '@kn/ui'

/**
 * Shared visual tokens for every GitHub card/panel so the plugin reads as one
 * system. All values are complete Tailwind class literals (never composed at
 * runtime) so the JIT compiler can see them.
 */

export const ghCard = 'relative my-4 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200'

export const ghCardInteractive = 'focus-within:border-primary/40 hover:border-primary/40 hover:shadow-md'

export const ghCardDashed = 'my-4 overflow-hidden rounded-xl border-2 border-dashed bg-card/60 text-card-foreground'

export const ghHeader = 'flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2'

export const ghHeaderStart = 'flex min-w-0 items-center gap-2'

export const ghIconTile = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm ring-1 ring-inset ring-border'

export const ghRef = 'truncate font-mono text-xs font-medium text-foreground/90'

export const ghMeta = 'text-xs text-muted-foreground'

export const ghBody = 'p-3'

export const ghTitle = 'text-sm font-medium leading-snug text-foreground'

export const ghIconButton = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'

export const ghChip = 'inline-flex items-center gap-1 rounded-full border bg-background/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground'

export const ghStatAdd = 'font-medium text-emerald-600 dark:text-emerald-400'

export const ghStatDel = 'font-medium text-rose-600 dark:text-rose-400'

export const ghErrorBox = 'flex items-start gap-1.5 border-t px-3 py-2 text-xs text-destructive'

export const ghEmptyState = 'flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center text-xs text-muted-foreground'

export const ghLink = 'text-primary underline-offset-2 hover:underline'

export const ghRowHover = 'transition-colors hover:bg-muted/50'

export const ghScrollArea = 'max-h-80'

export interface GhIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string
}

/** Compact square icon button used across GitHub card headers. */
export const GhIconButton: React.FC<GhIconButtonProps> = ({ label, className, children, type = 'button', ...props }) => (
    <button type={type} title={label} aria-label={label} className={cn(ghIconButton, className)} {...props}>
        {children}
    </button>
)

export interface GhIconLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    label: string
    href: string
}

/** External-link counterpart of {@link GhIconButton}. */
export const GhIconLink: React.FC<GhIconLinkProps> = ({ label, href, className, children, ...props }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        aria-label={label}
        className={cn(ghIconButton, className)}
        {...props}
    >
        {children}
    </a>
)
