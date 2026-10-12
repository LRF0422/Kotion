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
    activePaths?: string[],
    isSelectable?: boolean,
    children?: SiderMenuItemProps[]
    indicator?: boolean,
    isGroup?: boolean,
    className?: string,
    onClick?: (item?: any) => void;
    emptyProps?: any
    actions?: ReactNode[]
    customerRender?: ReactNode
    height?: number
}

/**
 * A menu entry as returned by `PluginManager.resolveMenus()`.
 *
 * Carries the same provenance dock panels do (`source` / `owner` / `pluginKey`), so
 * a sidebar entry can be attributed to the plugin that contributed it. That is not
 * bookkeeping for its own sake: it is what lets the studio tell a developer *what
 * their plugin currently contributes to the shell* — and what turns "my menu does
 * not appear" into an answerable question (is it missing from the registry, or from
 * the rail?) instead of a guess.
 */
export interface ResolvedSiderMenuItem extends SiderMenuItemProps {
    /** Whether the entry came from a plugin bundle or from the host itself. */
    source: 'plugin' | 'core'
    /** Contributing plugin's runtime name, or 'core'. */
    owner: string
    /** Contributing plugin's registry key, or 'core'. */
    pluginKey: string
}
