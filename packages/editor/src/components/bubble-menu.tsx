import {
  BubbleMenu as BuiltInTiptapBubbleMenu,
  BubbleMenuProps as BuiltInTiptapBubbleMenuProps
} from "@tiptap/react";
// 该 bubble-menu 经过改造后，在元素拖拽过程中不会消失
import { BubbleMenu as NodeBubbleMenu } from "./react-bubble-menu";
import { Editor } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import React, { useMemo } from "react";


const defaultTippyOptions: BuiltInTiptapBubbleMenuProps["tippyOptions"] = {
  maxWidth: document.body.clientWidth,
  duration: 200,
  animation: "shift-toward-subtle",
  moveTransition: "transform 0.2s ease-in-out",
  zIndex: 10,
  arrow: false,
  theme: "bubble-menu",
  showOnCreate: false,
  placement: "bottom"
};

export type BubbleMenuProps = BuiltInTiptapBubbleMenuProps & {
  shouldShow: (props: {
    editor: Editor;
    view: EditorView;
    state: EditorState;
    oldState?: EditorState;
    from: number;
    to: number;
  }) => boolean;
  forNode?: boolean;
} & { editor: Editor; children: any };

export const BubbleMenu: React.FC<BubbleMenuProps> = ({
  editor,
  tippyOptions,
  forNode,
  children,
  ...rest
}) => {
  const wrapTippyOptions = useMemo(() => {
    if (typeof tippyOptions === "object") {
      return {
        ...defaultTippyOptions,
        ...tippyOptions,
        theme: tippyOptions.theme,
        appendTo: () => editor.options.element
      };
    }

    return { ...defaultTippyOptions, appendTo: () => editor.options.element };
  }, [editor, tippyOptions]);

  if (forNode) {
    return (
      <NodeBubbleMenu
        editor={editor}
        className="bg-popover text-popover-foreground px-1 py-1 rounded-sm shadow-sm border"
        tippyOptions={wrapTippyOptions}
        {...rest}
        pluginKey={""}>
        {children}
      </NodeBubbleMenu>
    );
  }

  return (
    <>
      <BuiltInTiptapBubbleMenu
        className=" bg-popover text-popover-foreground px-1 py-1 rounded-sm shadow-sm border"
        editor={editor}
        tippyOptions={wrapTippyOptions}
        {...rest}>
        {children}
      </BuiltInTiptapBubbleMenu>
    </>
  );
};
