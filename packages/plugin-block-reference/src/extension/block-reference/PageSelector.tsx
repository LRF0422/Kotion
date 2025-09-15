import React, { useContext, useEffect, useRef, useState } from "react";
import { Button, IconButton, Input, ScrollArea } from "@kn/ui"
import { useClickAway, useDebounce, useService } from "@kn/core";
import { Editor, PageContext } from "@kn/editor";
import { SearchIcon, X } from "@kn/icon";

export const PageSelector: React.FC<{ onCancel: () => void, editor: Editor }> = (props) => {

    const [pages, setPages] = useState<any[]>([])
    const [searchValue, setSearchValue] = useState<any>()
    const ref = useRef<HTMLDivElement>(null)
    const pageInfo = useContext(PageContext)
    const editor = props.editor
    const value = useDebounce(searchValue, {
        wait: 500,
    })

    useClickAway(() => {
        props.onCancel()
    }, ref)

    // @ts-ignore
    const spaceService = useService("spaceService") as any

    useEffect(() => {
        spaceService.queryPage({ spaceId: pageInfo.spaceId, searchValue }).then((res: any) => {
            console.log('res', res);
            setPages(res.records)
        })
    }, [value])

    return <div className="w-[300px] z-50 p-1 bg-popover shadow-md rounded-sm relative" ref={ref}>
        <Input onChange={(e) => setSearchValue(e.target.value)} icon={<SearchIcon className="h-4 w-4" />} placeholder="请输入页面名称" />
        <ScrollArea className="h-[300px]">
            {
                pages.map((page) => {
                    return <div key={page.id} className="rounded-sm hover:bg-muted cursor-pointer flex items-center gap-1 p-1" onClick={() => {
                        editor.commands.insertContent({
                            type: "blockReference",
                            attrs: {
                                pageId: page.id,
                                type: "LINK"
                            }
                        })
                        props.onCancel()
                    }}>
                        <div> {page.icon && page.icon.icon}</div>
                        <div> {page.title}</div>
                    </div>
                })
            }
        </ScrollArea>
        <IconButton className=" absolute right-1 top-1" icon={<X className="h-4 w-4" />} onClick={props.onCancel} />
    </div>
}