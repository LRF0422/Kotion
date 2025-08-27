import { Mark, MarkViewContent, ReactMarkViewRenderer, ReactNodeViewRenderer } from "@kn/editor";
import React from "react";


declare module "@kn/editor" {
  interface Commands<ReturnType> {
    loadingMark: {
      setLoadingMark: () => ReturnType;
      unsetLoadingMark: () => ReturnType;
    }
  }
}

const LoadingMarkView: React.FC = () => {
  return <div className=" border">
      <MarkViewContent/>
    </div>
}


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