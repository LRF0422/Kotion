import { Check } from "@kn/icon";
import { cn } from "@kn/ui";
import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

/** Clickable inline checkbox rendered inside a list item's paragraph. */
export const CheckboxView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
    const checked = Boolean(node.attrs.checked);
    const editable = editor.isEditable;

    return (
        <NodeViewWrapper
            as="span"
            className="inline-flex align-middle"
            contentEditable={false}
        >
            <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                data-checked={checked}
                disabled={!editable}
                className={cn(
                    "mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border align-middle transition-colors",
                    checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/50 bg-background",
                    editable ? "cursor-pointer" : "cursor-default",
                )}
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                    if (!editable) return;
                    updateAttributes({ checked: !checked });
                }}
            >
                {checked && <Check className="h-3 w-3" strokeWidth={3} />}
            </button>
        </NodeViewWrapper>
    );
};
