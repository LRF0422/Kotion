import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { APIS } from '../api'
import { useApi } from '../api/use-api'
import type { PlanCode, PlanEntitlements, UserSubscriptionInfo } from '../api/types'

/**
 * 权益编码（与后端 com.knowledge.system.domain.EntitlementCodes 保持一致）。
 * 业务侧一律引用这里，避免散落字符串。
 */
export const ENTITLEMENT_CODES = {
    CORE_EDITOR: 'core.editor',
    SPACE_COUNT: 'space.count',
    SPACE_MEMBERS: 'space.members',
    STORAGE_BYTES: 'storage.bytes',
    FILE_MAX_SIZE: 'file.maxSize',
    AI_AGENT: 'ai.agent',
    AI_RUNS_DAILY: 'ai.runs.daily',
    AI_CREDITS_MONTHLY: 'ai.credits.monthly',
    AI_RUNS_CONCURRENT: 'ai.runs.concurrent',
    AI_ADVANCED_MODELS: 'ai.advancedModels',
    PLUGIN_INSTALL: 'plugin.install',
    PLUGIN_INSTALLED_COUNT: 'plugin.installed.count',
    PLUGIN_PUBLISH: 'plugin.publish',
    EXPORT_PDF: 'export.pdf',
    COLLABORATION_TEAM: 'collaboration.team',
    COLLABORATION_GUEST: 'collaboration.guest',
    SUPPORT_PRIORITY: 'support.priority',
} as const

export interface EntitlementsState {
    loading: boolean
    error?: string
    planCode: PlanCode
    planName: string
    tier: number
    features: Record<string, boolean>
    quotas: Record<string, number>
    subscription?: UserSubscriptionInfo
    refresh: () => Promise<void>
    /** 能力开关；未知编码与未加载完成为 false（fail-closed）。 */
    hasFeature: (code: string) => boolean
    /** 数值配额；未知编码为 0，-1 表示不限。 */
    quota: (code: string) => number
    isUnlimited: (code: string) => boolean
}

const noop = async () => undefined

const DEFAULT_STATE: EntitlementsState = {
    loading: false,
    planCode: 'FREE',
    planName: '免费版',
    tier: 0,
    features: {},
    quotas: {},
    refresh: noop,
    hasFeature: () => false,
    quota: () => 0,
    isUnlimited: () => false,
}

const EntitlementsContext = createContext<EntitlementsState>(DEFAULT_STATE)

const hasAccessToken = (): boolean => {
    if (typeof localStorage === 'undefined') return false
    return Boolean(localStorage.getItem('knowledge-access-token'))
}

export interface EntitlementsProviderProps {
    /** 仅登录后挂载；无 token 时不会发起请求。 */
    enabled?: boolean
}

export const EntitlementsProvider: React.FC<React.PropsWithChildren<EntitlementsProviderProps>> = ({ children, enabled = true }) => {
    const [entitlements, setEntitlements] = useState<PlanEntitlements | undefined>(undefined)
    const [subscription, setSubscription] = useState<UserSubscriptionInfo | undefined>(undefined)
    const [loading, setLoading] = useState<boolean>(enabled)
    const [error, setError] = useState<string | undefined>(undefined)

    const refresh = useCallback(async () => {
        if (!enabled || !hasAccessToken()) {
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            const [ent, sub] = await Promise.all([
                useApi(APIS.GET_MY_ENTITLEMENTS, undefined, undefined, undefined, true),
                useApi(APIS.GET_MY_SUBSCRIPTION, undefined, undefined, undefined, true),
            ])
            setEntitlements(ent.data)
            setSubscription(sub.data)
            setError(undefined)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }, [enabled])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const value = useMemo<EntitlementsState>(() => {
        const features = entitlements?.features ?? {}
        const quotas = entitlements?.quotas ?? {}
        return {
            loading,
            error,
            planCode: entitlements?.planCode ?? 'FREE',
            planName: entitlements?.planName ?? '免费版',
            tier: entitlements?.tier ?? 0,
            features,
            quotas,
            subscription,
            refresh,
            hasFeature: (code: string) => features[code] === true,
            quota: (code: string) => (quotas[code] === undefined ? 0 : quotas[code]),
            isUnlimited: (code: string) => quotas[code] === -1,
        }
    }, [entitlements, subscription, loading, error, refresh])

    return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>
}

export const useEntitlements = (): EntitlementsState => useContext(EntitlementsContext)
