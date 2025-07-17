import { ResizablePanel } from "@kn/ui";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const ResizableColumnView: React.FC = () => {
    return <NodeViewWrapper>
        <ResizablePanel>
            <NodeViewContent />
        </ResizablePanel>
    </NodeViewWrapper>
}