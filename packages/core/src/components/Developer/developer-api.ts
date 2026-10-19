/**
 * Developer verification — API + shared state.
 *
 * Publishing or managing a plugin requires an APPROVED developer profile. This
 * module owns the one profile every gate reads, so a page with several publish
 * buttons (hub, sidebar, manager) issues a single request and all of them see
 * the same status after a submission.
 *
 * The backend is the real boundary (`WikiException.DEVELOPER_NOT_VERIFIED`,
 * business code 1100); the client-side checks exist so users get the form
 * instead of a rejected upload.
 */
import { APIS, useApi } from '@kn/common'
import React from 'react'

export type DeveloperVerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
export type DeveloperIdType = 'ID_CARD' | 'PASSPORT' | 'BUSINESS_LICENSE' | 'OTHER'

/** Business code used by the backend when publishing without verification. */
export const DEVELOPER_NOT_VERIFIED_CODE = 1100

export interface DeveloperProfile {
    id?: string | number
    userId?: string | number
    userName?: string
    displayName?: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    idType?: DeveloperIdType | { value?: DeveloperIdType; desc?: string }
    idNumberMasked?: string
    intro?: string
    qualificationPath?: string
    status?: DeveloperVerificationStatus | { value?: DeveloperVerificationStatus; desc?: string }
    rejectReason?: string
    reviewerName?: string
    reviewTime?: string
    createTime?: string
    updateTime?: string
}

export interface DeveloperApplyInput {
    displayName: string
    contactName: string
    contactEmail: string
    contactPhone: string
    idType: DeveloperIdType
    idNumber: string
    intro?: string
    qualificationPath?: string
}

interface DeveloperSnapshot {
    /** A response has been applied (including "no profile yet"). */
    loaded: boolean
    loading: boolean
    profile: DeveloperProfile | null
    error?: string
}

const EMPTY: DeveloperSnapshot = { loaded: false, loading: false, profile: null }

let snapshot: DeveloperSnapshot = EMPTY
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

const emit = () => {
    listeners.forEach((listener) => listener())
}

const commit = (next: DeveloperSnapshot) => {
    snapshot = next
    emit()
}

/** Accept the enum either bare or as the platform's `{ value, desc }` shape. */
export const enumValue = <T extends string>(value: unknown): T | undefined => {
    if (typeof value === 'string') return value as T
    if (value && typeof value === 'object' && 'value' in value) {
        const inner = (value as { value?: unknown }).value
        return typeof inner === 'string' ? (inner as T) : undefined
    }
    return undefined
}

export const developerStatus = (profile: DeveloperProfile | null | undefined): DeveloperVerificationStatus | undefined =>
    enumValue<DeveloperVerificationStatus>(profile?.status)

/** Only APPROVED may publish or manage plugins. */
export const isDeveloperVerified = (profile: DeveloperProfile | null | undefined): boolean =>
    developerStatus(profile) === 'APPROVED'

/** A backend 1100 means "not verified" even if the local snapshot was stale. */
export const isDeveloperNotVerifiedError = (error: unknown): boolean =>
    (error as { code?: unknown } | undefined)?.code === DEVELOPER_NOT_VERIFIED_CODE

const unwrap = (response: unknown): DeveloperProfile | null => {
    const data = (response as { data?: unknown } | undefined)?.data
    return data && typeof data === 'object' ? (data as DeveloperProfile) : null
}

/** One-shot read for non-React callers (the plugin-marketplace service). */
export const fetchDeveloperProfile = async (): Promise<DeveloperProfile | null> =>
    unwrap(await useApi(APIS.GET_MY_DEVELOPER_PROFILE))

const load = (force: boolean): Promise<void> => {
    if (!force && snapshot.loaded && !snapshot.error) return Promise.resolve()
    if (inflight) return inflight
    commit({ ...snapshot, loading: true, error: undefined })
    inflight = fetchDeveloperProfile()
        .then((profile) => {
            commit({ loaded: true, loading: false, profile })
        })
        .catch((error: unknown) => {
            commit({
                loaded: true,
                loading: false,
                profile: snapshot.profile,
                error: error instanceof Error ? error.message : String(error),
            })
        })
        .finally(() => {
            inflight = null
        })
    return inflight
}

/** Load the profile once (or force a refetch); safe to call from anywhere. */
export const loadDeveloperProfile = (force = false): Promise<void> => load(force)

/** Submit / resubmit the verification form; updates the shared snapshot. */
export const applyDeveloperVerification = async (input: DeveloperApplyInput): Promise<DeveloperProfile> => {
    const response = await useApi(APIS.APPLY_DEVELOPER_VERIFICATION, null, input)
    const profile = unwrap(response)
    if (profile) {
        commit({ loaded: true, loading: false, profile, error: undefined })
        return profile
    }
    await load(true)
    return snapshot.profile as DeveloperProfile
}

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

const getSnapshot = () => snapshot

/**
 * Shared developer profile. The first mounted consumer fetches; the rest reuse
 * the same snapshot and re-render together after a submission.
 *
 * Pass `enabled = false` for a host that only needs the status once a specific
 * action starts (e.g. the global publisher host) so an app-wide mount does not
 * fire the request for every visitor.
 */
export const useDeveloperProfile = (enabled = true) => {
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    React.useEffect(() => {
        if (enabled) void loadDeveloperProfile()
    }, [enabled])
    return {
        ...state,
        verified: isDeveloperVerified(state.profile),
        refresh: () => loadDeveloperProfile(true),
    }
}
