import { AnyAction, createStore } from "redux";
import { GlobalState } from "./GlobalState";

export * from "./GlobalState"


const store = createStore((state: GlobalState = {
    tabs: [],
    activeTabKey: '',
    collpase: false,
    rightCollpase: false,
    pageTabs: { bySpace: {} }
}, action: AnyAction) => {
    if (action.type === "UPDATE_USER") {
        const userInfo = action?.payload
        return {
            userInfo,
            ...state
        }
    }

    if (action.type === "ADD_TAB") {
        const tabInfo = action.payload
        const tabs = state.tabs
        const curr = tabs.find(it => it.key === tabInfo.key);
        if (curr) {
            return {
                ...state,
                activeTabKey: tabInfo.key
            }
        } else {
            tabs.push(tabInfo)
            return {
                ...state,
                tabs: [...tabs],
                activeTabKey: tabInfo.key
            }
        }
    }

    if (action.type === "UPDATE_ACTIVE_TAB") {
        const tabKey = action.payload
        return {
            ...state,
            activeTabKey: tabKey
        }
    }

    if (action.type === "CLOSE_TAB") {
        const tabKey = action.payload
        const tabs = state.tabs.filter((it, index) => it.key === tabKey)
        return {
            ...state,
            tabs,
        }
    }
    if (action.type === "UPDATE_COLLPASE") {
        const collpase = action.payload
        return {
            ...state,
            collpase
        }
    }
    if (action.type === "UPDATE_RIGHT_COLLPASE") {
        const collpase = action.payload
        return {
            ...state,
            rightCollpase: collpase
        }
    }

    // ---- Per-space page tabs (immutable updates; do NOT mutate like ADD_TAB above) ----
    if (
        action.type === "PAGE_TAB_OPEN" ||
        action.type === "PAGE_TAB_ACTIVATE" ||
        action.type === "PAGE_TAB_CLOSE" ||
        action.type === "PAGE_TAB_CLOSE_MANY" ||
        action.type === "PAGE_TAB_UPDATE_META"
    ) {
        const { spaceId } = action.payload
        if (!spaceId) return state
        const bySpace = state.pageTabs?.bySpace ?? {}
        const bucket = bySpace[spaceId] ?? { openPages: [], activePageId: undefined }

        let nextBucket = bucket

        if (action.type === "PAGE_TAB_OPEN") {
            const { pageId, title, icon, lastActiveAt } = action.payload
            const exists = bucket.openPages.some(p => p.pageId === pageId)
            const openPages = exists
                // keep existing title unless we now have one and it was missing
                ? bucket.openPages.map(p => (p.pageId === pageId && title && !p.title ? { ...p, title } : p))
                : [...bucket.openPages, { pageId, title, icon, lastActiveAt: lastActiveAt ?? 0 }]
            nextBucket = { ...bucket, openPages }
        } else if (action.type === "PAGE_TAB_ACTIVATE") {
            const { pageId, lastActiveAt } = action.payload
            const openPages = bucket.openPages.map(p =>
                p.pageId === pageId ? { ...p, lastActiveAt: lastActiveAt ?? p.lastActiveAt } : p
            )
            nextBucket = { ...bucket, openPages, activePageId: pageId }
        } else if (action.type === "PAGE_TAB_CLOSE") {
            const { pageId } = action.payload
            const openPages = bucket.openPages.filter(p => p.pageId !== pageId)
            let activePageId = bucket.activePageId
            if (activePageId === pageId) {
                // Closing the active tab: fall back to the most-recently-active remaining tab.
                const next = openPages.reduce<{ pageId: string; lastActiveAt: number } | undefined>(
                    (best, p) => (!best || p.lastActiveAt > best.lastActiveAt ? p : best),
                    undefined
                )
                activePageId = next?.pageId
            }
            nextBucket = { ...bucket, openPages, activePageId }
        } else if (action.type === "PAGE_TAB_CLOSE_MANY") {
            const { pageIds } = action.payload
            const closing = new Set<string>(pageIds ?? [])
            const openPages = bucket.openPages.filter(p => !closing.has(p.pageId))
            let activePageId = bucket.activePageId
            if (activePageId && closing.has(activePageId)) {
                // Closing the active tab among the batch: fall back to the
                // most-recently-active remaining tab.
                const next = openPages.reduce<{ pageId: string; lastActiveAt: number } | undefined>(
                    (best, p) => (!best || p.lastActiveAt > best.lastActiveAt ? p : best),
                    undefined
                )
                activePageId = next?.pageId
            }
            nextBucket = { ...bucket, openPages, activePageId }
        } else if (action.type === "PAGE_TAB_UPDATE_META") {
            const { pageId, title, icon } = action.payload
            const openPages = bucket.openPages.map(p =>
                p.pageId === pageId
                    ? {
                        ...p,
                        ...(title !== undefined ? { title } : {}),
                        ...(icon !== undefined ? { icon } : {}),
                    }
                    : p
            )
            nextBucket = { ...bucket, openPages }
        }

        return {
            ...state,
            pageTabs: { bySpace: { ...bySpace, [spaceId]: nextBucket } }
        }
    }

    return state;
})

export { store }
export default store
