import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import React from "react";
import {
    ResizablePanelGroup,
} from "@kn/ui"


export const resizableColumnsView: React.FC = () => {
    return <NodeViewWrapper>
        <ResizablePanelGroup direction="horizontal">
            <NodeViewContent />
        </ResizablePanelGroup>
    </NodeViewWrapper>
}