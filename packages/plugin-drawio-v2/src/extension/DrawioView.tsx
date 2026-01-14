import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import { ChartArea, Edit, Trash2, Maximize2 } from "@kn/icon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, useTheme, Button, Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { isActive } from "@kn/editor";

export const DrawioView: React.FC<NodeViewProps> = (props) => {

    const { extension, updateAttributes, node } = props
    const [open, setOpen] = useState(false)
    const iframe = useRef<HTMLIFrameElement>(null)
    const { theme } = useTheme()
    const ref = useRef(null)
    const hover = isActive(props.editor.state, "drawioV2Extension")

    const receive = useCallback((event: any) => {
        console.log("receive", event);

        if (event.data.length == 0 || event.data.payload) {
            return null;
        }
        var msg = JSON.parse(event.data);
        switch (msg.event) {
            case "init":
                console.log('init', iframe);

                iframe.current?.contentWindow?.postMessage(
                    JSON.stringify({
                        action: "load",
                        xmlpng: node.attrs.src,
                    }),
                    "*"
                );
                break;
            case "save":
                iframe.current?.contentWindow?.postMessage(
                    JSON.stringify({
                        action: "export",
                        format: "xmlpng",
                        spinKey: "saving",
                    }),
                    "*"
                );
                break;
            case "export":
                updateAttributes({ src: msg.data });
                break;
            case "exit":
                window.removeEventListener("message", receive);
                setOpen(false)
                break;
        }
    }, [iframe.current])

    useEffect(() => {
        window.addEventListener("message", receive);
        return () => {
            window.removeEventListener("message", receive);
        };
    }, []);


    return <NodeViewWrapper ref={ref} className="w-full my-2">
        <Popover open={hover}>
            <PopoverTrigger className="w-full">
                {node.attrs.src ?
                    <div className="relative group w-full rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden bg-white">
                        <img
                            src={node.attrs.src}
                            alt="Drawio diagram"
                            className="w-full h-auto cursor-pointer transition-opacity duration-200 group-hover:opacity-95"
                            onDoubleClick={() => {
                                iframe.current?.contentWindow?.location.reload()
                                setOpen(true)
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                    </div>
                    :
                    <div className="rounded-lg border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors duration-200">
                        <EmptyState
                            className="py-8"
                            title="Create Diagram"
                            description="Double-click or use the button below to start creating your Drawio diagram"
                            icons={[ChartArea]}
                            action={{
                                label: "Create Drawio Diagram",
                                onClick: () => {
                                    iframe.current?.contentWindow?.location.reload()
                                    setOpen(true)
                                }
                            }}
                        />
                    </div>
                }
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="p-0 w-auto" asChild>
                <div className="p-1 flex flex-row gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            iframe.current?.contentWindow?.location.reload()
                            setOpen(true)
                        }}
                    >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => props.deleteNode()}
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            iframe.current?.contentWindow?.location.reload()
                            setOpen(true)
                        }}
                    >
                        <Maximize2 className="h-4 w-4 mr-1" />
                        Fullscreen
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-none w-[95vw] h-[95vh] p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle className="text-xl font-semibold">Drawio Diagram Editor</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">Create and edit your diagram. Press Ctrl+S (Cmd+S) to save.</DialogDescription>
                </DialogHeader>
                <iframe
                    ref={iframe}
                    src={extension.options.drawIoLink + (theme === 'light' ? '&ui=kennedy' : '&ui=dark')}
                    className="w-full h-[calc(95vh-100px)] border-none"
                />
            </DialogContent>
        </Dialog>
    </NodeViewWrapper>
}
