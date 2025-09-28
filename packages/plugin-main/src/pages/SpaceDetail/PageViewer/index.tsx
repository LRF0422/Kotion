import { APIS } from "../../../api";
import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@kn/ui";
import { Input } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { Separator } from "@kn/ui";
import { EditorRender, findNodeByBlockId } from "@kn/editor";
import { event, ON_FAVORITE_CHANGE } from "../../../event";
import { useApi, useLocation } from "@kn/core";
import { useNavigator } from "@kn/core";
import { Editor } from "@kn/editor";
import { useToggle } from "@kn/core";
import { Edit, Loader, MessageCircleCode, MoreHorizontal, Plus, Share, Star } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { useParams } from "@kn/core";
import { toast } from "@kn/ui";
import { smoothScrollIntoViewIfNeeded } from '@kn/common';

export const PageViewer: React.FC = () => {

    const [page, setPage] = useState<any>()
    const params = useParams()
    const [editor, setEditor] = useState<Editor | null>()
    const { search } = useLocation(); // 获取查询字符串
    const queryParams = new URLSearchParams(search); // 解析查询参数
    const blockId = queryParams.get('blockId'); //
    const navigator = useNavigator()
    const [loading, { toggle }] = useToggle(false)


    useEffect(() => {
        toggle()
        useApi(APIS.GET_PAGE_CONTENT, { id: params.pageId }).then((res) => {
            setPage(res.data)
        }).finally(() => {
            setTimeout(() => {
                toggle()
            }, 500);
        })
        return () => {
            setPage(null)
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

    useEffect(() => {
        console.log('editor', editor);

    }, [editor])

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

    return loading ? <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-row gap-2 items-center">
            Loading...
            <Loader className=" animate-spin h-5 w-5" />
        </div>
    </div> : (page && <div className="w-full h-full">
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b ">
            <div className="flex flex-row items-center gap-2 px-1 text-sm">
                {"😘"}
                <span>{page?.title}</span>
            </div>
            <div className="flex flex-row items-center gap-1 px-1">
                <Button variant="ghost" size="icon" onClick={goToEditor}><Edit className="h-5 w-5" /></Button>
                <Separator orientation="vertical" />
                <Popover>
                    <PopoverTrigger>
                        <Button variant="ghost" size="icon"><Share className="h-5 w-5" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[500px] flex flex-col gap-2 text-sm" >
                        <h3>Share this document</h3>
                        <div className="flex w-full max-w-sm items-center space-x-2">
                            <Input className="h-7" type="email" placeholder="Email" />
                            <Button size="sm">Copy Link</Button>
                        </div>
                        <Separator />
                        <div className="flex flex-row items-center justify-between">
                            <h3>People with access</h3>
                            <Button variant="ghost" size="sm"><Plus className="h-4 w-4" /></Button>
                        </div>
                    </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon" onClick={() => {
                    page.favorite ? handleRemoveFavorite() : handleAddFavorite()
                }}>
                    {
                        page.favorite ? <Star
                            fill=""
                            className="h-5 w-5" /> : <Star className="h-5 w-5" />
                    }
                </Button>
                <Button variant="ghost" size="icon"><MessageCircleCode className="h-5 w-5" /></Button>
                <DropdownMenu>
                    <DropdownMenuTrigger><Button variant="ghost" size="icon"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[200px]">
                        <DropdownMenuItem>Save as template</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
        <main className="w-full flex flex-row justify-center">
            <EditorRender
                ref={(ed) => setEditor(ed)}
                content={page.content ? JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">")) : undefined}
                className="h-[calc(100vh-70px)] overflow-auto"
                id={params.pageId as string}
                isEditable={false}
                isColl={false}
                pageInfo={page}
                toolbar={false}
            />
        </main>
    </div>)
}