import { APIS } from "../../../api";
import { Badge, ExpandableChat } from "@kn/ui";
import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuLabel } from "@kn/ui";
import { Label } from "@kn/ui";
import { RadioGroup, RadioGroupItem } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Switch } from "@kn/ui";
import { Skeleton } from "@kn/ui";
import { CollaborationEditor, EditorView, printEditorContent } from "@kn/editor";
import { event, ON_PAGE_REFRESH } from "../../../event";
import { useApi, useService } from "@kn/core";
import { useNavigator } from "@kn/core";
import { GlobalState } from "@kn/core";
import { Editor } from "@kn/editor";
import { useFullscreen, useKeyPress, useToggle, useUnmount } from "@kn/core";
import {
    ALargeSmall, ArrowLeft, BookTemplate, CircleArrowUp,
    Contact2, Download, FileIcon,
    FullscreenIcon, Link, Loader, LoaderCircle, LockIcon, MessageSquareText,
    Minimize2, MoreHorizontal, MoveDownRight, Plus, Save, Trash2, Upload
} from "@kn/icon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@kn/common";
import { useParams } from "@kn/common";
import { toast } from "@kn/ui";

export const PageEditor: React.FC = () => {
    const [page, setPage] = useState<any>()
    const params = useParams()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const [loading, { toggle }] = useToggle(false)
    const [pageLoading, { toggle: toggleLoading }] = useToggle(false)
    const [synceStatus, setSyncStatus] = useState(false)
    const lastAwarenessRef = useRef<any[]>([])
    const [status, setStatus] = useState<any>({
        status: 'Ready'
    })
    const [users, setUsers] = useState<any[]>()
    const editor = useRef<Editor>(null)
    const navigator = useNavigator()
    const ref = useRef<any>()
    const [fullScreen, { toggleFullscreen }] = useFullscreen(ref)
    const spaceService = useService("spaceService")

    useEffect(() => {
        toggleLoading()
        spaceService.getPage(params.pageId!).then((res) => {
            setPage(res)
            toggleLoading()
        })

        return () => {
            setPage(null)
        }
    }, [params.pageId])

    const getTitleContent = (value: any) => {
        if (value) {
            const content = value.content[0]
            console.log('content', content);

            if (content.content) {
                return content.content[0].content[0].text
            }
        }
        return null
    }

    const getIcon = (value: any) => {
        if (value) {
            const content = value.content[0]
            if (content) {
                return content.attrs?.icon
            }
        }
        return null
    }

    const handleSave = (publish: boolean = false) => {
        const preStatus = status;
        setStatus({
            status: "Saving"
        })
        toggle()
        if (editor.current) {
            const pageContent = editor.current.getJSON()
            const title = getTitleContent(pageContent);
            const icon = getIcon(pageContent);

            page.title = title
            page.icon = icon
            page.id = params.pageId
            page.content = JSON.stringify(pageContent)

            console.log('content', pageContent);
            console.log('page', page.content);
            page.publish = publish
            if (publish) {
                useApi(APIS.CREATE_OR_SAVE_PAGE, undefined, page).then((res) => {
                    navigator.go({
                        to: `/space-detail/${params.id}/page/${params.pageId}`
                    })
                    toast.success("发布成功")
                    event.emit(ON_PAGE_REFRESH)
                }).finally(() => {
                    toggle()
                    setStatus(preStatus)
                })
            } else {
                useApi(APIS.CREATE_OR_SAVE_PAGE, undefined, page).then((res) => {
                    event.emit(ON_PAGE_REFRESH)
                }).finally(() => {
                    toggle()
                    setStatus(preStatus)
                })
            }

        }
    }

    useKeyPress(["ctrl.s"], (e) => {
        e.preventDefault()
        handleSave()
    })


    const handleSaveAsTemplate = () => {
        useApi(APIS.SAVE_AS_TEMPLATE, { id: params.pageId }).then(() => {
            toast.success("保存成功")
        })
    }

    // const provider = useMemo(() => {
    //     const doc = new Y.Doc()
    //     return new TiptapCollabProvider({
    //         baseUrl: 'ws://www.simple-platform.cn:1234',
    //         name: params.pageId as string,
    //         token: params.pageId as string,
    //         document: doc,
    //         onAwarenessUpdate: ({ states }) => {
    //             const users = states.map((state) => ({ clientId: state.clientId, user: state.user }));
    //             if (deepEqual(userInfo, lastAwarenessRef.current)) {
    //                 return;
    //             }
    //             setUsers(users)
    //             lastAwarenessRef.current = users;
    //         },
    //         onSynced: () => {
    //             setSyncStatus(true)
    //         },
    //         onStatus: (status) => {
    //             setStatus(status)
    //         }
    //     })
    // }, [params.pageId])

    useUnmount(() => {
        setSyncStatus(false)
    })

    return pageLoading ? <div className="w-full h-full" ref={ref}>
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b">
            <div className="flex flex-row items-center gap-2 px-1">
                <Skeleton className="h-5 w-48" />
            </div>
            <div className="flex flex-row items-center gap-1 px-1">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
                <Separator orientation="vertical" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
            </div>
        </header>
        <main className="w-full flex flex-row justify-center p-8">
            <div className="w-full max-w-[900px] flex flex-col gap-6">
                {/* Title Skeleton */}
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-12 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                {/* Content Skeleton */}
                <div className="flex flex-col gap-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-5/6" />
                    <Skeleton className="h-32 w-full rounded-lg" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-4/5" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            </div>
        </main>
    </div> : (page && <div className="w-full h-full" ref={ref}>
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b">
            <div className="flex flex-row items-center gap-2 px-1 text-sm">
                <span>{page.title}</span>
            </div>
            <div className="flex flex-row items-center gap-1 px-1">
                <Badge>
                    <div className="flex flex-row items-center gap-1">
                        {status?.status} {loading && <LoaderCircle className="h-3 w-3 animate-spin" />}
                    </div>
                </Badge>
                {/* 
                <div className="mx-2 ">
                    {
                        users ? <div className="flex flex-row gap-2">
                            {
                                users.map((user, index) => (
                                    <Avatar key={index} className={cn("h-7 w-7 outline ease-in")}>
                                        <AvatarImage src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${user?.user?.avatar}`} />
                                    </Avatar>
                                ))
                            }
                            <CollaborationInvitationDlg>
                                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center hover:outline cursor-pointer">
                                    <Plus className="h-4 w-4" />
                                </div>
                            </CollaborationInvitationDlg>
                        </div> : <div><Loader className="h-4 w-4 animate-spin" /></div>
                    }
                </div>
                <Separator orientation="vertical" /> */}
                <Button variant="ghost" size="icon" onClick={() => handleSave()}><Save className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleSave(true)}><CircleArrowUp className="h-5 w-5" /></Button>
                <Separator orientation="vertical" />
                <Button variant="ghost" size="icon">
                    <MessageSquareText className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon">
                    {
                        fullScreen ? <Minimize2 className="h-5 w-5" onClick={toggleFullscreen} /> : <FullscreenIcon className="h-5 w-5" onClick={toggleFullscreen} />
                    }
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger><Button variant="ghost" size="icon"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[300px]">
                        <DropdownMenuLabel>
                            <RadioGroup className="flex flex-row justify-center">
                                <div>
                                    <RadioGroupItem value="1" id="font1" className="peer sr-only" />
                                    <Label
                                        className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                        htmlFor="font1">
                                        Font1
                                    </Label>
                                </div>
                                <div>
                                    <RadioGroupItem value="2" id="font2" className="peer sr-only" />
                                    <Label
                                        className="flex flex-col cursor-pointer items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                        htmlFor="font2">
                                        Font2
                                    </Label>
                                </div>
                                <div>
                                    <RadioGroupItem value="3" id="font3" className="peer sr-only" />
                                    <Label
                                        className="flex flex-col cursor-pointer items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                        htmlFor="font3">
                                        Font3
                                    </Label>
                                </div>
                            </RadioGroup>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem className="flex flex-row justify-between">
                                <div className="flex flex-row items-center gap-1">
                                    <ALargeSmall className="h-4 w-4" />
                                    <span>小号字体</span>
                                </div>
                                <Switch onClick={(e) => {
                                    e.stopPropagation()
                                }} />
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex flex-row justify-between">
                                <div className="flex flex-row items-center gap-1">
                                    <LockIcon className="h-4 w-4" />
                                    <span>Lock Page</span>
                                </div>
                                <Switch onClick={(e) => {
                                    e.stopPropagation()
                                }} />
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex flex-row justify-between">
                                <div className="flex flex-row items-center gap-1">
                                    <Contact2 className="h-4 w-4" />
                                    <span>显示目录</span>
                                </div>
                                <Switch onClick={(e) => {
                                    // e.preventDefault()
                                    e.stopPropagation()
                                }} />
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem onClick={handleSaveAsTemplate}>
                                <div className="flex flex-row items-center gap-1">
                                    <BookTemplate className="h-4 w-4" />
                                    <span>save as template</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                                toast.success("copy success")
                            }}>
                                <div className="flex flex-row items-center gap-1">
                                    <Link className="h-4 w-4" />
                                    <span>copy link</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <div className="flex flex-row items-center gap-1">
                                    <MoveDownRight className="h-4 w-4" />
                                    <span>move to</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <div className="flex flex-row items-center gap-1">
                                    <ArrowLeft className="h-4 w-4" />
                                    <span>rollback to last version</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <div className="flex flex-row items-center gap-1 text-red-500">
                                    <Trash2 className="h-4 w-4" />
                                    <span>move to trash</span>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem>
                                <div className="flex flex-row items-center gap-1">
                                    <Download className="h-4 w-4" />
                                    <span>import</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <div className="flex flex-row items-center gap-1">
                                        <Upload className="h-4 w-4" />
                                        <span>export</span>
                                    </div>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem>
                                            <div className="flex flex-row items-center gap-1">
                                                <FileIcon className="h-4 w-4" />
                                                <span>as word</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => printEditorContent(editor.current?.view as EditorView)}>
                                            <div className="flex flex-row items-center gap-1">
                                                <FileIcon className="h-4 w-4" />
                                                <span>as pdf</span>
                                            </div>
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
        <main className=" w-full flex flex-row justify-center">
            {
                page && <CollaborationEditor
                    pageInfo={page}
                    ref={editor}
                    // provider={provider}
                    className="h-[calc(100vh-80px)]  overflow-auto"
                    id={params.pageId as string}
                    user={userInfo}
                    token={params.pageId as string}
                    toc={true}
                    withTitle={true}
                    content={page.content ? JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">")) : undefined}
                />
            }
        </main>
    </div>)
}