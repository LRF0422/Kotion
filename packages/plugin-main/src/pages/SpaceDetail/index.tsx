import { SiderMenuItemProps } from "../../pages/components/SiderMenu";
import { IconButton, TreeView, useIsMobile, Button, Sheet, SheetContent, SheetTrigger, SheetTitle } from "@kn/ui";
import { ArrowLeft, CircleArrowUp, Clock, Copy, LayoutDashboard, LayoutTemplate, Menu, MoreHorizontal, Package, Plus, Settings, Star, StarIcon, Trash2, Undo2, UserCircle, AlertCircle } from "@kn/icon";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useApi, useService, useUploadFile, useNavigator, useToggle } from "@kn/common";
import { APIS } from "../../api";
import { Outlet, useParams } from "@kn/common";
import { Space } from "../../model/Space";

import { Input } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Alert, AlertDescription } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import { event, ON_FAVORITE_CHANGE, ON_PAGE_REFRESH } from "../../event";
import { Card } from "@kn/ui";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@kn/ui";

import { MultiSelect, cn } from "@kn/ui";
import { TemplateCreator } from "./TemplateCreator";
import { TemplateSelector } from "../../components/TemplateSelector";

export const SpaceDetail: React.FC = () => {

    const isMobile = useIsMobile()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [visible, setVisible] = useState(false)
    const [space, setSpace] = useState<Space>()
    const [pageTree, setPageTree] = useState([])
    const [favorites, setFavorites] = useState([])
    const [favoriteFlag, setFavoriteFlag] = useState(0)
    const [yourTemplates, setYourTemplates] = useState([])
    const [trash, setTrash] = useState([])
    const [open, { toggle }] = useToggle(false)
    const [templates, setTemplates] = useState([])
    const [flag, setFlag] = useState(0)
    const [restoreFlag, setRestoreFlag] = useState(0)
    const params = useParams()
    const navigator = useNavigator()
    const [searchValue, setSearchValue] = useState<string>()
    const [loading, { toggle: toggleLoading }] = useToggle(true)
    const [error, setError] = useState<string | null>(null)
    const { usePath } = useUploadFile()
    const spaceService = useService("spaceService")
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

    // Debounce search to avoid excessive API calls
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
        }, 300) // 300ms debounce

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
        if (visible) {
            useApi(APIS.QUERY_TEMPLATE).then(res => {
                setYourTemplates(res.data)
            })
        }
    }, [visible])

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

    const handleCreateByTemplate = useCallback((id: string) => {
        useApi(APIS.CREATE_OR_SAVE_PAGE, null, {
            templateId: id,
            spaceId: params.id,
            parentId: params.pageId
        }).then(() => {
            setFlag(f => f + 1)
            setVisible(false)
        })
    }, [params.id, params.pageId])

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


    const resolve = useCallback((treeNode: any): SiderMenuItemProps => {

        const name = <div className="flex flex-row gap-1 items-center group w-full overflow-hidden text-ellipsis relative">
            <div className="text-left text-ellipsis text-nowrap overflow-hidden flex-1 min-w-0 flex items-center w-full">
                {treeNode.icon && <span className="text-xs sm:text-sm">{treeNode.icon.icon}</span>}
                <span className="text-xs sm:text-sm">{treeNode.name}</span>
            </div>
            <div className="absolute right-0 left-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 bg-muted">
                {treeNode.isDraft && <Badge variant="outline" className="py-0 px-1 sm:px-1.5 text-[10px] sm:text-xs h-4 sm:h-5">Draft</Badge>}
                <Button
                    size="sm"
                    className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                    variant="ghost"
                    onClick={(e) => {
                        e.stopPropagation()
                        handleCreatePage(treeNode.id)
                    }}
                    title="Add subpage"
                >
                    <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="sm"
                            className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                            variant="ghost"
                            onClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                            }}
                        >
                            <MoreHorizontal className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-[200px] sm:w-[220px]">
                        <DropdownMenuItem className="flex flex-row gap-2 text-xs sm:text-sm">
                            <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Add to favorites
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="flex flex-row gap-2 text-xs sm:text-sm">
                            <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex flex-row gap-2 text-xs sm:text-sm">
                            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Move to
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="flex flex-row gap-2 text-red-600 focus:text-red-600 text-xs sm:text-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleMoveToTrash(treeNode.id);
                            }}
                        >
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Move to trash
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>
                            <div className="text-gray-500 text-[10px] sm:text-xs flex flex-col gap-1 sm:gap-1.5 font-normal">
                                <div className="flex flex-row gap-1 sm:gap-1.5 items-center">
                                    <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                    <span>Last updated by Leong</span>
                                </div>
                                <div className="flex flex-row gap-1 sm:gap-1.5 items-center">
                                    <UserCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                    <span>2024年8月19日</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        if (!treeNode.children) {
            return {
                icon: null,
                name: name,
                key: treeNode.id,
                id: treeNode.id,
                onClick: () => {
                    navigator.go({
                        to: `/space-detail/${params.id}/page/edit/${treeNode.id}`
                    })
                }
            }
        } else {
            return {
                icon: null,
                name: name,
                key: treeNode.id,
                id: treeNode.id,
                children: treeNode.children.map((i: any) => resolve(i)),
                onClick: () => {
                    navigator.go({
                        to: `/space-detail/${params.id}/page/edit/${treeNode.id}`
                    })
                }
            }
        }
    }, [params.id, navigator, handleCreatePage, handleMoveToTrash])

    const elements: SiderMenuItemProps[] = useMemo(() => space ? [
        {
            name: space.name,
            key: '/space/:id/overView',
            icon: space?.icon?.icon || '',
            id: '/space/:id/overView',
            className: 'px-0 mb-2',
            customerRender:
                <div className="flex flex-col gap-1.5 p-2 border-b pb-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                            navigator.go({
                                to: `/space-detail/${params.id}/page/edit/${space.homePageId}`
                            })
                        }}>
                            <div className="text-xl flex-shrink-0">{space?.icon?.icon}</div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <h2 className="font-semibold text-sm truncate">{space.name}</h2>
                            </div>
                        </div>
                        <IconButton icon={<StarIcon className="h-3.5 w-3.5" />} onClick={handleFavorite} className="h-6 w-6" />
                    </div>
                    <div className="relative">
                        <Input
                            placeholder="Search pages..."
                            className="h-7 pl-2.5 pr-8 text-xs bg-muted/50 border-0 focus:bg-background focus:border focus:border-border"
                            onFocus={toggle}
                        />
                    </div>
                </div>
        },
        {
            name: 'Favorites',
            key: 'favorite',
            id: 'favorite',
            icon: <Star className="h-4 w-4" />,
            isGroup: true,
            className: 'mt-1',
            emptyProps: {
                icon: <Star className="h-5 w-5 text-muted-foreground/40" />,
                title: 'No favorites',
                description: 'Star pages to quick access'
            },
            children: favorites.map((it: any, index) => ({
                name: <div className="flex items-center gap-1 sm:gap-2 pr-6 sm:pr-8">
                    <div className="flex-1 text-left text-nowrap text-ellipsis overflow-hidden text-xs sm:text-sm">
                        {it.icon?.icon && <span className="mr-1">{it.icon.icon}</span>}
                        {it.title}
                    </div>
                    <div className="absolute right-1 sm:right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                // Remove from favorites
                            }}
                        >
                            <Trash2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground hover:text-red-500" />
                        </Button>
                    </div>
                </div>,
                key: it.id + index,
                id: it.id + index,
                icon: null,
                className: 'group',
                onClick: () => {
                    navigator.go({
                        to: `/space-detail/${params.id}/page/edit/${it.id}`
                    })
                }
            }))
        },
        {
            name: 'Pages',
            isGroup: true,
            key: 'page',
            id: 'page',
            className: 'mt-2 flex-1 flex flex-col min-h-0',
            height: 'calc(100vh - 500px)',
            icon: <Package className="h-4 w-4" />,
            actions: [
                <div key="search-actions" className="flex items-center gap-0.5">
                    <Input
                        onChange={(e) => setSearchValue(e.target.value)}
                        className="h-5 text-[11px] bg-muted/50 border-0 focus:bg-background focus:border focus:border-border"
                        placeholder="Filter..."
                    />
                    <Button
                        className="h-5 w-5 p-0"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCreatePage()}
                        title="New page"
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>
            ],
            emptyProps: {
                icon: <Package className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/50" />,
                title: 'No pages yet',
                description: 'Create your first page',
                button: <Button size="sm" onClick={() => handleCreatePage()} className="h-7 sm:h-8 text-xs sm:text-sm">
                    <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    Create Page
                </Button>
            },
            children: pageTree?.length > 0 ? pageTree.map(it => resolve(it)) as SiderMenuItemProps[] : []
        },
        {
            name: 'Bottom Utilities',
            key: 'bottom-utilities',
            id: 'bottom-utilities',
            icon: '',
            customerRender: <div className="border-t pt-1 mt-1 space-y-0.5">
                <div
                    className="flex items-center gap-2 py-1 px-1 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                    onClick={() => setVisible(true)}
                >
                    <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">Templates</span>
                </div>
                <div
                    className="flex items-center gap-2 py-1 px-1 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                    onClick={() => {
                        navigator.go({
                            to: `/space-detail/${params.id}/settings`
                        })
                    }}
                >
                    <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">Settings</span>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-2 w-full py-1 px-1 rounded-md text-xs sm:text-sm hover:bg-muted transition-colors">
                        <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 text-left">Trash</span>
                        {trash.length > 0 && <Badge variant="secondary" className="h-4 sm:h-5 px-1 sm:px-1.5 text-[10px] sm:text-xs">{trash.length}</Badge>}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-[280px] sm:w-[320px] max-h-[350px] sm:max-h-[400px]">
                        <DropdownMenuLabel className="pb-2">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                                <span>Trash</span>
                                <span className="text-[10px] sm:text-xs text-muted-foreground">{trash.length} items</span>
                            </div>
                        </DropdownMenuLabel>
                        <div className="max-h-[300px] sm:max-h-[350px] overflow-auto">
                            {trash.length > 0 ? trash.map((item: any, index) => (
                                <DropdownMenuItem key={index} className="flex flex-row justify-between items-center gap-2 py-2">
                                    <div className="flex-1 truncate text-xs sm:text-sm">
                                        {item.icon?.icon && <span className="mr-1">{item.icon.icon}</span>}
                                        {item.title}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 sm:h-7 px-1.5 sm:px-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRestorePage(item.id);
                                            }}
                                            title="Restore"
                                        >
                                            <Undo2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                        </Button>
                                    </div>
                                </DropdownMenuItem>
                            )) : (
                                <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                                    <Trash2 className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/50 mb-2" />
                                    <p className="text-xs sm:text-sm text-muted-foreground">Trash is empty</p>
                                </div>
                            )}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
                <TemplateCreator mode="space" space={space} className="flex items-center gap-2 w-full py-1 px-1 rounded-md text-xs sm:text-sm hover:bg-muted transition-colors">
                    <CircleArrowUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">Save as Template</span>
                </TemplateCreator>
            </div>
        }
    ] : [], [space, favorites, pageTree, trash, params.id, navigator, toggle, handleFavorite, handleCreatePage, handleRestorePage, resolve])

    // Sidebar content component for reuse
    const SidebarContent = useMemo(() => (
        <div className="h-full flex flex-col min-h-0">
            {error && (
                <Alert variant="destructive" className="m-2 flex-shrink-0">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <TreeView
                initialSelectedId={params.pageId}
                loading={loading}
                size="sm"
                selectParent={true}
                className="w-full flex-1 flex flex-col min-h-0"
                elements={elements}
                onTreeSelected={() => {
                    if (isMobile) {
                        setSidebarOpen(false)
                    }
                }}
            />
        </div>
    ), [error, params.pageId, loading, elements, isMobile])

    return space && (
        <div className={cn(
            "h-screen w-full bg-muted/40",
            isMobile ? "flex flex-col" : "grid grid-cols-[280px_1fr]"
        )}>
            {/* Mobile Header */}
            {isMobile && (
                <div className="flex items-center justify-between px-3 sm:px-4 h-11 sm:h-12 border-b bg-background sticky top-0 z-40">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                        <span className="text-base sm:text-lg">{space?.icon?.icon}</span>
                        <span className="font-medium truncate text-sm sm:text-base">{space.name}</span>
                    </div>
                    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9">
                                <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[260px] sm:w-[280px] p-0">
                            <SheetTitle className="sr-only">Navigation</SheetTitle>
                            <div className="h-full flex flex-col overflow-hidden">
                                {SidebarContent}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            )}

            {/* Desktop Sidebar */}
            {!isMobile && (
                <div className="h-screen w-full border-r border-solid flex flex-col overflow-hidden">
                    {SidebarContent}
                </div>
            )}

            {/* Main Content */}
            <div className={cn(
                "w-full overflow-hidden",
                isMobile ? "flex-1" : "h-full"
            )}>
                <Outlet />
            </div>
            <TemplateSelector
                open={visible}
                onOpenChange={setVisible}
                onCreateFromTemplate={handleCreateByTemplate}
            />
            <CommandDialog open={open} onOpenChange={() => { toggle() }}>
                <CommandInput />
                <CommandList>
                    <CommandEmpty />
                    <CommandGroup heading="Page">
                        <CommandItem onSelect={() => {
                            handleCreatePage(params.pageId || "0")
                            toggle()
                        }}>
                            <Plus className="mr-2 h-4 w-4" />
                            <span>Create Page</span>
                        </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Space">
                        <CommandItem onSelect={handleGoToPersonalSpace}>
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Personal Space</span>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </div>
    )
}