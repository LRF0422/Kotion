/**
 * Off-screen page editing — the unified engine behind Chat's @-page sessions.
 *
 * Exposes hidden collaborative editor sessions through the @kn/common
 * OffscreenEditorBridge so plugins (which never import @kn/core) can acquire
 * a full editor for any page without navigating to it.
 */

import { setOffscreenEditorBridge } from "@kn/common"
import { offscreenSessionManager } from "./session-manager"

export { OffscreenEditorHost } from "./OffscreenEditorHost"
export { offscreenSessionManager } from "./session-manager"

/**
 * Register the engine into the global bridge. Must be called once at
 * application startup (alongside registerCoreToolFactories).
 */
export function registerOffscreenEditorBridge(): void {
    setOffscreenEditorBridge({
        acquire: (pageId: string) => offscreenSessionManager.acquire(pageId),
    })
}
