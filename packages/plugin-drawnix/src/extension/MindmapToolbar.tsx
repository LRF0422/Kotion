import {
  CornerDownRight,
  Maximize2,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "@kn/icon";
import { useResponsive } from "@kn/ui";
import React from "react";
import type { MindmapLayout } from "./model/types";

export interface MindmapToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  hasSelection: boolean;
  canDelete: boolean;
  canCollapse: boolean;
  isCollapsed: boolean;
  isEditable: boolean;
  isFullscreen: boolean;
  layout: MindmapLayout;
  onAddChild: () => void;
  onAddSibling: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onToggleFullscreen: () => void;
  onSetLayout: (layout: MindmapLayout) => void;
}

const LAYOUT_OPTIONS: Array<{ value: MindmapLayout; label: string }> = [
  { value: "standard", label: "标准" },
  { value: "right", label: "向右" },
  { value: "left", label: "向左" },
  { value: "downward", label: "向下" },
  { value: "upward", label: "向上" },
];

const ICON_SIZE = 16;

function ToolButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="drawnix-tool-btn"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MindmapToolbar(props: MindmapToolbarProps) {
  const { isMobile } = useResponsive();

  return (
    <div className="drawnix-toolbar">
      {props.isEditable && (
        <div className="drawnix-toolbar-group">
          <ToolButton title="添加子节点 (Tab)" onClick={props.onAddChild}>
            <Plus size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title="添加同级节点 (Enter)"
            onClick={props.onAddSibling}
            disabled={!props.hasSelection}
          >
            <CornerDownRight size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title="编辑节点 (双击)"
            onClick={props.onEdit}
            disabled={!props.hasSelection}
          >
            <Pencil size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title="删除节点 (Delete)"
            onClick={props.onDelete}
            disabled={!props.canDelete}
          >
            <Trash2 size={ICON_SIZE} />
          </ToolButton>
          {props.canCollapse && (
            <ToolButton
              title={props.isCollapsed ? "展开子节点" : "折叠子节点"}
              onClick={props.onToggleCollapse}
            >
              <span className="drawnix-collapse-symbol">
                {props.isCollapsed ? "+" : "−"}
              </span>
            </ToolButton>
          )}
        </div>
      )}

      {props.isEditable && !isMobile && (
        <span className="drawnix-toolbar-sep" />
      )}

      {props.isEditable && !isMobile && (
        <div className="drawnix-toolbar-group">
          <ToolButton
            title="撤销 (Ctrl+Z)"
            onClick={props.onUndo}
            disabled={!props.canUndo}
          >
            <Undo2 size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title="重做 (Ctrl+Y)"
            onClick={props.onRedo}
            disabled={!props.canRedo}
          >
            <Redo2 size={ICON_SIZE} />
          </ToolButton>
        </div>
      )}

      <span className="drawnix-toolbar-sep" />

      <div className="drawnix-toolbar-group">
        <ToolButton title="缩小" onClick={props.onZoomOut}>
          <ZoomOut size={ICON_SIZE} />
        </ToolButton>
        <button
          type="button"
          className="drawnix-tool-zoom"
          title="重置缩放"
          onClick={props.onZoomReset}
        >
          {Math.round(props.zoom)}%
        </button>
        <ToolButton title="放大" onClick={props.onZoomIn}>
          <ZoomIn size={ICON_SIZE} />
        </ToolButton>
        <ToolButton title="适应画布" onClick={props.onFit}>
          <Maximize2 size={ICON_SIZE} />
        </ToolButton>
        <ToolButton
          title={props.isFullscreen ? "退出全屏" : "全屏"}
          onClick={props.onToggleFullscreen}
        >
          <Maximize2 size={ICON_SIZE} />
        </ToolButton>
      </div>

      {props.isEditable && (
        <>
          <span className="drawnix-toolbar-sep" />
          <select
            className="drawnix-toolbar-layout"
            title="布局"
            value={props.layout}
            onChange={(event) =>
              props.onSetLayout(event.target.value as MindmapLayout)
            }
          >
            {LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
