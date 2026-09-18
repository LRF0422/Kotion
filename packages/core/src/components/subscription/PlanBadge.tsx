import React from 'react'
import { Badge } from '@kn/ui'
import { useEntitlements } from '@kn/common'

/** 方案徽标：读取当前用户方案，未挂载 Provider 时回退免费版。 */
export const PlanBadge: React.FC<{ className?: string }> = ({ className }) => {
    const { planCode, planName } = useEntitlements()
    const variant = planCode === 'PRO_PLUS' ? 'default' : planCode === 'PRO' ? 'secondary' : 'outline'
    return (
        <Badge variant={variant} className={className}>
            {planName}
        </Badge>
    )
}
