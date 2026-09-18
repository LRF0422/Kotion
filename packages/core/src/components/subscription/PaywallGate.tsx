import React from 'react'
import { useEntitlements } from '@kn/common'

export interface PaywallGateProps {
    /** 需要的权益编码，见 ENTITLEMENT_CODES。 */
    feature: string
    /** 无权限或加载中时渲染的内容。 */
    fallback?: React.ReactNode
}

/** 声明式权益门禁；后端始终是最终裁判。 */
export const PaywallGate: React.FC<React.PropsWithChildren<PaywallGateProps>> = ({ feature, fallback, children }) => {
    const { hasFeature, loading } = useEntitlements()
    if (loading) return <>{fallback ?? null}</>
    if (!hasFeature(feature)) return <>{fallback ?? null}</>
    return <>{children}</>
}
