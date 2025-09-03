import { GO_TO_MARKETPLACE, event } from "@kn/common";
import { Unlink } from "@kn/icon";
import { Button, Card, CardContent, EmptyState } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const UnknownNodeView: React.FC<NodeViewProps> = (props) => {

    return <NodeViewWrapper className="w-full h-[400px]">
        <EmptyState
            className="w-full max-w-none border-solid border hover:bg-background rounded-sm"
            title={`Unknown Node Type : ${props.node.attrs.name}`}
            description="This node type is not supported by the editor."
            icons={[Unlink]}
            action={{
                label: 'Get From Marketplace',
                onClick: () => {
                    // event.emit(GO_TO_MARKETPLACE)
                }
            }}
        />
    </NodeViewWrapper>
}