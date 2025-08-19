import { ToC } from "../../editor";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const PageContentView: React.FC<NodeViewProps> = (props) => {

    const { editor } = props

    return <NodeViewWrapper>
        <ToC items={editor.storage.tableOfContents.content} editor={props.editor} className=" bg-muted rounded-sm" />
    </NodeViewWrapper>
}