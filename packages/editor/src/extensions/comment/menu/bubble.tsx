import { BubbleMenu, BubbleMenuProps } from "@editor/components";
import { Editor, findParentNode, isMarkActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useState } from "react";
import Comments from "../comment";
import { Node } from "@tiptap/pm/model";
import { Avatar, IconButton, Separator, Textarea } from "@kn/ui";
import { CheckIcon, HeartIcon, MoreHorizontalIcon, ReplyIcon, Trash2, XIcon } from "@kn/icon";
import { useAttributes } from "@editor/hooks";


const CommentItem = () => {

    const [editing, setEditing] = useState(false)

    return <div className=" space-y-1">
        <div className="p-1 flex items-center gap-2">
            <Avatar className="h-9 w-9">
                <img src="https://avatars.githubusercontent.com/u/16860528" />
            </Avatar>
            <div className=" relative w-full">
                <div className=" font-medium">Admin</div>
                <div className=" italic text-gray-400 text-xs">2025/03/25</div>
                <div className=" absolute right-0 top-0">
                    <IconButton icon={<MoreHorizontalIcon className="h-4 w-4" />} />
                </div>
            </div>
        </div>
        <div className="p-1">
            Meet Decoroom,
            where innovation meets inspiration in the realm of virtual interior design.
            Our brand identity
            reflects the essence of creating personalized and enchanting spaces that resonate with individual tastes and lifestyles.
        </div>
        {
            editing ? <div className=" space-y-1">
                <Textarea spellCheck={false} />
                <div className="flex gap-1 justify-end w-full">
                    <IconButton className=" h-5 w-5" icon={<CheckIcon className="h-4 w-4" />} onClick={() => setEditing(false)} />
                    <IconButton className=" h-5 w-5" icon={<XIcon className="h-4 w-4" />} onClick={() => setEditing(false)} />
                </div>
            </div> :
                <div className="flex items-center gap-1">
                    <IconButton
                        icon={<ReplyIcon className="h-4 w-4" />}
                        onClick={() => {
                            setEditing(true)
                        }}
                    />
                    <IconButton icon={<Trash2 className="h-4 w-4" />} />
                    <IconButton icon={<HeartIcon className="h-4 w-4" />} />
                </div>
        }
        <Separator orientation="horizontal" />
    </div>
}

export const CommentBubbleView: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props;
    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(() => {
        return isMarkActive(editor.state, Comments.name)
    }, [editor]);


    const threadId = useAttributes(editor, 'threadId') as string

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
        <div className="w-[250px]">
            <div className="flex justify-between items-center">
                <div className=" text-md h-[30px] p-1">Comments</div>
                <div className=" flex items-center gap-1">
                    <IconButton icon={<CheckIcon className="h-4 w-4" />} onClick={() => {
                        editor.commands.removeSpecificComment(threadId, "123123");
                    }} />
                    <IconButton icon={<Trash2 className="h-4 w-4" />} onClick={() => {
                        editor.commands.removeSpecificComment(threadId, "123123");
                    }} />
                </div>
            </div>
            <Separator orientation="horizontal" />
            <CommentItem />
        </div>
    </BubbleMenu>
}