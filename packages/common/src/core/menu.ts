import { EmptyProps } from "@kn/ui";
import { ReactNode } from "react"

export interface SiderMenuProps {
    menus: SiderMenuItemProps[]
    size?: 'default' | 'md' | 'mini'
}

export interface SiderMenuItemProps {
    name: ReactNode,
    key: string,
    icon: ReactNode,
    attachTabs?: boolean,
    id: string,
    isSelectable?: boolean,
    children?: SiderMenuItemProps[]
    indicator?: boolean,
    isGroup?: boolean,
    className?: string,
    onClick?: (item?: any) => void;
    emptyProps?: EmptyProps
    actions?: ReactNode[]
    customerRender?: ReactNode
    height?: number
}