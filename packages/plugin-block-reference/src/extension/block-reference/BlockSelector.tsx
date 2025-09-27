import React, { useContext, useEffect, useRef, useState } from "react";
import { Button, IconButton, Input, ScrollArea, Separator } from "@kn/ui"
import { useClickAway, useDebounce, useService, useToggle } from "@kn/core";
import { createNodeFromContent, Editor, getText, Node, PageContext } from "@kn/editor";
import { ArrowRight, ArrowRightIcon, Loader2, SearchIcon, X } from "@kn/icon";

export const BlockSelector: React.FC<{ onCancel: () => void, editor: Editor }> = (props) => {

    const [blocks, setBlocks] = useState<any[]>([])
    const [searchValue, setSearchValue] = useState<any>()
    const ref = useRef<HTMLDivElement>(null)
    const pageInfo = useContext(PageContext)
    const editor = props.editor
    const [loading, { toggle }] = useToggle(false)
    const value = useDebounce(searchValue, {
        wait: 500,
    })

    useClickAway(() => {
        props.onCancel()
    }, ref)

    // @ts-ignore
    const spaceService = useService("spaceService") as any

    useEffect(() => {
        toggle()
       spaceService &&  spaceService.queryBlocks({ spaceId: pageInfo.spaceId, searchValue: value }).then((res: any) => {
           setBlocks(res.records)
           toggle()
        })
    }, [value, spaceService])

    return <div className="w-[400px] z-50 p-2 bg-popover shadow-md rounded-lg relative border" ref={ref}>
        <Input className="mb-2 h-7" onChange={(e) => setSearchValue(e.target.value)} icon={ loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />} placeholder="请输入页面名称" />
        <ScrollArea className="h-[300px] pr-3">
            {
                blocks.map((block) => {
                    return <div key={block.id} className="rounded-sm hover:bg-muted p-1" onClick={() => {
                        editor.commands.insertContent({
                            type: "BlockReference",
                            attrs: {
                                blockId: block.id
                            }
                        })
                        props.onCancel()
                    }}>
                        <div className="flex items-center gap-1 h-[30px]">
                            <div className=" hover:underline cursor-pointer">{block.spaceName}</div>
                            <ArrowRightIcon className="h-4 w-4" />
                            <div className="text-nowrap text-ellipsis overflow-hidden w-[200px] hover:underline cursor-pointer">{block.pageTitle}</div>
                            <Separator orientation="vertical" />
                            <div className="text-muted-foreground text-sm italic"> {block.type}</div>
                        </div>
                        <div className="text-nowrap text-ellipsis overflow-hidden w-[350px] text-muted-foreground text-sm italic">
                        {
                            block.content && getText(createNodeFromContent(JSON.parse(block.content), editor.schema) as Node)
                        }
                        </div>

                    </div>
                })
            }
        </ScrollArea>
    </div>
}