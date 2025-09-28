import { AnyExtension, Content, EditorContent, NodeViewProps, NodeViewWrapper, StyledEditor, useEditor, useEditorExtension } from "@kn/editor";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHover, useNavigator, useService, useToggle } from "@kn/core";
import { ArrowUpRight, RefreshCcw, Trash2 } from "@kn/icon";
import { cn, IconButton } from "@kn/ui";


export const BlockReferenceView: React.FC<NodeViewProps> = (props) => {

    const [content, setContent] = useState<Content>(null)
    const [blockInfo, setBlockInfo] = useState<any>(null)
    const navigator = useNavigator()
    const [loading, { toggle }] = useToggle(false)
    const { blockId, spaceId, pageId } = props.node.attrs
    const ref = useRef<any>()
    const hover = useHover(ref)
    const [flag, { toggle: toggleFlag }] = useToggle(false)
    // @ts-ignore
    const spaceService = useService("spaceService") as any

    useEffect(() => {
        if (spaceService && blockId) {
            toggle()
            spaceService.getBlockInfo(blockId).then((res: any) => {
                if (res) {
                    setBlockInfo(res)
                    setContent(JSON.parse(res.content))
                    toggle()
                }
            })
        }
    }, [spaceService, blockId, flag])

    const goToDetail = useCallback(() => {
        if (spaceId && pageId) {
            navigator.go({
                to: `/space-detail/${spaceId}/page/${pageId}?blockId=${blockId}`
            })
        }
    }, [blockId])

    const [extensions, _] = useEditorExtension('trailingNode')
    const editor = useEditor({
        editable: false,
        content: { type: "doc", content: [content] } as Content,
        extensions: extensions as AnyExtension[],
        editorProps: {
            attributes: {
                class: "magic-editor",
                spellcheck: "false",
                suppressContentEditableWarning: "false",
            }
        }
    }, [content])


    return <NodeViewWrapper as="div" ref={ref} className=" border border-dashed rounded-sm relative" onClick={(e: any) => {
    }} >
        {
            content ? <StyledEditor className="px-0" style={{ padding: "5px" }}>
                <EditorContent editor={editor} />
            </StyledEditor> : "The block is not exist"
        }
        {
            <div className={cn("absolute right-1 flex items-center gap-1 text-sm top-1 p-1 bg-muted/70 rounded-sm ", hover ? ' opacity-100 transition-opacity duration-500' : 'opacity-0 transition-opacity duration-500')}>
                <IconButton icon={<RefreshCcw className={cn("w-4 h-4", loading ? 'animate-spin' : '')} />} onClick={toggleFlag} />
                <IconButton icon={<ArrowUpRight className={cn("w-4 h-4")} />} onClick={goToDetail} />
                <IconButton icon={<Trash2 className={cn("w-4 h-4")} />} onClick={props.deleteNode} />
            </div>
        }
    </NodeViewWrapper>
};