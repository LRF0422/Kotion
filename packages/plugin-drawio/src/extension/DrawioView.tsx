import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import { ChartArea } from "@kn/icon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState } from "@kn/ui";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";


export const DrawioView: React.FC<NodeViewProps> = (props) => {

    const { extension, updateAttributes, node } = props
    const [open, setOpen] = useState(false)
    const iframe = useRef<HTMLIFrameElement>(null)
    const ref = useRef(null)

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

    const showDlg = () => {
        if (ref.current) {
            const root = createRoot(ref.current)
            root.render(<Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-none w-screen">
                    <DialogHeader>
                        <DialogTitle>Drawio</DialogTitle>
                        <DialogDescription></DialogDescription>
                    </DialogHeader>
                    <iframe ref={iframe} src={extension.options.drawIoLink} className="w-full h-[calc(100vh-50px)]" />
                </DialogContent>
            </Dialog>)
        }
    }

    return <NodeViewWrapper ref={ref}>
        {node.attrs.src ? <img src={node.attrs.src} onDoubleClick={() => {
            setOpen(true)
            showDlg()
        }} /> :
            <EmptyState
                title="No Data"
                description=""
                icons={[ChartArea]}
                action={{
                    label: "Create Drawio Diagram",
                    onClick: () => {
                        setOpen(true)
                        showDlg()
                    }
                }}
            />}
    </NodeViewWrapper>
}