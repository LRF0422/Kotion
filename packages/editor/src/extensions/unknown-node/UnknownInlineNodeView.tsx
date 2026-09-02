import { useTranslation } from "@kn/common";
import { Puzzle } from "@kn/icon";
import { cn } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";
import { formatPluginName } from "./UnknowNodeView";

export const UnknownInlineNodeView: React.FC<NodeViewProps> = (props) => {
    const { t } = useTranslation();
    const nodeType = String(props.node.attrs.nodeType || "Unknown");
    const pluginName = formatPluginName(nodeType);
    const label = t("editor.missingPlugin.title", { plugin: pluginName });
    const description = t("editor.missingPlugin.description");

    return (
        <NodeViewWrapper
            as="span"
            role="note"
            aria-label={`${label}. ${description}`}
            title={`${label} — ${description}`}
            contentEditable={false}
            className={cn(
                "not-prose mx-0.5 inline-flex max-w-52 select-none items-center gap-1 rounded border border-border/60 bg-muted/70 px-1.5 py-0.5 align-middle text-xs leading-5 text-muted-foreground",
                "[&.ProseMirror-selectednode]:border-ring/50 [&.ProseMirror-selectednode]:bg-accent [&.ProseMirror-selectednode]:text-foreground [&.ProseMirror-selectednode]:outline-none",
                props.selected && "border-ring/50 bg-accent text-foreground"
            )}
        >
            <Puzzle aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
        </NodeViewWrapper>
    );
};
