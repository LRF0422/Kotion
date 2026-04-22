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
}
