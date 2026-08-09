import React, { useEffect, useState, useCallback } from "react";
import { useResponsive, Button, Sheet, SheetContent, SheetTitle, cn, toast } from "@kn/ui";
import { Menu, PanelLeftClose, PanelLeftOpen } from "@kn/icon";
import { useApi, useService, useNavigator, useToggle, useMobilePageHeader, useTranslation } from "@kn/common";
import { APIS } from "../../api";
import { Outlet, useParams, useMatch } from "@kn/common";
import { Space } from "../../model/Space";
import { TabbedEditorArea } from "./PageEditor/TabbedEditorArea";
import { event, ON_FAVORITE_CHANGE, ON_PAGE_REFRESH } from "../../event";
import { TemplateSelector } from "../../components/TemplateSelector";
import { SpaceSidebar, GlobalSearchDialog } from "./components";
import { DockHost } from "../../components/Dock";
import { useRecentPages } from "./hooks/useRecentPages";

export const SpaceDetail: React.FC = () => {

    const { t } = useTranslation()
    const { isMobile, isTablet } = useResponsive()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    // Tablet: the page-tree sidebar is collapsible. Persisted across reloads.
    const [treeCollapsed, setTreeCollapsed] = useState<boolean>(
        () => typeof window !== "undefined" && localStorage.getItem("kn:space-tree-collapsed") === "1"
    )
    const toggleTreeCollapsed = useCallback(() => {
        setTreeCollapsed((v) => {
            const next = !v
            try { localStorage.setItem("kn:space-tree-collapsed", next ? "1" : "0") } catch { }
            return next
        })
    }, [])
    const [visible, setVisible] = useState(false)
    const [space, setSpace] = useState<Space>()
    const [pageTree, setPageTree] = useState([])
    const [favorites, setFavorites] = useState([])
    const [favoriteFlag, setFavoriteFlag] = useState(0)
    const [trash, setTrash] = useState([])
    const [open, { toggle }] = useToggle(false)
    const [flag, setFlag] = useState(0)
    const [restoreFlag, setRestoreFlag] = useState(0)
    const params = useParams()
    const isPageEdit = !!useMatch("/space-detail/:id/page/edit/:pageId")
    const navigator = useNavigator()
    const [searchValue, setSearchValue] = useState<string>()
    const [loading, { toggle: toggleLoading }] = useToggle(true)
    const [error, setError] = useState<string | null>(null)
    const { setHeaderInfo, clearHeaderInfo } = useMobilePageHeader()
    const spaceService = useService("spaceService")

    // Recent pages hook
    const { recentPages, recordVisit } = useRecentPages(params.id)

    // --- Data fetching ---

    useEffect(() => {
        if (params.id) {
            spaceService.getSpaceInfo(params.id).then((res: any) => {
                setSpace(res)
                setError(null)
            }).catch((err: any) => {
                setError('Failed to load space information')
                console.error('Error loading space:', err)
            })
        }
        return () => {
            setSpace(undefined)
        }
    }, [params.id])

    useEffect(() => {
        if (!params.id) return

        const timeoutId = setTimeout(() => {
            toggleLoading()
            spaceService.getPageTree(params.id!, searchValue)
                .then((res: any) => {
                    setPageTree(res)
                    setError(null)
                })
                .catch((err: any) => {
                    setError('Failed to load page tree')
                    console.error('Error loading page tree:', err)
                })
                .finally(() => {
                    toggleLoading()
                })
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [flag, searchValue, params.id])

    useEffect(() => {
        if (!params.id) return

        useApi(APIS.QUERY_PAGE, { spaceId: params.id, status: 'TRASH', pageSize: 20 })
            .then((res) => {
                setTrash(res.data.records)
                setError(null)
            })
            .catch(err => {
                console.error('Error loading trash:', err)
            })
    }, [restoreFlag, params.id])

    useEffect(() => {
        if (!params.id) return

        useApi(APIS.QUERY_FAVORITE, { scope: params.id, pageSize: 5 })
            .then(res => {
                setFavorites(res.data)
                setError(null)
            })
            .catch(err => {
                console.error('Error loading favorites:', err)
            })
    }, [favoriteFlag, params.id])

    useEffect(() => {
        const handler = () => {
            setFlag(f => f + 1)
            setFavoriteFlag(f => f + 1)
        }
        const onFavoriteChange = () => {
            setFavoriteFlag(f => f + 1)
        }
        event.on(ON_PAGE_REFRESH, handler)
        event.on(ON_FAVORITE_CHANGE, onFavoriteChange)
        return () => {
            event.off(ON_PAGE_REFRESH, handler)
            event.off(ON_FAVORITE_CHANGE, onFavoriteChange)
        }
    }, [])

    useEffect(() => {
        if (!params.pageId && space) {
            navigator.go({
                to: `/space-detail/${params.id}/page/edit/${space?.homePageId}`
            })
        }
    }, [space])

    // --- Keyboard shortcut: Ctrl+K for search ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault()
                toggle()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [toggle])

    // --- Action handlers ---

    const handleCreatePage = useCallback((parentId: string = "0") => {
        const param = {
            spaceId: params.id,
            parentId: parentId,
            title: "Untitled",
            content: JSON.stringify({
                "type": "doc",
                "content": [
                    {
                        "type": "title",
                        "content": [
                            {
                                "type": "heading",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Untitled"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            })
        }
        useApi(APIS.CREATE_OR_SAVE_PAGE, null, param).then(res => {
            const page = res.data
            navigator.go({
                to: `/space-detail/${params.id}/page/edit/${page.id}`
            })
            setFlag(f => f + 1)
        })
    }, [params.id, navigator])

    const handleCreateByTemplate = useCallback((id: string, title?: string) => {
        useApi(APIS.CREATE_OR_SAVE_PAGE, null, {
            templateId: id,
            spaceId: params.id,
            parentId: params.pageId,
            title: title || '未命名文档'
        }).then(res => {
            const page = res?.data
            setFlag(f => f + 1)
            setVisible(false)
            if (page?.id) {
                navigator.go({
                    to: `/space-detail/${params.id}/page/edit/${page.id}`
                })
            }
        }).catch(err => {
            console.error('Failed to create page from template:', err)
            toast.error(t('template.useFailed'))
        })
    }, [params.id, params.pageId, navigator, t])

    const handleGoToPersonalSpace = useCallback(() => {
        useApi(APIS.PERSONAL_SPACE).then((res) => {
            navigator.go({
                to: `/space-detail/${res.data.id}`
            })
            toggle()
        })
    }, [navigator, toggle])

    const handleMoveToTrash = useCallback((pageId: string) => {
        useApi(APIS.MOVE_TO_TRASH, { id: pageId }).then(() => {
            setFlag(flag => flag + 1)
            setRestoreFlag(f => f + 1)
        })
    }, [])

    const handleRestorePage = useCallback((pageId: string) => {
        useApi(APIS.RESTORE_PAGE, { id: pageId }).then(() => {
            setFlag(f => f + 1)
            setRestoreFlag(f => f + 1)
        })
    }, [])

    const handleFavorite = useCallback(() => {
        useApi(APIS.ADD_SPACE_FAVORITE, { id: params.id }).then(() => {
            setFlag(f => f + 1)
        })
    }, [params.id])

    const handleAddPageFavorite = useCallback((pageId: string) => {
        useApi(APIS.ADD_FAVORITE_PAGE, { id: pageId }).then(() => {
            event.emit(ON_FAVORITE_CHANGE)
        })
    }, [])

    const handleRemoveFavorite = useCallback((pageId: string) => {
        useApi(APIS.REMOVE_FAVORITE, { id: pageId }).then(() => {
            event.emit(ON_FAVORITE_CHANGE)
        })
    }, [])

    const handlePageClick = useCallback((pageId: string) => {
        navigator.go({
            to: `/space-detail/${params.id}/page/edit/${pageId}`
        })
        // Record the visit for recent pages
        const page = findPageInTree(pageTree, pageId)
        if (page) {
            recordVisit({
                id: page.id,
                title: page.name || page.title || 'Untitled',
                icon: page.icon,
            })
        }
    }, [params.id, navigator, pageTree, recordVisit])

    const handleNavigateHome = useCallback(() => {
        if (space?.homePageId) {
            navigator.go({
                to: `/space-detail/${params.id}/page/edit/${space.homePageId}`
            })
        }
    }, [params.id, space, navigator])

    const handleNavigateGraph = useCallback(() => {
        navigator.go({ to: `/space-detail/${params.id}/graph` })
    }, [params.id, navigator])

    const handleNavigateSettings = useCallback(() => {
        navigator.go({ to: `/space-detail/${params.id}/settings` })
    }, [params.id, navigator])

    const handleNavigateTeamHome = useCallback(() => {
        navigator.go({ to: `/space-detail/${params.id}/home` })
    }, [params.id, navigator])

    // --- Mobile header ---

    useEffect(() => {
        if (!isMobile || !space) return
        setHeaderInfo({
            title: space.name,
            icon: space?.icon?.icon,
            actions: (
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="页面目录"
                    onClick={() => setSidebarOpen(true)}
                >
                    <Menu className="h-5 w-5" />
                </Button>
            ),
        })
        return () => clearHeaderInfo()
    }, [isMobile, space, setHeaderInfo, clearHeaderInfo])

    // --- Layout ---

    const collapsedOnTablet = isTablet && treeCollapsed
    // Third column is the side dock; it collapses to just its icon rail, so `auto`
    // lets the editor keep every pixel the dock is not using.
    const gridCols = isTablet
        ? (treeCollapsed ? "grid-cols-[48px_1fr_auto]" : "grid-cols-[240px_1fr_auto]")
        : "grid-cols-[280px_1fr_auto]"

    // Shared sidebar props
    const sidebarProps = {
        space: space!,
        spaceId: params.id!,
        pageId: params.pageId,
        favorites,
        pageTree,
        trash,
        recentPages,
        loading,
        error,
        searchValue,
        onNavigateHome: handleNavigateHome,
        onFavorite: handleFavorite,
        onSearchFocus: toggle,
        onSearchChange: setSearchValue,
        onCreatePage: handleCreatePage,
        onOpenTemplates: () => setVisible(true),
        onMoveToTrash: handleMoveToTrash,
        onAddFavorite: handleAddPageFavorite,
        onRemoveFavorite: handleRemoveFavorite,
        onRestorePage: handleRestorePage,
        onPageClick: handlePageClick,
        onNavigateGraph: handleNavigateGraph,
        onNavigateSettings: handleNavigateSettings,
        onNavigateTeamHome: (space?.type === 'COLLABORATION' || space?.type === 'SPACE') ? handleNavigateTeamHome : undefined,
    }

    return space && (
        <div className={cn(
            "w-full bg-muted/40",
            isMobile ? "h-full flex flex-col" : cn("h-screen grid", gridCols)
        )}>
            {/* Mobile page-tree drawer */}
            {isMobile && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                    <SheetContent side="left" className="w-[280px] p-0">
                        <SheetTitle className="sr-only">页面目录</SheetTitle>
                        <div className="h-full flex flex-col overflow-hidden pt-safe">
                            <SpaceSidebar
                                {...sidebarProps}
                                onTreeSelected={() => setSidebarOpen(false)}
                                onPageClick={(pageId) => {
                                    handlePageClick(pageId)
                                    setSidebarOpen(false)
                                }}
                            />
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            {/* Desktop / tablet sidebar */}
            {!isMobile && (
                <div className="h-screen w-full border-r border-solid flex flex-col overflow-hidden">
                    {isTablet && (
                        <div className="flex items-center justify-end px-1 py-1 border-b flex-shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={toggleTreeCollapsed}
                                aria-label={treeCollapsed ? "展开页面树" : "收起页面树"}
                            >
                                {treeCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                            </Button>
                        </div>
                    )}
                    {!collapsedOnTablet && <SpaceSidebar {...sidebarProps} />}
                </div>
            )}

            {/* Main Content */}
            <div className={cn(
                "w-full overflow-hidden",
                isMobile ? "flex-1 min-h-0" : "h-full"
            )}>
                {isPageEdit ? (
                    <>
                        <Outlet />
                        <TabbedEditorArea spaceId={params.id} />
                    </>
                ) : (
                    <Outlet />
                )}
            </div>

            {/* Side dock: plugin-contributed panels (outline / graph / agent / backlinks) */}
            <DockHost position="right" spaceId={params.id} pageId={params.pageId} />

            {/* Template Selector Dialog */}
            <TemplateSelector
                open={visible}
                onOpenChange={setVisible}
                onCreateFromTemplate={handleCreateByTemplate}
                onCreateBlank={() => handleCreatePage(params.pageId || "0")}
            />

            {/* Global Search / Command Palette (Ctrl+K) */}
            <GlobalSearchDialog
                open={open}
                onOpenChange={() => { toggle() }}
                spaceId={params.id}
                pageTree={pageTree}
                onNavigateToPage={handlePageClick}
                onCreatePage={() => handleCreatePage(params.pageId || "0")}
                onGoToPersonalSpace={handleGoToPersonalSpace}
            />
        </div>
    )
}

/**
 * Helper to find a page node in the tree by ID.
 */
function findPageInTree(tree: any[], pageId: string): any | null {
    for (const node of tree) {
        if (node.id === pageId) return node
        if (node.children) {
            const found = findPageInTree(node.children, pageId)
            if (found) return found
        }
    }
    return null
}
