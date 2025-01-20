import { APIS } from "../../../api";
import { Button } from "@repo/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@repo/ui";
import { Input } from "@repo/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
import { Separator } from "@repo/ui";
import { EditorRender } from "@repo/editor";
import { event, ON_FAVORITE_CHANGE } from "../../../event";
import { useApi } from "@repo/core";
import { useNavigator } from "@repo/core";
import { Editor } from "@repo/editor";
import { useToggle } from "@repo/core";
import { Edit, Loader, MessageCircleCode, MoreHorizontal, Plus, Share, Star } from "@repo/icon";
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "@repo/core";
import { toast } from "@repo/ui";

export const PageViewer: React.FC = () => {

    const [page, setPage] = useState<any>()
    const params = useParams()
    const editor = useRef<Editor>(null)
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
        <main className="w-full">
            <EditorRender
                ref={editor}
                content={JSON.parse(page.content)}
                className="h-[calc(100vh-60px)] overflow-auto"
                id={params.pageId as string}
                isEditable={false}
                isColl={false}
                pageInfo={page}
                toolbar
            />
        </main>
    </div>)
}