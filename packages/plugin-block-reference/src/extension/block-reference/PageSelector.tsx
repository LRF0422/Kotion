import React, { useContext, useEffect, useState } from "react";
import { Button, IconButton } from "@kn/ui"
import { useService } from "@kn/core";
import { Editor, PageContext } from "@kn/editor";
import { X } from "@kn/icon";

export const PageSelector: React.FC<{ onCancel: () => void, editor: Editor }> = (props) => {
    
    const [pages, setPages] = useState<any[]>([])
    const pageInfo = useContext(PageContext)
    const editor = props.editor

    // @ts-ignore
    const spaceService = useService("spaceService") as any

    useEffect(() => {
        spaceService.queryPage({ spaceId: pageInfo.spaceId }).then((res: any) => {
            console.log('res', res);
            
            setPages(res.records)
        })
    }, [])

    return <div className="w-[300px] z-50 p-1 bg-popover shadow-md rounded-sm relative">
        {
            pages.map((page) => {
                return <div key={page.id} className=" rounded-sm hover:bg-muted cursor-pointer flex items-center gap-1 p-1" onClick={() => {
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
                    <div> { page.title }</div>
                </div>
            })
        }
        <IconButton className=" absolute right-1 top-1" icon={<X className="h-4 w-4" />} onClick={props.onCancel} />
    </div>
}