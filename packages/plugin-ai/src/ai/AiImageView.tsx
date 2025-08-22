import { Button } from "@kn/ui";
import { Label } from "@kn/ui";
import { Textarea } from "@kn/ui";
import { cn } from "@kn/ui";
import { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import { useToggle } from "ahooks";
import { ImageIcon, Loader2, Sparkles, Trash2 } from "@kn/icon";
import React from "react";
import { aiImageWriter } from "./utils";
import { toast } from "@kn/ui";


export const AiImageView: React.FC<NodeViewProps> = (props) => {

    const [loading, { toggle }] = useToggle(false)

    return <NodeViewWrapper className=" border p-4 rounded-sm flex flex-col gap-2 text-popover-foreground">

        <div>
            {props.editor.isEditable && <Label className="mb-2 font-bold flex gap-1 items-center"><ImageIcon className="h-4 w-4 mr-1" /> 预览</Label>}
            <img src={props.node.attrs.url} width="100%" className=" rounded-sm" />
        </div>
        {
            props.editor.isEditable && <div className="flex flex-col gap-2 ">
                <div>
                    <Label htmlFor="prompt" className="mb-2 font-bold flex gap-1 items-center"><Sparkles className="h-4 w-4" /> 提示语</Label>
                    <Textarea id="prompt" defaultValue={props.node.attrs.prompt} onChange={(e) => {
                        console.log('update', e);

                        props.updateAttributes({
                            ...props.node.attrs,
                            prompt: e.target.value
                        })
                    }} />
                </div>
                <div className="flex flex-row gap-2 items-center">
                    <Button onClick={() => {
                        toggle()
                        const promopt = props.node.attrs.prompt
                        aiImageWriter(promopt).then(res => {
                            if (res.error) {
                                toast.warning(res.error.message, {
                                    position: 'top-center'
                                })
                            } else {
                                const url = res.data[0].url
                                props.updateAttributes({
                                    ...props.node.attrs,
                                    url: url
                                })
                            }


                        }).finally(() => {
                            toggle()
                        })
                    }}>{
                            loading ? <Loader2 className={cn("h-4 w-4 mr-1 animate-spin")} /> :
                                <Sparkles className={cn("h-4 w-4 mr-1")} />
                        }
                        {loading ? "生成中..." : "生成"}
                    </Button>
                    <Button variant="destructive" onClick={props.deleteNode}><Trash2 className="h-4 w-4 mr-1" />删除</Button>
                </div>
            </div>
        }
    </NodeViewWrapper>
}