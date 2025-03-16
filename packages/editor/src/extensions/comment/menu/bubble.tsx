import { BubbleMenu, BubbleMenuProps } from "@editor/components";
import { isNodeActivePro } from "@editor/utilities";
import { Editor, findParentNode, isMarkActive, isNodeActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback } from "react";
import Comments from "../comment";
import { Node } from "@tiptap/pm/model";
import { Button } from "@repo/ui";



export const CommentBubbleView: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props;
    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(() => {
        return isMarkActive(editor.state, Comments.name) && editor.isEditable
    }, [editor]);

    const unsetSetComment = () => {
        editor.commands.removeSpecificComment("123123", "123123");
    }

    const getReferenceClientRect = useCallback(() => {
        const { selection } = editor.state;
        const predicate = (node: Node) => node.type.name === Comments.name;
        const parent = findParentNode(predicate)(selection);

        if (parent) {
            const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
            return dom.getBoundingClientRect();
        }

        return posToDOMRect(editor.view, selection.from, selection.to);
    }, [editor]);

    return <BubbleMenu
        editor={editor}
        shouldShow={shouldShow}
        tippyOptions={{
            getReferenceClientRect,
            placement: "top"
        }}
    >
        <div className=" h-[80px]">123123</div>
        <Button onClick={unsetSetComment}>unset</Button>
    </BubbleMenu>
}