import React, { forwardRef } from "react";
import { cn } from "@kn/ui";

export interface StyledEditorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * When true the editor column fills the available width instead of the
   * default 900px reading column (used by full-width editors such as tables).
   */
  $fullWidth?: boolean;
}

/**
 * Root wrapper for editor content. This used to be a styled-components
 * `styled.div`; it is now a plain element and its styles live in
 * `editor.css` under the `.kn-editor` scope.
 */
export const StyledEditor = forwardRef<HTMLDivElement, StyledEditorProps>(
  ({ $fullWidth, className, style, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "kn-editor prose dark:prose-invert prose-img:m-0 max-w-none prose-table:my-0",
          className
        )}
        style={{ maxWidth: $fullWidth ? "100%" : "900px", ...style }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

StyledEditor.displayName = "StyledEditor";
