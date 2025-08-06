import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { isNodeActivePro } from "../../..//utilities";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import { Node } from "@tiptap/pm/model"
import React, { useCallback } from "react";
import { Figma } from "../figma";
import { Button } from "@kn/ui";

export const FigmaBubbleMenu: React.FC<{ editor: Editor }> = ({ editor }) => {


    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
        ({ editor }) => {
            return isNodeActivePro(editor.state, Figma.name)
        },
        [editor]
    );

    const getReferenceClientRect = useCallback(() => {
        const { selection } = editor.state;
        const predicate = (node: Node) => node.type.name === Figma.name;
        const parent = findParentNode(predicate)(selection);

        if (parent) {
            const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
            return dom.getBoundingClientRect();
        }

        return posToDOMRect(editor.view, selection.from, selection.to);
    }, [editor]);

    return <BubbleMenu
        forNode
        getReferenceClientRect={getReferenceClientRect}
        editor={editor}
        shouldShow={shouldShow}
        options={{}}
    >
        <Button size="sm" variant="secondary">123</Button>
    </BubbleMenu>
}