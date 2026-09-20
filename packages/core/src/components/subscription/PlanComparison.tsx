import React from 'react'
import { cn } from '@kn/ui'
import { useTranslation } from '@kn/common'
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

const priceText = (plan: SubscriptionPlan): string => {
    const monthly = Number(plan.monthlyPrice || 0)
    const yearly = Number(plan.yearlyPrice || 0)
    if (monthly <= 0 && yearly <= 0) return '永久免费'
    return '¥' + monthly + ' / 月' + (yearly > 0 ? '，年付 ¥' + yearly : '')
}

const GroupRow: React.FC<{ label: string; span: number }> = ({ label, span }) => (
    <tr className="border-t border-border/60 bg-muted/30">
        <td colSpan={span} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
        </td>
    </tr>
)

const ValueRow: React.FC<{
    definition: SubscriptionEntitlementDefinition
    plans: SubscriptionPlan[]
    currentPlanCode: PlanCode
}> = ({ definition, plans, currentPlanCode }) => (
    <tr className="border-t border-border/40">
        <td className="px-4 py-2.5 text-sm text-foreground" title={definition.description || definition.code}>
            {definition.name}
        </td>
        {plans.map((plan) => (
            <td
                key={plan.planCode}
                className={cn(
                    'px-4 py-2.5 text-sm',
                    plan.planCode === currentPlanCode ? 'bg-accent/20 font-medium text-foreground' : 'text-muted-foreground',
                )}
            >
                {cellValue(definition, plan)}
            </td>
        ))}
    </tr>
)

export interface PlanComparisonProps {
    catalog?: SubscriptionCatalog
    currentPlanCode: PlanCode
    className?: string
    /** 每档头部的操作区（如「选择」打开开通说明）。 */
    renderPlanAction?: (plan: SubscriptionPlan) => React.ReactNode
}

/** Notion「Explore plans」风格：方案列为表头（名称/价格/操作），特性按分组逐行对比。 */
export const PlanComparison: React.FC<PlanComparisonProps> = ({ catalog, currentPlanCode, className, renderPlanAction }) => {
    const { t } = useTranslation()
    if (!catalog || catalog.plans.length === 0) {
        return <div className="rounded-xl border border-border/60 bg-card p-4 text-xs text-muted-foreground">方案加载中…</div>
    }
    const plans = catalog.plans
    const features = catalog.entitlements.filter((definition) => definition.category === 'FEATURE')
    const quotas = catalog.entitlements.filter((definition) => definition.category === 'QUOTA')
    const span = plans.length + 1

    return (
        <div className={cn('overflow-x-auto rounded-xl border border-border/60', className)}>
            <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                    <tr>
                        <th className="w-[150px] px-4 pt-4 text-left align-top text-xs font-normal text-muted-foreground">{t('settings.subscription.plan')}</th>
                        {plans.map((plan) => (
                            <th
                                key={plan.planCode}
                                className={cn('px-4 pt-4 text-left align-top', plan.planCode === currentPlanCode ? 'bg-accent/20' : '')}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-base font-semibold text-foreground">{plan.planName}</span>
                                    {plan.highlight ? (
                                        <span className="rounded bg-[hsl(212_90%_62%)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[hsl(212_90%_62%)]">
                                            {plan.highlight}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">{priceText(plan)}</div>
                                {renderPlanAction ? <div className="pb-4 pt-3">{renderPlanAction(plan)}</div> : <div className="pb-4" />}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <GroupRow label={t('settings.subscription.capabilities')} span={span} />
                    {features.map((definition) => (
                        <ValueRow key={definition.code} definition={definition} plans={plans} currentPlanCode={currentPlanCode} />
                    ))}
                    <GroupRow label={t('settings.subscription.quotas')} span={span} />
                    {quotas.map((definition) => (
                        <ValueRow key={definition.code} definition={definition} plans={plans} currentPlanCode={currentPlanCode} />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
