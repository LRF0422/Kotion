import { AnyExtension, Content, EditorContent, NodeViewContent, NodeViewProps, NodeViewWrapper, resolveExtensions, resolveExtesions, StyledEditor, useEditor, useEditorExtension } from "@kn/editor";
import React, { useContext, useEffect, useState } from "react";
import { useNavigator, useParams, useService, useToggle } from "@kn/core";
import { PageContext } from "@kn/editor";
import { AppContext, event } from "@kn/common";
import { Loader2, SquareArrowOutUpRight, SquareArrowUpRight } from "@kn/icon";


export const BlockReferenceView: React.FC<NodeViewProps> = (props) => {

    const [content, setContent] = useState<Content>(null)
    const [blockInfo, setBlockInfo] = useState<any>(null)
    const navigator = useNavigator()
    const [loading, { toggle }] = useToggle(false)
    const { blockId } = props.node.attrs
    // @ts-ignore
    const spaceService = useService("spaceService") as any

    useEffect(() => {
        toggle()
        spaceService && blockId && spaceService.getBlockInfo(blockId).then((res: any) => {
            if (res) {
                setBlockInfo(res)
                setContent(JSON.parse(res.content))
                toggle()
                console.log('content', res.content);
            }
            
        })
    }, [spaceService, blockId])

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


    return <NodeViewWrapper as="div" className=" border border-dashed rounded-sm relative" onClick={(e: any) => {
    }} >
        {
            content ? <StyledEditor className="px-0" style={{ padding: "5px" }}>
                <EditorContent editor={editor} />
            </StyledEditor> : "The block is not exist"
        }
        {
            blockInfo && <div className=" absolute right-0 top-0">
                From: { blockInfo?.spaceName }
            </div>
        }
    </NodeViewWrapper>
};