import React, { useContext, useEffect, useRef, useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger, ScrollArea, Separator } from "@kn/ui"
import { useClickAway, useDebounce, useKeyPress, useService, useToggle } from "@kn/core";
import { AnyExtension, computePosition, Content, createNodeFromContent, Editor, EditorContent, flip, getText, Node, PageContext, posToDOMRect, StyledEditor, useEditor, useEditorExtension } from "@kn/editor";
import { ArrowRightIcon } from "@kn/icon";

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

    // useClickAway(() => {
    //     props.onCancel()
    // }, ref)

    useKeyPress(["Esc"], () => {
        props.onCancel()
    })

    // @ts-ignore
    const spaceService = useService("spaceService") as any

    useEffect(() => {
        toggle()
        spaceService && spaceService.queryBlocks({ spaceId: pageInfo.spaceId, searchValue: value }).then((res: any) => {
            setBlocks(res.records)
            toggle()
        })
    }, [value, spaceService])

    useEffect(() => {
        if (ref.current) {
            editor.on("selectionUpdate", () => {
                const currentNode = editor.state.selection.$head.parent;
                if (currentNode) {
                    const text = getText(currentNode)
                    setSearchValue(text)
                }
                const domRect = posToDOMRect(editor.view, editor.state.selection.from, editor.state.selection.to)
                const virtualElement = {
                    getBoundingClientRect: () => domRect,
                    getClientRects: () => [domRect],
                }
                computePosition(virtualElement, ref.current as HTMLElement, {
                    placement: "bottom-start",
                    middleware: [flip()],
                }).then(({ x, y, strategy }) => {
                    (ref.current as HTMLElement).style.zIndex = '1000';
                    (ref.current as HTMLElement).style.position = strategy;
                    (ref.current as HTMLElement).style.left = `${x + 2}px`;
                    (ref.current as HTMLElement).style.top = `${y}px`;
                })
            })
        }
    }, [ref.current])

    const [extensions, _] = useEditorExtension()
    
    const innerEditor = useEditor({
        editable: false,
        extensions: extensions as AnyExtension[]
    })

    return <div className="w-[400px] z-50 p-2 bg-popover shadow-md rounded-lg relative border" ref={ref}>
        {/* <Input className="mb-2 h-7" onChange={(e) => setSearchValue(e.target.value)} icon={loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />} placeholder="请输入页面名称" /> */}
        <ScrollArea className="h-[300px] pr-3">
            {
                blocks.map((block, index) => {
                    return <HoverCard key={index} onOpenChange={(open) => {
                        if (open ) {
                            innerEditor.commands.setContent(
                                block.type === 'doc' ? (block.content ? JSON.parse(block.content) : {}) : { type: "doc", content: block.content ? [JSON.parse(block.content)] : [] } as Content
                            )
                        }
                    }}>
                        <HoverCardTrigger asChild>
                                <div key={block.id} className="rounded-sm hover:bg-muted p-1" onClick={() => {
                                editor.chain().deleteNode("paragraph").insertContent({
                                    type: "BlockReference",
                                    attrs: {
                                        blockId: block.id,
                                        spaceId: block.spaceId,
                                        pageId: block.pageId
                                    }
                                }).run()
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
                        </HoverCardTrigger>
                        <HoverCardContent side="right" className="w-[400px]" asChild>
                            <StyledEditor>
                                <EditorContent editor={innerEditor}/>
                            </StyledEditor>
                        </HoverCardContent>
                    </HoverCard>
                })
            }
        </ScrollArea>
    </div>
}