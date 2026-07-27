/**
 * Off-screen page editing — the unified engine behind Chat's @-page sessions.
 *
 * Exposes hidden collaborative editor sessions through the @kn/common
 * OffscreenEditorBridge so plugins (which never import @kn/core) can acquire
 * a full editor for any page without navigating to it.
 */

import { setOffscreenEditorBridge, useApi, type OffscreenPageSummary } from "@kn/common"

import { OFFSCREEN_APIS } from "./api"
import { offscreenSessionManager } from "./session-manager"

export { OffscreenEditorHost } from "./OffscreenEditorHost"
export { offscreenSessionManager } from "./session-manager"

const searchPages = async (query?: string): Promise<OffscreenPageSummary[]> => {
    const res: any = await useApi(OFFSCREEN_APIS.QUERY_PAGE, { searchValue: query, pageSize: 30 })
    const data = res?.data
    const records = Array.isArray(data) ? data : data?.records ?? []
    return records.map((p: any) => ({
        id: String(p.id),
        title: p.title,
        spaceId: p.spaceId !== undefined ? String(p.spaceId) : undefined,
        spaceName: p.spaceName,
    }))
}

/**
 * Register the engine into the global bridge. Must be called once at
 * application startup (alongside registerCoreToolFactories).
 */
export function registerOffscreenEditorBridge(): void {
    setOffscreenEditorBridge({
        acquire: (pageId: string) => offscreenSessionManager.acquire(pageId),
        searchPages,
    })
}
