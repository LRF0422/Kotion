import React from 'react'
import { cn } from '@kn/ui'
import type { PlanCode, SubscriptionCatalog, SubscriptionEntitlementDefinition, SubscriptionPlan } from '@kn/common'
import { formatQuotaValue } from './quota-format'

const cellValue = (definition: SubscriptionEntitlementDefinition, plan: SubscriptionPlan): string => {
    if (definition.category === 'QUOTA') {
        const value = plan.quotas[definition.code]
        if (value === undefined) return '—'
        return formatQuotaValue(value, definition.unit)
    }
    return plan.features[definition.code] === true ? '✓' : '—'
}

export interface PlanComparisonProps {
    catalog?: SubscriptionCatalog
    currentPlanCode: PlanCode
    className?: string
}

/** 由 /subscription/catalog 渲染，权益与额度都不硬编码。 */
export const PlanComparison: React.FC<PlanComparisonProps> = ({ catalog, currentPlanCode, className }) => {
    if (!catalog || catalog.plans.length === 0) {
        return <div className="rounded-xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">方案加载中…</div>
    }
    return (
        <div className={cn('overflow-x-auto rounded-xl border border-border/60', className)}>
            <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">权益</th>
                        {catalog.plans.map((plan) => (
                            <th
                                key={plan.planCode}
                                className={cn(
                                    'px-4 py-3 text-center text-xs font-medium',
                                    plan.planCode === currentPlanCode ? 'text-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {plan.planName}
                                {plan.highlight ? (
                                    <div className="mt-0.5 text-[10px] font-normal text-primary">{plan.highlight}</div>
                                ) : null}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {catalog.entitlements.map((definition) => (
                        <tr key={definition.code} className="border-b border-border/40 last:border-0">
                            <td className="px-4 py-2.5 text-foreground" title={definition.description || definition.code}>
                                {definition.name}
                            </td>
                            {catalog.plans.map((plan) => (
                                <td
                                    key={plan.planCode}
                                    className={cn(
                                        'px-4 py-2.5 text-center',
                                        plan.planCode === currentPlanCode ? 'bg-accent/30 font-medium text-foreground' : 'text-muted-foreground',
                                    )}
                                >
                                    {cellValue(definition, plan)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
