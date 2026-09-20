import React, { useEffect, useState } from 'react'
import { APIS, useApi, useEntitlements, useTranslation, type SubscriptionCatalog } from '@kn/common'
import { Button } from '@kn/ui'
import { Crown } from '@kn/icon'
import { UpgradeDialog } from './UpgradeDialog'
import { PlanComparison } from './PlanComparison'
import { formatQuotaValue } from './quota-format'

const formatDate = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

const USAGE_ROWS = [
    { code: 'space.count', key: 'spaceCount', unit: '个' },
    { code: 'storage.bytes', key: 'storage', unit: 'bytes' },
    { code: 'ai.runs.daily', key: 'aiRuns', unit: '次' },
    { code: 'ai.credits.monthly', key: 'aiCredits', unit: '积分' },
]

export const SubscriptionPanel: React.FC = () => {
    const { t } = useTranslation()
    const { planCode, planName, subscription, quota, isUnlimited } = useEntitlements()
    const [catalog, setCatalog] = useState<SubscriptionCatalog | undefined>(undefined)
    const [usage, setUsage] = useState<Record<string, number>>({})

    useEffect(() => {
        useApi(APIS.GET_SUBSCRIPTION_CATALOG, undefined, undefined, undefined, true)
            .then((res) => setCatalog(res.data))
            .catch(() => setCatalog(undefined))
    }, [])

    useEffect(() => {
        const fetchOne = (api: Parameters<typeof useApi>[0], code: string) =>
            useApi(api, undefined, undefined, undefined, true)
                .then((res) => ({ code, value: Number(res.data) || 0 }))
                .catch(() => ({ code, value: 0 }))
        Promise.all([
            fetchOne(APIS.GET_SPACE_USAGE, 'space.count'),
            fetchOne(APIS.GET_STORAGE_USAGE, 'storage.bytes'),
            fetchOne(APIS.GET_AI_RUN_USAGE, 'ai.runs.daily'),
            fetchOne(APIS.GET_AI_CREDIT_USAGE, 'ai.credits.monthly'),
        ]).then((rows) => {
            const next: Record<string, number> = {}
            rows.forEach((row) => {
                next[row.code] = row.value
            })
            setUsage(next)
        })
    }, [])

    const currentPlan = catalog?.plans.find((item) => item.planCode === planCode)
    // 免费版视为永久，避免历史数据带有 end_time 时显示「剩余 N 天」造成误解
    const permanent = subscription?.permanent || planCode === 'FREE'
    const expiryText = permanent
        ? t('settings.subscription.permanent')
        : subscription?.endTime
            ? t('settings.subscription.expiresOn') + ': ' + formatDate(subscription.endTime)
                + (subscription.remainingDays !== undefined ? ' (' + t('settings.subscription.remainingDays', { count: subscription.remainingDays }) + ')' : '')
            : ''

    return (
        <div className="w-full space-y-8">
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">{t('settings.subscription.currentPlan')}</h3>
                <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Crown className="h-4 w-4" />
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-base font-semibold text-foreground">{planName}</div>
                            <p className="text-xs text-muted-foreground">{currentPlan?.description || t('settings.subscription.desc')}</p>
                            {expiryText ? <p className="text-xs text-muted-foreground">{expiryText}</p> : null}
                        </div>
                    </div>
                    <UpgradeDialog
                        trigger={
                            <Button
                                variant="ghost"
                                className="h-11 px-0 text-[hsl(212_90%_62%)] hover:bg-transparent hover:underline lg:h-9"
                            >
                                {t('settings.subscription.upgrade')}
                            </Button>
                        }
                    />
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">{t('settings.subscription.compareAll')}</h3>
                <PlanComparison
                    catalog={catalog}
                    currentPlanCode={planCode}
                    renderPlanAction={(plan) =>
                        plan.planCode === planCode ? (
                            <span className="text-xs text-muted-foreground">{t('settings.subscription.current')}</span>
                        ) : (
                            <UpgradeDialog
                                initialPlanName={plan.planName}
                                trigger={
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 px-0 text-[hsl(212_90%_62%)] hover:bg-transparent hover:underline"
                                    >
                                        {t('settings.subscription.select')}
                                    </Button>
                                }
                            />
                        )
                    }
                />
            </div>

            <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">{t('settings.subscription.usage')}</h3>
                <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4 md:p-5">
                    {USAGE_ROWS.map((row) => {
                        const limit = quota(row.code)
                        const used = usage[row.code] ?? 0
                        const unlimited = isUnlimited(row.code)
                        const percent = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
                        return (
                            <div key={row.code} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="text-muted-foreground">{t('settings.subscription.usageLabel.' + row.key, row.key)}</span>
                                    <span className="font-medium text-foreground">
                                        {formatQuotaValue(used, row.unit)} / {unlimited ? t('settings.subscription.unlimited', 'Unlimited') : formatQuotaValue(limit, row.unit)}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full bg-primary transition-all"
                                        style={{ width: (unlimited ? 0 : percent) + '%' }}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
