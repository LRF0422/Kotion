import { Unlink } from "@kn/icon";
import { Button, Card, CardContent, EmptyState } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const UnknownNodeView: React.FC<NodeViewProps> = (props) => {
    return <NodeViewWrapper>
        <EmptyState
            className="w-full max-w-none"
            title={`Unknown Node Type : ${props.node.attrs.name}`}
            description="This node type is not supported by the editor."
            icons={[Unlink]}
            action={{
                label: 'Get From Marketplace',
                onClick: () => {
                }
            }}
        />
    </NodeViewWrapper>
}