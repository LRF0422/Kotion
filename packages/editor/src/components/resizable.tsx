import { Editor } from "@tiptap/core";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { NodeSelection } from "@tiptap/pm/state";

import { cn } from "@kn/ui";

interface Props {
  width: number | string;
  height: number | string;
  aspectRatio?: number;
  minWidth?: number | string;
  editor: Editor;
  getPos: () => number | undefined;
  onResizeStop: (arg: { width: number; height: number }) => void;
  /**
   * @deprecated 交互已重设计为左右边缘拖柄,不再支持按方向配置;
   * 仅 `enable === false` 仍生效(完全禁用缩放)。
   */
  enable?: unknown;
  className?: string;
  hoverable?: boolean;
  /** Node is selected — keeps the handles + outline visible */
  selected?: boolean;
}

/** 最小宽度(px),minWidth 未提供或不可解析时使用 */
const DEFAULT_MIN_WIDTH = 48;
/** 拖拽位置距内容区最大宽度在该阈值(px)内时,吸附为 100% 宽度 */
const SNAP_THRESHOLD = 8;

interface DragSize {
  width: number;
  height: number;
  maxWidth: number;
}

const toPx = (value: number | string | undefined, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

/**
 * 图片缩放宽度的交互重设计:
 * - 左右边缘竖条拖柄(而非四角圆点),水平拖动、宽高比恒定;
 * - 拖拽期间通过本地 state 驱动尺寸(rAF 节流),不派发任何 ProseMirror 事务;
 * - 松手时一次性提交 width/height,撤销栈中只产生一条记录;
 * - 拖拽中显示实时尺寸徽标(px + 占内容区百分比),Escape 可取消并还原。
 */
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
  const containerRef = useRef<HTMLDivElement>(null);
  /** 当前拖拽会话的清理函数;组件卸载时兜底恢复全局样式并放弃提交 */
  const cleanupRef = useRef<(() => void) | null>(null);
  const [dragSize, setDragSize] = useState<DragSize | null>(null);

  const resizing = dragSize !== null;

  useEffect(() => () => cleanupRef.current?.(), []);

  const startResize = useCallback(
    (dir: "left" | "right") => (e: React.PointerEvent<HTMLDivElement>) => {
      if (!editor.isEditable || enable === false) return;
      if (cleanupRef.current) return; // 已在拖拽中(如多点触控)
      const el = containerRef.current;
      if (!el) return;
      // preventDefault 一并抑制后续 mousedown/dragstart,阻止 ProseMirror 接管本次交互
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 某些场景下 pointerId 已失效,window 监听仍可保证拖拽可用
      }

      const rect = el.getBoundingClientRect();
      const startWidth = Math.round(rect.width);
      const startHeight = Math.round(rect.height);
      if (startWidth <= 0 || startHeight <= 0) return;

      // 可用最大宽度 = 内容容器宽度;浮动时 wrapper 为 shrink-to-fit,需向上取一级(并剔除其水平内边距)
      const wrapper = el.parentElement;
      let maxWidth = wrapper?.clientWidth || startWidth;
      if (wrapper && getComputedStyle(wrapper).float !== "none" && wrapper.parentElement) {
        const parentStyle = getComputedStyle(wrapper.parentElement);
        const paddingX =
          (parseFloat(parentStyle.paddingLeft) || 0) + (parseFloat(parentStyle.paddingRight) || 0);
        maxWidth = wrapper.parentElement.clientWidth - paddingX;
      }
      maxWidth = Math.max(maxWidth, startWidth);

      const ratio = aspectRatio && aspectRatio > 0 ? aspectRatio : startWidth / startHeight;
      const minW = toPx(minWidth, DEFAULT_MIN_WIDTH);

      // 单次派发选中节点,保证拖拽期间选区/气泡菜单稳定(替代旧的 200ms 节流派发)
      const pos = getPos();
      if (typeof pos === "number") {
        const tr = editor.state.tr;
        tr.setSelection(NodeSelection.near(editor.state.doc.resolve(pos)));
        tr.setMeta("addToHistory", false);
        editor.view.dispatch(tr);
      }

      let current = { width: startWidth, height: startHeight };
      setDragSize({ ...current, maxWidth });

      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const compute = (clientX: number) => {
        const delta = clientX - e.clientX;
        let w = Math.round(dir === "right" ? startWidth + delta : startWidth - delta);
        if (Math.abs(w - maxWidth) <= SNAP_THRESHOLD) w = maxWidth;
        w = Math.max(minW, Math.min(w, maxWidth));
        return { width: w, height: Math.round(w / ratio) };
      };

      let raf = 0;
      let lastX = e.clientX;
      const onMove = (ev: PointerEvent) => {
        lastX = ev.clientX;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          current = compute(lastX);
          setDragSize({ ...current, maxWidth });
        });
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") finish(false);
      };

      function finish(commit: boolean) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("blur", onCancel);
        window.removeEventListener("keydown", onKey, true);
        if (raf) cancelAnimationFrame(raf);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        cleanupRef.current = null;
        setDragSize(null);
        // 仅在尺寸实际变化时提交;单次 updateAttributes => 单条撤销记录
        if (commit && (current.width !== startWidth || current.height !== startHeight)) {
          onResizeStop({ width: current.width, height: current.height });
        }
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onCancel);
      window.addEventListener("keydown", onKey, true);
      cleanupRef.current = onCancel;
    },
    [editor, enable, aspectRatio, minWidth, getPos, onResizeStop]
  );

  const stopHandleEvent = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const showHandles = editor.isEditable && enable !== false && hoverable !== false;

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/resizable relative max-w-full rounded-sm transition-[outline] duration-150",
        selected || resizing
          ? "outline outline-2 outline-primary outline-offset-2"
          : hoverable
            ? "hover:outline hover:outline-2 hover:outline-primary/40 hover:outline-offset-2"
            : "",
        className
      )}
      style={{
        width: resizing ? dragSize.width : width,
        height: resizing ? dragSize.height : height,
        maxWidth: "100%"
      }}
    >
      {children}
      {showHandles &&
        (["left", "right"] as const).map((dir) => (
          <div
            key={dir}
            aria-hidden="true"
            onPointerDown={startResize(dir)}
            onMouseDown={stopHandleEvent}
            onDragStart={stopHandleEvent}
            className={cn(
              "group/handle absolute inset-y-0 z-20 flex w-4 cursor-col-resize touch-none items-center",
              dir === "left" ? "-left-2 justify-start" : "-right-2 justify-end",
              "transition-opacity duration-150",
              resizing || selected ? "opacity-100" : "opacity-0 group-hover/resizable:opacity-100"
            )}
          >
            <span
              className={cn(
                "block h-8 w-1 rounded-full transition-colors duration-150",
                resizing ? "bg-primary" : "bg-muted-foreground/40 group-hover/handle:bg-primary"
              )}
            />
          </div>
        ))}
      {resizing && (
        <div className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-xs leading-none text-popover-foreground shadow-sm">
          {dragSize.width}px · {Math.max(1, Math.round((dragSize.width / dragSize.maxWidth) * 100))}%
        </div>
      )}
    </div>
  );
};
