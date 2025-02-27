import { Editor } from "@tiptap/core";
import React, { useCallback, useMemo } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import { Enable, Resizable as ReactResizable, ResizeCallback } from "re-resizable";

import { throttle } from "lodash";
import { cn } from "@repo/ui";

interface Props {
  width: number | string;
  height: number | string;
  aspectRatio?: number;
  minWidth?: number | string;
  editor: Editor;
  getPos: () => number;
  onResizeStop: (arg: { width: number; height: number }) => void;
  enable?: Enable | false,
  className?: string,
  hoverable?: boolean
}

export const Resizable: React.FC<React.PropsWithChildren<Props>> = ({
  editor,
  width,
  height,
  aspectRatio,
  minWidth,
  getPos,
  onResizeStop,
  enable,
  children,
  className,
  hoverable = true
}) => {
  const onResize = useMemo(
    () =>
      throttle(() => {
        const { view, state } = editor;

        const tr = editor.state.tr;
        const $pos = state.doc.resolve(getPos());
        tr.setSelection(NodeSelection.near($pos));
        tr.setMeta("addToHistory", false);
        view.dispatch(tr);
      }, 200),
    [editor, getPos]
  );

  const resizeStop = useCallback<ResizeCallback>(
    (_, __, element) => {
      const width = parseInt(element.style.width);
      const height = parseInt(element.style.height);
      onResizeStop({ width, height });
    },
    [onResizeStop]
  );

  return (
    <ReactResizable
      className={cn(" rounded-sm hover:outline-gray-400 p-0.3", className, hoverable ? "hover:outline-dashed" : "")}
      size={{
        width,
        height,
      }}
      enable={enable}
      onResize={onResize as ResizeCallback}
      onResizeStop={resizeStop}
      {...(aspectRatio
        ? {
          lockAspectRatio:
            typeof aspectRatio === "number"
              ? Number(aspectRatio.toFixed(1))
              : aspectRatio
        }
        : {})}
      {...(minWidth ? { minWidth } : {})}>
      {children}
    </ReactResizable>
  );
};
