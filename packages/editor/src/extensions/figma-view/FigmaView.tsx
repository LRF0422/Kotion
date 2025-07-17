import { Button } from "@kn/ui";
import { Input } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { useActive } from "../../hooks";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { useSafeState } from "ahooks";
import { Edit, RefreshCw, Trash2 } from "@kn/icon";
import React, { useRef } from "react";


export const FigmaViewComponent: React.FC<NodeViewProps> = (props) => {

    const [url, setUrl] = useSafeState<string>()
    const ref = useRef<any>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const hover = useActive(props.editor, "figmaView")

    const handleClick = () => {
        props.updateAttributes({
            url
        })
    }

    const handleReload = () => {
        if (iframeRef.current) {
            iframeRef.current.contentWindow?.location.reload()
        }
    }

    return <NodeViewWrapper className="leading-normal" ref={ref}>
        <Popover open={hover}>
            <PopoverTrigger className="w-full border rounded-md shadow-sm">
                {
                    props.node.attrs.url ? <div className=" bg-white p-4 relative">
                        <div className="w-full h-[600px]">
                            <iframe className="rounded-sm" ref={iframeRef} allowFullScreen src={`https://www.figma.com/embed?embed_host=knowledge&url=${encodeURIComponent(
                                props.node.attrs.url
                            )}`} />
                        </div>
                    </div> :
                        <div className=" bg-white rounded-sm shadow-md p-4 w-full">
                            <div className="flex flex-col gap-2">
                                <div>Setup a figma url</div>
                                <div className="flex flex-row gap-3" id="input">
                                    <Input onChange={(e) => setUrl(e.target.value)} />
                                    <Button onClick={handleClick}>Confirm</Button>
                                </div>
                            </div>
                        </div>
                }
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="p-0 w-auto" asChild>
                <div className="p-1 flex flex-row gap-1">
                    <Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => props.deleteNode()}><Trash2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm"><RefreshCw className="h-4 w-4" onClick={handleReload} /></Button>
                </div>
            </PopoverContent>
        </Popover>
    </NodeViewWrapper>
}