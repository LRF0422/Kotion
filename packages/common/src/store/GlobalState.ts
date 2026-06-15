export interface GlobalState {
    settings?: any
    userInfo?: {
        name?: string;
        avatar?: string;
        account?: string;
        job?: string;
        organization?: string;
        location?: string;
        email?: string;
        id?: string;
        isSetup?: boolean;
        permissions: Record<string, string[]>;
    }
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
            openPages: { pageId: string; title?: string; lastActiveAt: number }[];
            activePageId?: string;
        }>
    }
}
