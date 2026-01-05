import { Editor, findParentNode, isActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback } from "react";
import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { deleteNodeInner } from "@editor/utilities";
import Details from "@tiptap/extension-details";
import { Toggle } from "@kn/ui";
import { Node } from "@tiptap/pm/model"
import { Trash2 } from "@kn/icon";


export const DetailsBubbleMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
        ({ editor }) => {
            return isActive(editor.state, Details.name)
        },
        [editor]
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

    const deleteMe = useCallback(() => {
        deleteNodeInner(editor, Details.name);
    }, [editor])

    return <BubbleMenu
        forNode
        getReferenceClientRect={getReferenceClientRect}
        editor={editor}
        shouldShow={shouldShow}
        options={{}}
    >
        <Toggle size="sm" pressed={false} onClick={deleteMe}>
            <Trash2 className="h-4 w-4" />
        </Toggle>
    </BubbleMenu>
}