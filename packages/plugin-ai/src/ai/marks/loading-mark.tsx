import { Mark, MarkViewContent, ReactMarkViewRenderer } from "@kn/editor";
import React from "react";

/**
 * Extend editor commands with loading mark commands
 */


declare module "@kn/editor" {
  interface Commands<ReturnType> {
    loadingMark: {
      setLoadingMark: () => ReturnType;
      unsetLoadingMark: () => ReturnType;
    }
  }
}

/**
 * Loading Mark View Component
 * Displays content wrapped in a loading indicator border
 */
const LoadingMarkView: React.FC = () => {
  return <div className="border">
    <MarkViewContent />
  </div>
}

/**
 * Loading Mark Extension
 * Provides a mark for indicating loading/generating content
 * Currently experimental and may not be actively used
 */


export const LoadingMark = Mark.create({
  name: "loadingMark",
  addMarkView() {
    return ReactMarkViewRenderer(LoadingMarkView)
  },
  addCommands() {
    return {
      setLoadingMark: () => ({ commands }) => {
        return commands.setMark(this.name)
      },
      unsetLoadingMark: () => ({ commands }) => {
        return commands.unsetMark(this.name)
      }
    }
  }
});