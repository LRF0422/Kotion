import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, {  } from "react";
import { DnDProvider } from "./DndContext";
import { FlowViewCore } from "./FlowViewCore";


export const FlowView: React.FC<NodeViewProps> = (props) => {

    return <NodeViewWrapper className="w-full h-[500px] border rounded-sm relative">
        <ReactFlowProvider>
            <DnDProvider>
                <FlowViewCore {...props} />
            </DnDProvider>
        </ReactFlowProvider>
    </NodeViewWrapper>
}