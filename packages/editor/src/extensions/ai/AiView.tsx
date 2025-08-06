import { Button } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import React from "react";
import { aiGeneration } from "./utils";
import { Textarea } from "@kn/ui";
import { useToggle } from "ahooks";
import { Label } from "@kn/ui";
import { Loader2, Sparkles, Trash2 } from "@kn/icon";
import { cn } from "@kn/ui";


export const AiView: React.FC<NodeViewProps> = (props) => {

    const [loading, { toggle }] = useToggle(false)

    return <NodeViewWrapper as="div" className=" relative flex flex-col w-full border border-dashed p-2 pt-9 rounded-sm text-popover-foreground">
        <div className=" absolute  right-0 top-0 border border-t-0 border-l border-r-0 border-b rounded-sm text-sm text-gray-500 p-1">
            此文本由AI生成
            {
                props.node.attrs.generateDate &&
                <span>
                    ，生成日期：
                    {props.node.attrs.generateDate}
                </span>
            }
        </div>
        <NodeViewContent className="w-full prose-p:mt-0 leading-1 min-h-[40px]" />
        {props.editor.isEditable && <div className="flex flex-col gap-2 items-start">
            <Label htmlFor="prompt" className="mb-2 font-bold flex gap-1 items-center"><Sparkles className="h-4 w-4" /> 提示语</Label>
            <Textarea id="prompt" className="h-[100px]" defaultValue={props.node.attrs.prompt} onChange={(e) => {
                props.updateAttributes({
                    ...props.node.attrs,
                    prompt: e.target.value
                })
            }} />
            <div className="flex flex-row gap-1 items-center">
                <Button onClick={() => {
                    toggle()
                    let buff = ""
                    props.editor.commands.deleteRange({
                        from: props.getPos()! + 1,
                        to: props.getPos()! + props.node.nodeSize - 1
                    })
                    aiGeneration(props.node.attrs.prompt, (res) => {
                        buff += res
                        props.editor.chain().focus().toggleLoadingDecoration(props.getPos()! + 1, buff).run()
                    }).then((result) => {
                        props.editor.chain().focus()
                            .insertContentAt(props.getPos()! + 1, result, {
                                applyInputRules: false,
                                applyPasteRules: false,
                                parseOptions: {
                                    preserveWhitespace: false
                                }
                            }).run();
                        props.editor.chain().removeLoadingDecoration().run()
                        toggle()
                        props.updateAttributes({
                            ...props.node.attrs,
                            generateDate: new Date().toUTCString()
                        })
                    })
                }}>{
                        loading ? <Loader2 className={cn("h-4 w-4 mr-1 animate-spin")} /> :
                            <Sparkles className={cn("h-4 w-4 mr-1")} />
                    }
                    {loading ? "生成中..." : "生成"}
                </Button>
                <Button variant="destructive" onClick={props.deleteNode}><Trash2 className="h-4 w-4 mr-1" />删除</Button>
            </div>
        </div>}
    </NodeViewWrapper>
}