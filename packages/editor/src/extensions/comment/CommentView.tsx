import { MarkViewContent } from "@tiptap/react";
import React from "react";

export const CommentView: React.FC = () => {
    return <span className=" bg-muted/50 p-1 rounded-sm hover:bg-muted transition-colors">
        <MarkViewContent/>
    </span>
}