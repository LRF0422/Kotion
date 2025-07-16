import { ToC } from "../../editor";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const PageContentView: React.FC<NodeViewProps> = (props) => {

    console.log('init');

    return <NodeViewWrapper>
        <ToC editor={props.editor} className=" bg-muted rounded-sm" />
    </NodeViewWrapper>
}