import { SiderMenuItemProps } from "../../pages/components/SiderMenu";
import { IconButton, TreeView } from "@kn/ui";
import { ArrowLeft, Clock, Copy, FolderOpen, LayoutDashboard, LayoutTemplate, MoreHorizontal, MoreVertical, Package, Plus, Settings, ShareIcon, Star, StarIcon, Trash2, Undo2, UserCircle } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@kn/ui";
import { useApi, useService, useUploadFile } from "@kn/core";
import { APIS } from "../../api";
import { Outlet, useParams } from "@kn/common";
import { Space } from "../../model/Space";
import { useNavigator } from "@kn/core";
import { Button } from "@kn/ui";
import { Input } from "@kn/ui";
import { Badge } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import { event, ON_FAVORITE_CHANGE, ON_PAGE_REFRESH } from "../../event";
import { Card } from "@kn/ui";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@kn/ui";
import { useToggle } from "@kn/core";
import { Empty } from "@kn/ui";
import { MultiSelect } from "@kn/ui";
import { SpaceHub } from "../SpaceHub";

export const SpaceDetail: React.FC = () => {

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
    const { usePath } = useUploadFile()
    const spaceService = useService("spaceService")
    useEffect(() => {
        if (params.id) {
            spaceService.getSpaceInfo(params.id).then(res => {
                setSpace(res)
            })
        }
        return () => {
            setSpace(undefined)
        }
    }, [params.id])

    useEffect(() => {
        if (params.id) {
            toggleLoading()
            spaceService.getPageTree(params!.id, searchValue).then(res => {
                setPageTree(res)
                toggleLoading()
            })
        }
    }, [flag, searchValue])

    useEffect(() => {
        useApi(APIS.QUERY_PAGE, { spaceId: params.id, status: 'TRASH', pageSize: 20 }).then((res) => {
            setTrash(res.data.records)
        })
    }, [restoreFlag])
    useEffect(() => {
        useApi(APIS.QUERY_FAVORITE, { scope: params.id, pageSize: 5 }).then(res => {
            setFavorites(res.data)
        })
    }, [favoriteFlag])

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
                to: `/space-detail/${params.id}/page/${space?.homePageId}`
            })
        }
    }, [space])

    const handleCreatePage = (parentId: string = "0") => {
        const param = {
            spaceId: params.id,
            parentId: parentId
        }
        useApi(APIS.CREATE_OR_SAVE_PAGE, null, param).then(res => {
            const page = res.data
            navigator.go({
                to: `/space-detail/${params.id}/page/edit/${page.id}`
            })
            setFlag(f => f + 1)
        })
    }

    const handleCreateByTemplate = (id: string) => {
        useApi(APIS.CREATE_OR_SAVE_PAGE, null, {
            templateId: id,
            spaceId: params.id,
            parentId: params.pageId
        }).then(() => {
            setFlag(f => f + 1)
            setVisible(false)
        })
    }

    const handleGoToPersonalSpace = () => {
        useApi(APIS.PERSONAL_SPACE).then((res) => {
            navigator.go({
                to: `/space-detail/${res.data.id}`
            })
            toggle()
        })
    }

    const handleMoveToTrash = (pageId: string) => {
        useApi(APIS.MOVE_TO_TRASH, { id: pageId }).then(() => {
            setFlag(flag => flag + 1)
            setRestoreFlag(f => f + 1)
        })
    }

    const handleRestorePage = (pageId: string) => {
        useApi(APIS.RESTORE_PAGE, { id: pageId }).then(() => {
            setFlag(f => f + 1)
            setRestoreFlag(f => f + 1)
        })
    }


    const resolve = (treeNode: any) => {

        const name = <div className="flex flex-row gap-1 items-center">
            <div className="text-left text-ellipsis text-nowrap overflow-hidden w-[140px]">
                {treeNode.icon && treeNode.icon.icon} {treeNode.name}
            </div>
            <div className=" absolute right-1">
                {treeNode.isDraft && <Badge className="py-0 px-2"  >Draft</Badge>}
                <Button size="sm" className="h-5" variant="ghost" onClick={(e) => {
                    e.stopPropagation()
                    handleCreatePage(treeNode.id)
                }}>
                    <Plus className="h-3 w-3" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <Button size="sm" className="h-5" variant="ghost" onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                        }}><MoreHorizontal className="h-3 w-3" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-[200px]">
                        <DropdownMenuItem className="flex flex-row gap-1">
                            <Star className="h-4 w-4" /> Add to favorite
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="flex flex-row gap-1">
                            <Copy className="h-4 w-4" />Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex flex-row gap-1">
                            <ArrowLeft className="h-4 w-4" /> Move
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex flex-row gap-1" onClick={() => handleMoveToTrash(treeNode.id)}>
                            <Trash2 className="h-4 w-4" /> Move to trash
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>
                            <div className=" text-gray-500 text-xs flex flex-col gap-1">
                                <div className="flex flex-row gap-1 items-center"> <Clock className="w-3 h-3" />Last update by Leong</div>
                                <div className="flex flex-row gap-1 items-center"> <UserCircle className="w-3 h-3" />2024年8月19日</div>
                            </div>
                        </DropdownMenuLabel>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        if (!treeNode.children) {
            return {
                name: name,
                key: treeNode.id,
                id: treeNode.id,
                onClick: () => {
                    if (treeNode.isDraft) {
                        navigator.go({
                            to: `/space-detail/${params.id}/page/edit/${treeNode.id}`
                        })
                    } else {
                        navigator.go({
                            to: `/space-detail/${params.id}/page/${treeNode.id}`
                        })
                    }
                }
            }
        } else {
            return {
                name: name,
                key: treeNode.id,
                id: treeNode.id,
                children: treeNode.children.map((i: any) => resolve(i)),
                onClick: () => {
                    navigator.go({
                        to: `/space-detail/${params.id}/page/${treeNode.id}`
                    })
                }
            }
        }
    }

    const elements: SiderMenuItemProps[] = space ? [
        {
            name: space.name,
            key: '/space/:id/overView',
            icon: space?.icon?.icon || '',
            id: '/space/:id/overView',
            className: 'h-10 gap-3 px-2 bg-muted/10',
            customerRender:
                <div className="flex flex-row gap-1 items-center justify-between">
                    <div className=" p-2 mt-1 border rounded-sm flex-1 flex justify-between items-center">
                        <div className="flex items-center gap-1 cursor-pointer" onClick={() => {
                            navigator.go({
                                to: `/space-detail/${params.id}/page/${space.homePageId}`
                            })
                        }}>
                            <div>{space?.icon?.icon}</div>
                            {space.name}
                        </div>
                        <div className="flex items-center gap-1">
                            <IconButton icon={ <StarIcon className="h-4 w-4" />} />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild> 
                                   <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent side="bottom" align="start">
                                    <DropdownMenuItem onClick={() => {
                                        spaceService.saveAsTemplate(space.id)
                                    }}>
                                        Save as template
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                        Create page
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
        },
        {
            name: 'customerRender',
            key: 'customerRender',
            id: 'customerRender',
            icon: '',
            customerRender: <div className="px-1 mt-2 mb-2">
                <Input placeholder="search" onFocus={toggle} />
            </div>
        },
        {
            name: 'Favorite',
            key: 'favorite',
            id: 'favorite',
            icon: <Star className="h-4 2-4" />,
            isGroup: true,
            emptyProps: {
                icon: <FolderOpen />,
                title: 'No Favorites'
            },
            children: favorites.map((it: any, index) => ({
                name: <div className="flex items-center">
                    <div className="w-[200px] text-left text-nowrap text-ellipsis overflow-hidden">
                        {it.title}
                    </div>
                    <div className=" absolute right-2">
                        <Trash2 className="h-4 w-4 text-red-500" />
                    </div>
                </div>,
                key: it.id + index,
                id: it.id + index,
                icon: null,
                onClick: () => {
                    navigator.go({
                        to: `/space-detail/${params.id}/page/${it.id}`
                    })
                }
            }))
        },
        {
            name: <div className="flex flex-row items-center gap-2">
                Page
                <Input onChange={(e) => setSearchValue(e.target.value)} className="h-7" placeholder="Search..." />
            </div>,
            isGroup: true,
            key: 'page',
            id: 'page',
            height: 350,
            className: 'h-[400px]',
            icon: <Package />,
            actions: [
                <Button className="h-7 w-7 ml-1" variant="ghost" size="icon" key="1" onClick={() => handleCreatePage()}><Plus className="h-3 w-3" /></Button>
            ],
            emptyProps: {
                icon: <FolderOpen />,
                title: 'No Pages',
                button: <Button size="sm" onClick={() => handleCreatePage()}>create a page</Button>
            },
            children: pageTree?.length > 0 ? pageTree.map(it => resolve(it)) as SiderMenuItemProps[] : []
        },
        {
            name: 'Templates',
            id: '/space/:id/templates',
            icon: <LayoutTemplate className="h-4 w-4" />,
            key: '/space/:id/templates',
            onClick: () => {
                setVisible(true)
            }
        },
        {
            name: 'Space Setting',
            id: '/space/:id/settings',
            icon: <Settings className="h-4 w-4" />,
            key: '/space/:id/settings',
            onClick: () => {
                navigator.go({
                    to: `/space-detail/${params.id}/settings`
                })
            }
        },
        {
            name: 'Trash',
            customerRender: <DropdownMenu>
                <DropdownMenuTrigger className="flex flex-row gap-2 items-center w-full px-1 py-1 rounded-sm text-sm hover:bg-muted"><Trash2 className="h-4 w-4" /> Trash</DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-[300px] h-[400px]">
                    <DropdownMenuLabel><Input className="h-7" placeholder="Search..." /></DropdownMenuLabel>
                    {trash.length > 0 ? trash.map((item: any, index) => (
                        <DropdownMenuItem key={index} className="flex flex-row justify-between items-center">
                            {item.title}
                            <div>
                                <Button variant="ghost" size="sm" onClick={() => handleRestorePage(item.id)}><Undo2 className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="sm"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        </DropdownMenuItem>
                    )) : <Empty className=" border-0 h-full items-center" />}
                </DropdownMenuContent>
            </DropdownMenu>,
            id: '/space/:id/trash',
            icon: <Trash2 className="h-4 w-4" />,
            key: '/space/:id/trash',
            className: 'text-red-500'
        }
    ] : []

    return space && <div className="grid grid-cols-[280px_1fr] h-full w-full bg-muted/40 ">
        <div className="h-full w-full border-r border-solid overflow-auto">
            <TreeView
                initialSelectedId={params.pageId}
                loading={loading}
                size="sm"
                selectParent={true}
                className="w-full h-full"
                elements={elements} />
        </div>
        <div className="w-full h-screen">
            <Outlet />
        </div>
        <Sheet
            open={visible}
            onOpenChange={(value) => {
                setVisible(value)
            }}
        >
            <SheetContent className="w-[1000px] sm:max-w-none">
                <SheetTitle className="flex flex-row items-center gap-1">
                    选择一个模板
                </SheetTitle>
                <div className="flex flex-col gap-4 mt-4">
                    <div className=" font-bold">个人模板</div>
                    <div className="flex flex-row items-center gap-2">
                        <Input className="w-[200px] h-8" placeholder="搜索模板..." />
                        <MultiSelect
                            placeholder="模板类型"
                            className="h-7 w-[150px]"
                            options={[]}
                            defaultValue={[]}
                            onValueChange={(value) => { }}
                        />
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                        {
                            yourTemplates.map((item: any, index) => (
                                <div className="flex flex-col gap-1">
                                    <Card key={index} className="border hover:bg-muted h-[200px]" style={{
                                        backgroundImage: `url('${usePath(item.cover)}&cache=true')`,
                                        backgroundSize: 'cover'
                                    }} >
                                    </Card>
                                    <div className="flex flex-row justify-between items-center text-sm text-gray-500 italic ">
                                        <div className=" w-[100px] overflow-hidden text-ellipsis text-nowrap">{item.title}</div>
                                        <a href="#" className="flex flex-row gap-1 items-center underline"><UserCircle className="h-4 w-4" />Author Leong</a>
                                    </div>
                                    <div>
                                        <Button size="sm" onClick={() => handleCreateByTemplate(item.id)}>使用此模板</Button>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </SheetContent>
        </Sheet>
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
}