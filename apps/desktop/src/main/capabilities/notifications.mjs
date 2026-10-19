/**
 * System notifications for `notification.*` (main process).
 *
 * A plugin that wants to say "3 new messages" cannot do it from its own panel:
 * the panel is unmounted when the user is elsewhere, and a web `Notification`
 * from an `app://` origin is unreliable while the window is hidden. Main-process
 * `Notification` is the real OS integration — notification center on macOS,
 * Action Center on Windows, the desktop's notification daemon on Linux.
 *
 * The click is routed back through the capability call rather than the event
 * channel: `show()` resolves when the notification is dismissed or clicked, with
 * `clicked` telling the plugin which happened. Notifications are tracked by id
 * so a plugin can replace one instead of stacking a hundred.
 *
 * Validation is deliberately strict about what it will hand the OS: an
 * oversized body, a control character in the title, or an unreadable icon path
 * is a plugin bug (or an attempt to spoof a system dialog), and the failure is
 * reported instead of rendered.
 */

import { existsSync, statSync } from 'node:fs'

/** Bounds for the strings the OS will render. */
export const NOTIFICATION_MAX_TITLE = 200
export const NOTIFICATION_MAX_BODY = 2000
/** Notifications kept alive at once by one window. */
export const NOTIFICATION_MAX_LIVE = 32
const NOTIFICATION_MAX_TIMEOUT_MS = 60 * 1000

const stripControlChars = (value) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')

const asRecord = (value) => (value && typeof value === 'object' ? value : {})

/**
 * Normalize a `notification.show` payload.
 *
 * @param {unknown} raw
 * @param {string} fallbackId
 * @param {(path: string) => boolean} [isReadable] injected in tests
 */
export function normalizeNotificationOptions(raw, fallbackId, isReadable = readableFile) {
    const params = asRecord(raw)
    const title = typeof params.title === 'string' ? stripControlChars(params.title).trim() : ''
    if (!title) throw new Error('notification.show: "title" is required')
    const body = typeof params.body === 'string' ? stripControlChars(params.body).trim() : ''
    const id = typeof params.id === 'string' && params.id.trim() ? params.id.trim().slice(0, 128) : fallbackId
    let iconPath
    if (typeof params.iconPath === 'string' && params.iconPath.trim()) {
        const candidate = params.iconPath.trim()
        // The OS will read this file: refuse anything that is not a readable
        // regular file, rather than hand a path (or a device) to the shell.
        if (!isReadable(candidate)) {
            throw new Error(`notification.show: "iconPath" is not a readable file: ${candidate}`)
        }
        iconPath = candidate
    }
    const requestedTimeout = Number(params.timeoutMs)
    const timeoutMs = Number.isFinite(requestedTimeout)
        ? Math.min(Math.max(Math.trunc(requestedTimeout), 0), NOTIFICATION_MAX_TIMEOUT_MS)
        : 0
    return {
        id,
        title: title.slice(0, NOTIFICATION_MAX_TITLE),
        body: body.slice(0, NOTIFICATION_MAX_BODY),
        iconPath,
        group: typeof params.group === 'string' ? params.group.slice(0, 64) : undefined,
        silent: params.silent === true,
        timeoutMs,
    }
}

/** Whether `path` is a readable regular file (never a device, never a directory). */
function readableFile(path) {
    try {
        return existsSync(path) && statSync(path).isFile()
    } catch {
        return false
    }
}

/**
 * Normalize a badge request: a count, a short text label, or both.
 *
 * @param {unknown} raw
 */
export function normalizeBadgeOptions(raw) {
    const params = asRecord(raw)
    const count = Number(params.count)
    const text = typeof params.text === 'string' ? params.text.trim().slice(0, 16) : ''
    return {
        count: Number.isFinite(count) && count > 0 ? Math.min(Math.trunc(count), 9999) : 0,
        text,
    }
}

/** What a badge request asked for, after normalization: empty means "clear". */
export const badgeIsEmpty = (badge) => badge.count === 0 && !badge.text
