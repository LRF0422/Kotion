import {
  BubbleMenu as BuiltInTiptapBubbleMenu,
  BubbleMenuProps as BuiltInTiptapBubbleMenuProps
} from "@tiptap/react/menus";
// 该 bubble-menu 经过改造后，在元素拖拽过程中不会消失
import { BubbleMenu as NodeBubbleMenu } from "./react-bubble-menu";
import { Editor } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { cn } from "@kn/ui";
import React, { useMemo } from "react";


const defaultTippyOptions: BuiltInTiptapBubbleMenuProps["options"] = {
  placement: "bottom",
  strategy: "fixed"
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
  getReferenceClientRect?: () => DOMRect
} & { editor: Editor; children: any; className?: string };

export const BubbleMenu: React.FC<BubbleMenuProps> = ({
  editor,
  options,
  forNode,
  children,
  getReferenceClientRect,
  className,
  appendTo,
  ...rest
}) => {
  const wrapTippyOptions = useMemo(() => {
    if (typeof options === "object") {
      return {
        ...defaultTippyOptions,
        ...options,
        getReferenceClientRect: getReferenceClientRect,
        hide: false,
      };
    }

    return { ...defaultTippyOptions };
  }, [editor, options]);

  // Render menus at the document root so transformed editor ancestors cannot
  // trap them below body-level overlays such as margin cards.
  const defaultAppendTo = typeof document !== "undefined" ? document.body : undefined;
  const builtInAppendTo = appendTo ?? defaultAppendTo;
  // The custom menu is rendered by React and moved with appendChild rather than
  // createPortal. Moving it outside the React root breaks delegated onClick
  // handlers, so only move it when a caller explicitly provides a target.
  const nodeAppendTo = typeof appendTo === "function"
    ? (typeof document !== "undefined" ? appendTo() : undefined)
    : appendTo;

  // Notion 风格：圆角更柔和、阴影更轻盈有层次、边框淡、半透明毛玻璃背景
  const surfaceClass = cn(
    "flex items-center gap-0.5 p-1 z-[1000]",
    "bg-popover/95 text-popover-foreground backdrop-blur-md supports-[backdrop-filter]:bg-popover/80",
    "rounded-xl border border-border/60 shadow-lg ring-1 ring-black/5",
    className
  );

  if (forNode) {
    return (
      // @ts-ignore
      <NodeBubbleMenu
        className={surfaceClass}
        editor={editor}
        appendTo={nodeAppendTo}
        options={wrapTippyOptions}
        {...rest}>
        {children}
      </NodeBubbleMenu>
    );
  }

  return (
    <>
      <BuiltInTiptapBubbleMenu
        className={surfaceClass}
        editor={editor}
        appendTo={builtInAppendTo}
        options={wrapTippyOptions}
        {...rest}
        ref={(element) => {
          if (element) element.style.zIndex = "1000";
        }}>
        {children}
      </BuiltInTiptapBubbleMenu>
    </>
  );
};
