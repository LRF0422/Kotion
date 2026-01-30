import { Editor, findParentNode, isNodeActive, posToDOMRect } from "@tiptap/core";
import { memo, useCallback } from "react";
import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { copyNode, deleteNodeInner } from "@editor/utilities";
import Details from "@tiptap/extension-details";
import { Separator, Toggle } from "@kn/ui";
import { Node } from "@tiptap/pm/model";
import { Copy, Trash2, ChevronDown, ChevronRight } from "@kn/icon";
import React from "react";

export const DetailsBubbleMenu: React.FC<{ editor: Editor }> = memo(({ editor }) => {
    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
        ({ editor }) => isNodeActive(editor.state, Details.name),
        []
    );

    const getReferenceClientRect = useCallback(() => {
        const { selection } = editor.state;
        const predicate = (node: Node) => node.type.name === Details.name;
        const parent = findParentNode(predicate)(selection);

        if (parent) {
            const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
            return dom.getBoundingClientRect();
        }

        return posToDOMRect(editor.view, selection.from, selection.to);
    }, [editor]);

    const copyMe = useCallback(() => {
        copyNode(editor, Details.name);
    }, [editor]);

    const deleteMe = useCallback(() => {
        deleteNodeInner(editor, Details.name);
    }, [editor]);

    return (
        <BubbleMenu
            forNode
            getReferenceClientRect={getReferenceClientRect}
            editor={editor}
            shouldShow={shouldShow}
            options={{}}
        >
            <div className="flex flex-row gap-1 items-center h-8">
                <Toggle
                    size="sm"
                    pressed={false}
                    onClick={copyMe}
                    aria-label="Copy details block"
                >
                    <Copy className="h-4 w-4" />
                </Toggle>
                <Separator orientation="vertical" className="h-6" />
                <Toggle
                    size="sm"
                    pressed={false}
                    onClick={deleteMe}
                    aria-label="Delete details block"
                >
                    <Trash2 className="h-4 w-4 text-red-500" />
                </Toggle>
            </div>
        </BubbleMenu>
    );
});