import { GO_TO_MARKETPLACE, event } from "@kn/common";
import { Unlink, Package, Puzzle, ShoppingBag } from "@kn/icon";
import { Button, Card, CardContent, EmptyState } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const UnknownNodeView: React.FC<NodeViewProps> = (props) => {
    const nodeType = props.node.attrs.nodeType || 'Unknown';

    return <NodeViewWrapper className="w-full flex items-center justify-center py-12">
        <EmptyState
            className="w-full max-w-none"
            title={`Plugin Not Available: "${nodeType}"`}
            description={`The "${nodeType}" plugin is not installed or enabled in your editor.\nInstall it from the marketplace to view and edit this content.`}
            icons={[Package, Puzzle, ShoppingBag]}
            action={{
                label: 'Browse Marketplace',
                onClick: () => {
                    event.emit(GO_TO_MARKETPLACE)
                }
            }}
        />
    </NodeViewWrapper>
}