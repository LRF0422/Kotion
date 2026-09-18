import React, { useEffect, useState } from 'react'
import { APIS, useApi, useEntitlements, type SubscriptionCatalog } from '@kn/common'
import { Button } from '@kn/ui'
import { SettingsSection } from '../settings/components/primitives'
import { PlanBadge } from './PlanBadge'
import { UpgradeDialog } from './UpgradeDialog'
import { PlanComparison } from './PlanComparison'
import { formatQuotaValue } from './quota-format'

const formatDate = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

const USAGE_ROWS = [
    { code: 'space.count', label: '空间数量', unit: '个' },
    { code: 'storage.bytes', label: '存储空间', unit: 'bytes' },
    { code: 'ai.tokens.daily', label: '今日 AI Token', unit: 'tokens' },
]

export const SubscriptionPanel: React.FC = () => {
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
            fetchOne(APIS.GET_AI_TOKEN_USAGE, 'ai.tokens.daily'),
        ]).then((rows) => {
            const next: Record<string, number> = {}
            rows.forEach((row) => {
                next[row.code] = row.value
            })
            setUsage(next)
        })
    }, [])

    const plan = catalog?.plans.find((item) => item.planCode === planCode)
    const definitionOf = (code: string) => catalog?.entitlements.find((item) => item.code === code)

    return (
        <div className="mx-auto w-full max-w-2xl space-y-8">
            <SettingsSection title="当前方案" description="方案决定可用能力与额度">
                <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4 md:p-5">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-base font-semibold text-foreground">{planName}</span>
                                <PlanBadge />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {subscription?.permanent
                                    ? '永久有效'
                                    : subscription?.endTime
                                        ? '到期时间：' + formatDate(subscription.endTime) + (subscription.remainingDays !== undefined ? '（剩余 ' + subscription.remainingDays + ' 天）' : '')
                                        : '—'}
                            </p>
                        </div>
                        <UpgradeDialog trigger={<Button size="sm" className="h-11 lg:h-9">升级方案</Button>} />
                    </div>
                    {plan ? (
                        <div className="grid gap-2 border-t border-border/60 pt-4 sm:grid-cols-2">
                            {Object.keys(plan.quotas).map((code) => {
                                const definition = definitionOf(code)
                                return (
                                    <div key={code} className="flex items-center justify-between gap-3 text-xs">
                                        <span className="truncate text-muted-foreground">{definition?.name || code}</span>
                                        <span className="shrink-0 font-medium text-foreground">
                                            {formatQuotaValue(plan.quotas[code], definition?.unit)}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    ) : null}
                </div>
            </SettingsSection>

            <SettingsSection title="用量" description="实时用量与套餐上限">
                <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4 md:p-5">
                    {USAGE_ROWS.map((row) => {
                        const limit = quota(row.code)
                        const used = usage[row.code] ?? 0
                        const unlimited = isUnlimited(row.code)
                        const percent = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))
                        return (
                            <div key={row.code} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <span className="text-muted-foreground">{row.label}</span>
                                    <span className="font-medium text-foreground">
                                        {formatQuotaValue(used, row.unit)} / {unlimited ? '不限' : formatQuotaValue(limit, row.unit)}
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
            </SettingsSection>

            <SettingsSection title="方案对比" description="支付功能尚未开放，升级请联系平台管理员或使用兑换码">
                <PlanComparison
                    catalog={catalog}
                    currentPlanCode={planCode}
                    renderPlanAction={(plan) => (
                        <UpgradeDialog
                            initialPlanName={plan.planName}
                            trigger={<Button size="sm" variant="outline" className="h-9">选择</Button>}
                        />
                    )}
                />
            </SettingsSection>
        </div>
    )
}
