/** Types for `notifications.mjs`. Keep in step with the implementation. */

export interface NormalizedNotification {
    id: string
    title: string
    body: string
    iconPath?: string
    group?: string
    silent: boolean
    timeoutMs: number
}

export const NOTIFICATION_MAX_TITLE: number
export const NOTIFICATION_MAX_BODY: number
export const NOTIFICATION_MAX_LIVE: number

export function normalizeNotificationOptions(
    raw: unknown,
    fallbackId: string,
    isReadable?: (path: string) => boolean,
): NormalizedNotification

export function normalizeBadgeOptions(raw: unknown): { count: number; text: string }
export function badgeIsEmpty(badge: { count: number; text: string }): boolean
