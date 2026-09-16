import { Card, CardContent } from '@kn/ui'
import { TrendingDown, TrendingUp } from '@kn/icon'

interface StatCardProps {
  title: string
  value: string
  trend?: number
  /** 环比说明文案；默认「较上周」。按「近 N 天 vs 上一个 N 天」计算的看板应传「较上期」 */
  trendLabel?: string
  icon: React.ComponentType<{ className?: string }>
}

export const StatCard = ({ title, value, trend, trendLabel = '较上周', icon: Icon }: StatCardProps) => {
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
            <span>{isUp ? '+' : ''}{trend}% {trendLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
