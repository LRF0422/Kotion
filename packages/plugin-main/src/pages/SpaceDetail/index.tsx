import React, { useEffect, useState, useCallback } from "react";
import { useResponsive, Button, Sheet, SheetContent, SheetTitle, cn, toast } from "@kn/ui";
import { Menu, PanelLeftClose, PanelLeftOpen } from "@kn/icon";
import { type PageSummary, type PageTreeNode, type ResolvedPageType, type Space, useSpacePageService, useNavigator, useToggle, useMobilePageHeader, useTranslation, usePageTabsStorage } from "@kn/common";
import { Outlet, useParams, useMatch } from "@kn/common";
import { TabbedEditorArea } from "./PageEditor/TabbedEditorArea";
import { TemplateSelector } from "../../components/TemplateSelector";
import { createPageByType } from "../../components/CreatePageTypeMenu";
import { SpaceSidebar, GlobalSearchDialog } from "./components";
import { isPageIconData } from "./components/PageItemIcon";
import { DockHost } from "../../components/Dock";
import { useRecentPages } from "./hooks/useRecentPages";

export const SpaceDetail: React.FC = () => {

    const { t, i18n } = useTranslation()
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
    const [pageTree, setPageTree] = useState<PageTreeNode[]>([])
    const [favorites, setFavorites] = useState<PageSummary[]>([])
    const [favoriteFlag, setFavoriteFlag] = useState(0)
    const [trash, setTrash] = useState<PageSummary[]>([])
    const [open, { toggle }] = useToggle(false)
    const [flag, setFlag] = useState(0)
    const [restoreFlag, setRestoreFlag] = useState(0)
    const params = useParams()
    usePageTabsStorage(params.id)
    const isPageEdit = !!useMatch("/space-detail/:id/page/edit/:pageId")
    const navigator = useNavigator()
    const [searchValue, setSearchValue] = useState<string>()
    const [loading, { toggle: toggleLoading }] = useToggle(true)
    const [error, setError] = useState<string | null>(null)
    const { setHeaderInfo, clearHeaderInfo } = useMobilePageHeader()
    const service = useSpacePageService()

    // Recent pages hook
    const { recentPages, recordVisit } = useRecentPages(params.id)

    // --- Data fetching ---

    useEffect(() => {
        if (params.id) {
            service.spaces.getSpace(params.id).then((result) => {
                setSpace(result)
                setError(null)
            }).catch((err: any) => {
                setError('Failed to load space information')
                console.error('Error loading space:', err)
            })
        }
        return () => {
            setSpace(undefined)
        }
    }, [params.id, service])

    useEffect(() => {
        if (!params.id) return
        const spaceId = params.id

        const timeoutId = setTimeout(() => {
            toggleLoading()
            service.pages.getPageTree({ spaceId, searchValue })
                .then((result) => {
                    setPageTree(result)
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
    }, [flag, searchValue, params.id, service, toggleLoading])

    useEffect(() => {
        if (!params.id) return

        service.pages.queryPages({ spaceId: params.id, status: 'TRASH', pageSize: 20 })
            .then((result) => {
                setTrash(result.records)
                setError(null)
            })
            .catch(err => {
                console.error('Error loading trash:', err)
            })
    }, [restoreFlag, params.id, service])

    useEffect(() => {
        if (!params.id) return

        service.pages.queryFavoritePages({ spaceId: params.id, pageSize: 5 })
            .then(result => {
                setFavorites(result.records)
                setError(null)
            })
            .catch(err => {
                console.error('Error loading favorites:', err)
            })
    }, [favoriteFlag, params.id, service])

    useEffect(() => {
        if (!params.id) return
        const currentSpaceId = params.id
        const refreshTree = () => setFlag(value => value + 1)
        const refreshFavorites = () => setFavoriteFlag(value => value + 1)
        const refreshTrash = () => setRestoreFlag(value => value + 1)
        const matchesSpace = (spaceId?: string) => !spaceId || spaceId === currentSpaceId
        const unsubscribers = [
            service.changes.subscribe("space.updated", ({ payload }) => {
                if (payload.space?.id === currentSpaceId) setSpace(payload.space)
            }),
            service.changes.subscribe("page.created", ({ payload }) => {
                if (matchesSpace(payload.spaceId ?? payload.page.spaceId)) refreshTree()
            }),
            service.changes.subscribe("page.updated", ({ payload }) => {
                if (matchesSpace(payload.spaceId ?? payload.page.spaceId)) refreshTree()
            }),
            service.changes.subscribe("page.deleted", ({ payload }) => {
                if (matchesSpace(payload.spaceId)) refreshTree()
            }),
            service.changes.subscribe("page.moved", ({ payload }) => {
                if (matchesSpace(payload.spaceId)) refreshTree()
            }),
            service.changes.subscribe("page.tree.changed", ({ payload }) => {
                if (payload.spaceId === currentSpaceId) refreshTree()
            }),
            service.changes.subscribe("page.trashed", () => {
                refreshTree()
                refreshTrash()
            }),
            service.changes.subscribe("page.restoredFromTrash", () => {
                refreshTree()
                refreshTrash()
            }),
            service.changes.subscribe("page.favorite.changed", ({ payload }) => {
                if (matchesSpace(payload.spaceId)) refreshFavorites()
            }),
        ]
        return () => unsubscribers.forEach(unsubscribe => unsubscribe())
    }, [params.id, service])

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

    const handleCreatePage = useCallback((parentId: string = "0", pageType?: ResolvedPageType) => {
        if (!params.id) return
        createPageByType({
            service,
            spaceId: params.id,
            parentId,
            pageType,
            locale: i18n?.language,
            translate: (key, fallback) => t(key, fallback),
        }).then(page => {
            navigator.go({
                to: `/space-detail/${params.id}/page/edit/${page.id}`
            })
        }).catch((createError) => {
            console.error('Failed to create page:', createError)
            toast.error(t('page.createFailed', 'Failed to create page'))
        })
    }, [params.id, navigator, service, t, i18n?.language])

    // Create a page at the same level as the current page (i.e. under its parent).
    // Falls back to the space root when no page is open or the page is not in the tree.
    const handleCreateSiblingPage = useCallback((pageType?: ResolvedPageType) => {
        const parentId = params.pageId
            ? findParentIdInTree(pageTree, params.pageId) ?? "0"
            : "0"
        handleCreatePage(parentId, pageType)
    }, [params.pageId, pageTree, handleCreatePage])

    const handleCreateByTemplate = useCallback((id: string, title?: string) => {
        if (!params.id) return
        service.pages.createPage({
            templateId: id,
            spaceId: params.id,
            parentId: params.pageId,
            title: title || '未命名文档'
        }).then(page => {
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
    }, [params.id, params.pageId, navigator, service, t])

    const handleGoToPersonalSpace = useCallback(() => {
        service.spaces.getPersonalSpace().then((personalSpace) => {
            navigator.go({
                to: `/space-detail/${personalSpace.id}`
            })
            toggle()
        })
    }, [navigator, service, toggle])

    const handleMoveToTrash = useCallback((pageId: string) => {
        void service.pages.movePageToTrash(pageId)
    }, [service])

    const handleRestorePage = useCallback((pageId: string) => {
        void service.pages.restorePageFromTrash(pageId)
    }, [service])

    const handleFavorite = useCallback(() => {
        if (!params.id) return
        void service.spaces.toggleSpaceFavorite(params.id)
    }, [params.id, service])

    const handleAddPageFavorite = useCallback((pageId: string) => {
        void service.pages.favoritePage(pageId)
    }, [service])

    const handleRemoveFavorite = useCallback((pageId: string) => {
        void service.pages.unfavoritePage(pageId)
    }, [service])

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
            icon: isPageIconData(space.icon) ? space.icon.icon : undefined,
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
            isMobile
                ? "h-full flex flex-col"
                : cn("kn-workspace-shell h-full min-h-0 grid grid-rows-[minmax(0,1fr)]", gridCols)
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
                <div className="kn-workspace-sidebar flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-solid">
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
                isMobile ? "flex-1 min-h-0" : "kn-workspace-editor h-full min-h-0 min-w-0"
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
            <DockHost
                position="right"
                spaceId={params.id}
                pageId={params.pageId}
                className="kn-workspace-dock"
            />

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
                onCreatePage={(pageType) => handleCreatePage(params.pageId || "0", pageType)}
                onCreateSiblingPage={handleCreateSiblingPage}
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

/**
 * Helper to find the parent ID of a page in the tree.
 * Returns "0" for root-level pages, null when the page is not found.
 */
function findParentIdInTree(tree: any[], pageId: string, parentId: string = "0"): string | null {
    for (const node of tree) {
        if (String(node.id) === String(pageId)) return parentId
        if (node.children) {
            const found = findParentIdInTree(node.children, pageId, String(node.id))
            if (found !== null) return found
        }
    }
    return null
}
