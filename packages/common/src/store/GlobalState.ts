import type { ContextVO, CurrentUser } from "../api/types"

export interface GlobalState {
    settings?: any
    userInfo?: CurrentUser
    currentContext?: ContextVO
    availableContexts: ContextVO[]
    appInfo?: {
        id?: string
        appId?: string
        appSecret?: string
        name?: string,
        icon?: string
    }
    userLoading?: boolean;
    tabs: {
        path: string,
        name: string,
        key: string
    }[],
    activeTabKey: string,
    collpase?: boolean,
    rightCollpase?: boolean
    // Per-space open page tabs (independent of the top-level `tabs` nav above).
    // Bucketed by spaceId so tabs never leak across spaces.
    pageTabs?: {
        bySpace: Record<string, {
            openPages: { pageId: string; title?: string; icon?: string; lastActiveAt: number }[];
            activePageId?: string;
            hydrated?: boolean;
        }>
    }
}
