import { Resizable } from "../../components";
import { cn } from "@kn/ui";
import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import React, { useCallback } from "react";

export const ColumnView: React.FC<NodeViewProps> = (props) => {

    const { width } = props.node.attrs
    const { editor, getPos, updateAttributes } = props

    const onResize = useCallback((size: any) => {
        updateAttributes({ width: size.width });
    },
        [updateAttributes]
    );

    return <NodeViewWrapper className={
        cn("prose-p:m-1 w-full ",
            editor.isEditable ? "outline rounded-sm" : "")
    }>
        {/* <Resizable
            className={cn("rounded-sm transition-all duration-75 w-full", editor.isEditable ? " outline" : " hover:outline")}
            height="100%"
            width={width || '100%'}
            editor={editor}
            getPos={getPos}
            minWidth={"0px"}
            hoverable={false}
            enable={editor.isEditable ? {
                top: false,
                bottom: false,
                bottomLeft: false,
                bottomRight: false,
                topLeft: false,
                topRight: false,
                left: true,
                right: true
            } : false}
            onResizeStop={onResize}
        > */}
        <NodeViewContent className="h-full w-auto" />
        {/* </Resizable> */}
    </NodeViewWrapper>
}