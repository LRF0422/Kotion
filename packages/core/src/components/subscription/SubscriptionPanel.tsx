import React, { useEffect, useState } from 'react'
import { APIS, useApi, useEntitlements, type SubscriptionCatalog } from '@kn/common'
import { Button } from '@kn/ui'
import { SettingsSection } from '../settings/components/primitives'
import { PlanBadge } from './PlanBadge'
import { UpgradeDialog } from './UpgradeDialog'
import { PlanComparison } from './PlanComparison'
import { formatQuotaValue } from './quota-format'

export const SubscriptionPanel: React.FC = () => {
    const { planCode, planName, subscription } = useEntitlements()
    const [catalog, setCatalog] = useState<SubscriptionCatalog | undefined>(undefined)

    useEffect(() => {
        useApi(APIS.GET_SUBSCRIPTION_CATALOG, undefined, undefined, undefined, true)
            .then((res) => setCatalog(res.data))
            .catch(() => setCatalog(undefined))
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
                                        ? '到期时间：' + subscription.endTime + (subscription.remainingDays !== undefined ? '（剩余 ' + subscription.remainingDays + ' 天）' : '')
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

            <SettingsSection title="方案对比" description="支付功能尚未开放，升级请联系平台管理员">
                <PlanComparison catalog={catalog} currentPlanCode={planCode} />
            </SettingsSection>
        </div>
    )
}
