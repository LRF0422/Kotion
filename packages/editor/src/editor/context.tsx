import { createContext } from "react";

export interface PageContextProps {
    spaceId?: string
    id?: string
    parentId?: string
    title?: string
    createBy?: string
    createTime?: string
    updateBy?: string
    updateTime?: string
    /** 后端 PageVO 的创建/更新人 ID */
    createUser?: string | number
    updateUser?: string | number
    /** 由宿主（PageEditor）解析后注入的作者展示信息 */
    createUserName?: string
    createUserAvatar?: string
    updateUserName?: string
}

export const PageContext = createContext<PageContextProps>({})