import { APIS } from "../../../api";
import { Button, useIsMobile, Sheet, SheetContent, SheetTrigger, SheetTitle, Separator } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@kn/ui";
import { Skeleton } from "@kn/ui";
import { EditorRender, findNodeByBlockId } from "@kn/editor";
import { event, ON_FAVORITE_CHANGE } from "../../../event";
import { useLocation } from "@kn/common";
import { useNavigator, useApi, useMobilePageHeader } from "@kn/core";
import { Editor } from "@kn/editor";
import { useToggle } from "@kn/core";
import { Edit, MessageCircleCode, MoreHorizontal, Share, Star, List } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { useParams } from "@kn/common";
import { toast } from "@kn/ui";
import { smoothScrollIntoViewIfNeeded } from '@kn/common';
import { PageBreadcrumb } from '../../../components/PageBreadcrumb';
import { CollaborationInvitationDlg } from '../../components/CollaborationInvitationDlg';

export const PageViewer: React.FC = () => {

    const isMobile = useIsMobile()
    const [tocOpen, setTocOpen] = useState(false)
    const [page, setPage] = useState<any>()
    const params = useParams()
    const [editor, setEditor] = useState<Editor | null>()
    const { search } = useLocation(); // 获取查询字符串
    const queryParams = new URLSearchParams(search); // 解析查询参数
    const blockId = queryParams.get('blockId'); //
    const navigator = useNavigator()
    const [loading, { toggle }] = useToggle(false)
    const { setHeaderInfo, clearHeaderInfo } = useMobilePageHeader()


    useEffect(() => {
        toggle()
        useApi(APIS.GET_PAGE_CONTENT, { id: params.pageId }).then((res) => {
            // If the page is a draft, redirect to edit mode directly
            if (res.data?.isDraft) {
                navigator.go({
                    to: `/space-detail/${params.id}/page/edit/${params.pageId}`,
                    options: { replace: true }
                })
                return
            }
            setPage(res.data)
        }).finally(() => {
            setTimeout(() => {
                toggle()
            }, 500);
        })
        return () => {
            setPage(null)
            editor?.destroy?.()
            clearHeaderInfo() // Clear header info when unmounting
        }
    }, [params.pageId])

    useEffect(() => {
        if (blockId && editor && page) {
            const res = findNodeByBlockId(editor.state, blockId)
            console.log('res', res);

            if (res) {
                const dom = editor.view.nodeDOM(res.pos) as HTMLElement
                console.log('dom', dom);
                if (dom) {
                    smoothScrollIntoViewIfNeeded(dom, { scrollMode: 'if-needed' })
                }
            }
        }

    }, [blockId, editor, page])

    const goToEditor = () => {
        navigator.go({
            to: `/space-detail/${params.id}/page/edit/${params.pageId}`
        })
    }

    const handleAddFavorite = () => {
        useApi(APIS.ADD_FAVORITE_PAGE, { id: params.pageId }).then(() => {
            toast.success("收藏成功")
            setPage((page: any) => ({ ...page, favorite: true }))
            event.emit(ON_FAVORITE_CHANGE)
        })
    }

    const handleRemoveFavorite = () => {
        useApi(APIS.REMOVE_FAVORITE, { id: params.pageId }).then(() => {
            setPage((page: any) => ({ ...page, favorite: false }))
            event.emit(ON_FAVORITE_CHANGE)
        })
    }

    const [shareDialogOpen, setShareDialogOpen] = useState(false)

    // Set mobile header info when page is loaded
    useEffect(() => {
        if (page && isMobile) {
            setHeaderInfo({
                title: page.title,
                icon: "😘", // TODO: Get actual page icon
                actions: (
                    <>
                        <Button variant="ghost" size="icon" onClick={goToEditor}>
                            <Edit className="h-5 w-5" />
                        </Button>
                        <Sheet open={tocOpen} onOpenChange={setTocOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <List className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[280px] p-0">
                                <SheetTitle className="sr-only">Table of Contents</SheetTitle>
                                <div id="mobile-toc-container-viewer" className="h-full" />
                            </SheetContent>
                        </Sheet>
                        <CollaborationInvitationDlg
                            pageTitle={page?.title}
                            open={shareDialogOpen}
                            onOpenChange={setShareDialogOpen}
                        >
                            <span /> {/* Placeholder - trigger is the DropdownMenuItem below */}
                        </CollaborationInvitationDlg>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[200px]">
                                <DropdownMenuItem onClick={() => setShareDialogOpen(true)}>
                                    <div className="flex items-center gap-2">
                                        <Share className="h-4 w-4" />
                                        <span>Share</span>
                                    </div>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                    page.favorite ? handleRemoveFavorite() : handleAddFavorite()
                                }}>
                                    {page.favorite ? 'Remove from favorites' : 'Add to favorites'}
                                </DropdownMenuItem>
                                <DropdownMenuItem>Save as template</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )
            })
        } else if (!isMobile) {
            clearHeaderInfo()
        }
    }, [page, isMobile, tocOpen, shareDialogOpen])

    return loading ? <div className="w-full h-full">
        {/* Only show skeleton header on desktop */}
        {!isMobile && (
            <header className="h-11 w-full flex flex-row justify-between px-1 border-b">
                <div className="flex flex-row items-center gap-2 px-1 text-sm">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-5 w-48" />
                </div>
                <div className="flex flex-row items-center gap-1 px-1">
                    <Skeleton className="h-8 w-10" />
                    <Separator orientation="vertical" />
                    <Skeleton className="h-8 w-10" />
                    <Skeleton className="h-8 w-10" />
                    <Skeleton className="h-8 w-10" />
                    <Skeleton className="h-8 w-10" />
                </div>
            </header>
        )}
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
    </div> : (page && <div className="w-full h-full">
        {/* Only show header on desktop - mobile uses the app header */}
        {!isMobile && (
            <header className="h-11 w-full flex flex-row justify-between px-1 border-b relative z-50">
                <div className="flex flex-row items-center gap-2 px-1 text-sm flex-1 min-w-0 overflow-hidden">
                    <PageBreadcrumb
                        currentPageId={params.pageId!}
                        pageTree={page.parents} /* Will be passed from parent */
                        spaceId={params.id!}
                        currentTitle={page?.title}
                    />
                </div>
                <div className="flex flex-row items-center gap-1 px-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={goToEditor}><Edit className="h-5 w-5" /></Button>
                    <Separator orientation="vertical" />
                    <CollaborationInvitationDlg pageTitle={page?.title}>
                        <Button variant="ghost" size="icon"><Share className="h-5 w-5" /></Button>
                    </CollaborationInvitationDlg>
                    <Button variant="ghost" size="icon" onClick={() => {
                        page.favorite ? handleRemoveFavorite() : handleAddFavorite()
                    }}>
                        {
                            page.favorite ? <Star
                                fill="#F59E0B"
                                className="h-5 w-5 text-amber-500" /> : <Star className="h-5 w-5" />
                        }
                    </Button>
                    <Button variant="ghost" size="icon"><MessageCircleCode className="h-5 w-5" /></Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[200px]">
                            <DropdownMenuItem>Save as template</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>
        )}
        <main className={isMobile ? "w-full h-[calc(100%-56px)]" : "w-full h-[calc(100%-44px)]"}>
            <EditorRender
                ref={(ed) => setEditor(ed)}
                content={page.content ? JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">")) : undefined}
                className="h-full"
                id={params.pageId as string}
                isEditable={false}
                isColl={false}
                pageInfo={page}
                toolbar={false}
                toc={!isMobile}
                width={isMobile ? "w-full" : "w-[calc(100vw-350px)]"}
            />
        </main>
    </div>)
}