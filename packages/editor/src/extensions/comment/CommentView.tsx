import { MarkViewContent } from "@tiptap/react";
import React from "react";

/**
 * CommentView component for rendering comment marks in the editor
 * Provides visual indication of commented text with hover effects
 */
export const CommentView: React.FC = () => {
    return (
        <span className="bg-muted/50 p-1 rounded-sm hover:bg-muted transition-colors cursor-pointer">
            <MarkViewContent />
        </span>
    );
};