import { Editor } from "@tiptap/core";
import React, { useCallback, useMemo } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import { Enable, Resizable as ReactResizable, ResizeCallback, HandleStyles, HandleComponent } from "re-resizable";

import { throttle } from "lodash";
import { cn } from "@kn/ui";

interface Props {
  width: number | string;
  height: number | string;
  aspectRatio?: number;
  minWidth?: number | string;
  editor: Editor;
  getPos: () => number | undefined;
  onResizeStop: (arg: { width: number; height: number }) => void;
  enable?: Enable | false,
  className?: string,
  hoverable?: boolean
  /** Node is selected — keeps the handles + outline visible */
  selected?: boolean
}

const CORNER_DIRS = ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const;

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
  hoverable = true,
  selected = false
}) => {
  const onResize = useMemo(
    () =>
      throttle(() => {
        const { view, state } = editor;

        const tr = editor.state.tr;
        const $pos = state.doc.resolve(getPos() || 0);
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

  // Visible, selection-aware corner handles (small dots). The grab area is the
  // re-resizable wrapper; the dot is centered inside it.
  const { handleStyles, handleComponent } = useMemo(() => {
    if (!hoverable) {
      return { handleStyles: undefined as HandleStyles | undefined, handleComponent: undefined as HandleComponent | undefined };
    }
    const center: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    };
    const dot = (
      <span
        className={cn(
          "block w-2.5 h-2.5 rounded-full border-2 border-background bg-primary shadow-sm",
          "transition-opacity duration-150",
          selected ? "opacity-100" : "opacity-0 group-hover/resizable:opacity-100"
        )}
      />
    );
    const styles: HandleStyles = {};
    const comps: HandleComponent = {};
    CORNER_DIRS.forEach(dir => {
      styles[dir] = center;
      comps[dir] = dot;
    });
    return { handleStyles: styles, handleComponent: comps };
  }, [hoverable, selected]);

  return (
    <ReactResizable
      className={cn(
        "group/resizable relative rounded-sm p-0.3 transition-[outline] duration-150",
        selected ? "outline outline-2 outline-primary outline-offset-2" : "outline-none",
        hoverable && !selected ? "hover:outline hover:outline-2 hover:outline-primary/40 hover:outline-offset-2" : "",
        className
      )}
      style={{
        maxWidth: "100%",
      }}
      size={{
        width,
        height,
      }}
      enable={enable}
      handleStyles={handleStyles}
      handleComponent={handleComponent}
      onResize={onResize as ResizeCallback}
      onResizeStop={resizeStop}
      {...(aspectRatio
        ? {
          lockAspectRatio:
            typeof aspectRatio === "number"
              ? Number(aspectRatio.toFixed(2))
              : aspectRatio
        }
        : {})}
      {...(minWidth ? { minWidth } : {})}>
      {children}
    </ReactResizable>
  );
};
