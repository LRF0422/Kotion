import { Card, CardContent } from '@kn/ui'
import { TrendingDown, TrendingUp } from '@kn/icon'

interface StatCardProps {
  title: string
  value: string
  trend?: number
  icon: React.ComponentType<{ className?: string }>
}

export const StatCard = ({ title, value, trend, icon: Icon }: StatCardProps) => {
  const isUp = (trend ?? 0) >= 0
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{title}</span>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        {trend !== undefined && (
          <div className={`mt-1 flex items-center gap-1 text-xs ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {isUp ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            <span>{isUp ? '+' : ''}{trend}% 较上周</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
