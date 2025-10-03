import { useAttributes } from "@editor/hooks";
import { EraserIcon } from "@kn/icon";
import { IconButton, cn } from "@kn/ui";
import { getAttributes, NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import React, { useEffect, useRef } from "react";

export const ColumnView: React.FC<NodeViewProps> = (props) => {

    const { editor, getPos } = props

    return <NodeViewWrapper className={
        cn("prose-p:m-1 w-full relative p-1 ",
            editor.isEditable ? "outline rounded-sm" : " border-r h-full")
    }>
        {editor.isEditable && <IconButton
            onClick={() => {
                editor.commands.deleteRange({
                    from: getPos()! + 1,
                    to: getPos()! + props.node.nodeSize - 1
                })
            }}
            className="absolute z-auto top-0 right-0"
            icon={<EraserIcon className="h-4 w-4" />} />}
        <NodeViewContent className="h-full w-auto" />
    </NodeViewWrapper>
}