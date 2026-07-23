import { Badge } from '@kn/ui'

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const VARIANT_CLASS: Record<StatusVariant, string> = {
  success: 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  warning: 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
  danger: 'border-transparent bg-red-500/15 text-red-600 dark:text-red-400',
  info: 'border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400',
  muted: 'border-transparent bg-muted text-muted-foreground',
}

interface StatusBadgeProps {
  variant: StatusVariant
  children: React.ReactNode
}

export const StatusBadge = ({ variant, children }: StatusBadgeProps) => {
  return (
    <Badge variant="outline" className={VARIANT_CLASS[variant]}>
      {children}
    </Badge>
  )
}
