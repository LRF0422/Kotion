import { ResizablePanelGroup } from "@kn/ui";
import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const ColumnsView: React.FC<NodeViewProps> = (props) => {

    return <NodeViewWrapper>
        <NodeViewContent />
    </NodeViewWrapper>
}