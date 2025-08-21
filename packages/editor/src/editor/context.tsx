import { createContext } from "react";

export interface PageContextProps {
    spaceId?: string
    id?: string
    title?: string
    createBy?: string
    createTime?: string
    updateBy?: string
    updateTime?: string
}

export const PageContext = createContext<PageContextProps>({})