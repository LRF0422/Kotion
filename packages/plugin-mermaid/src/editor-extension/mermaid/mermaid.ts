import React from "react";
import { PMNode as Node, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, withNodeViewErrorBoundary } from "@kn/editor";

const LazyMermaidView = React.lazy(async () => {
    const module = await import("./MermaidView");
    return { default: module.MermaidView };
});

const MermaidNodeView: React.FC<NodeViewProps> = (props) => React.createElement(
    React.Suspense,
    {
        fallback: React.createElement(NodeViewWrapper, {
            className: "my-2 min-h-40 rounded-md border bg-muted/20",
        }),
    },
    React.createElement(LazyMermaidView, props),
)

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        mermaid: {
            insertMermaid: (code?: string) => ReturnType;
        };
    }
}

export const Mermaid = Node.create({
    name: "mermaid",
    group: "block",
    renderHTML() {
        return ["div", { class: "node-mermaid" }, 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(
            withNodeViewErrorBoundary(MermaidNodeView),
            { stopEvent: () => true }
        )
    },

    addAttributes() {
        return {
            data: {
                default: null
            }
        }
    },

    addCommands() {
        return {
            insertMermaid: (code) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        data: code
                    }
                })
            }
        }
    }
})
