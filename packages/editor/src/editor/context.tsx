import { createContext } from "react";
import { string } from "zod";

export interface PageContextProps {
    spaceId?: string
    id?: string
    title?: string
    createBy?: string
    createTime?: string
    updateBy?: string
    updateTime?: string
}

export const PageContext = createContext<PageContextProps | undefined>({})