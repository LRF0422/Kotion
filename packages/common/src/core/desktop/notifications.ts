/* ------------------------------------------------------------------ *
 * notification — the OS notification center and the app badge
 *
 * A plugin panel that is closed cannot render its own toast, and a web
 * `Notification` is invisible while the window is hidden. This hands the plugin
 * the real thing: an OS notification (with click-to-focus routed back to the
 * renderer) and the dock/taskbar badge.
 * ------------------------------------------------------------------ */

export interface DesktopNotificationOptions {
    title: string
    body?: string
    /** Absolute path to a local image the host will load; refused when unreadable. */
    iconPath?: string
    /**
     * Name of a notification group (a plugin key by convention). macOS keeps one
     * thread per group; Windows/Linux ignore it.
     */
    group?: string
    /** Replace a previous notification with the same id instead of stacking. */
    id?: string
    /** `silent` suppresses the sound. */
    silent?: boolean
    /** Auto-dismiss after this long (ms); 0 keeps it until the user acts. */
    timeoutMs?: number
}

/** What a `notification.show` reports back. */
export interface DesktopNotificationResult {
    /** False when notifications are unavailable on this platform/session. */
    shown: boolean
    /** The id the notification is tracked under (the caller's, or generated). */
    id: string
    /** True when the user clicked it (resolves after the click). */
    clicked: boolean
    /** True when the OS dismissed it without a click. */
    dismissed: boolean
    /** Reason when `shown` is false. */
    error?: string
}

/** The notification surface (feature-detect `desktop.notifications`). */
export interface NotificationBridge {
    available(): Promise<boolean>
    show(options: DesktopNotificationOptions): Promise<DesktopNotificationResult>
    /**
     * Set the dock/taskbar badge. `count > 0` shows a number, `0` clears it, and
     * `text` overrides the number with a short label where the OS supports it.
     */
    setBadge(options: { count?: number; text?: string }): Promise<boolean>
    /** Close every notification this app has shown. */
    clear(): Promise<boolean>
}
