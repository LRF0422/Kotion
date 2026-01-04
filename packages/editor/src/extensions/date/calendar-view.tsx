import { Calendar } from "@kn/ui";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import React from "react";


export const CalendarView: React.FC<NodeViewProps> = (props) => {

    return <NodeViewWrapper className="not-prose">
        <Calendar className="inline-block  border rounded-md" />
    </NodeViewWrapper>;
};