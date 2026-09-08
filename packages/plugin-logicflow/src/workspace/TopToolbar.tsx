import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Download,
  Scan,
  FolderOpen,
  GitBranch,
  Group,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  Ungroup,
  X,
} from "@kn/icon";
import { Button, Separator } from "@kn/ui";
import React from "react";
import type { AlignMode, DistributeMode } from "../commands";

const ALIGN_BUTTONS: {
  mode: AlignMode;
  icon: typeof AlignStartVertical;
  label: string;
}[] = [
  { mode: "left", icon: AlignStartVertical, label: "左对齐" },
  { mode: "center", icon: AlignCenterVertical, label: "水平居中" },
  { mode: "right", icon: AlignEndVertical, label: "右对齐" },
  { mode: "top", icon: AlignStartHorizontal, label: "顶对齐" },
  { mode: "middle", icon: AlignCenterHorizontal, label: "垂直居中" },
  { mode: "bottom", icon: AlignEndHorizontal, label: "底对齐" },
];

function ToolButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-11 w-11 shrink-0"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function TopToolbar({
  readOnly,
  canUndo,
  canRedo,
  selectionCount,
  toolMode,
  zoom,
  onToolMode,
  onUndo,
  onRedo,
  onDelete,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onSearch,
  onImport,
  onExport,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  onFullscreen,
  onClose,
}: {
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectionCount: number;
  toolMode: "select" | "pan" | "connector";
  zoom: string;
  onToolMode: (mode: "select" | "pan" | "connector") => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onSearch: () => void;
  onImport: () => void;
  onExport: (type: "png" | "svg") => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onFullscreen: () => void;
  onClose?: () => void;
}) {
  const editableSelection = !readOnly && selectionCount > 0;
  return (
    <div className="logicflow-toolbar">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2">
        <Button
          type="button"
          variant={toolMode === "select" ? "secondary" : "ghost"}
          size="icon"
          className="h-11 w-11 shrink-0"
          title="选择工具"
          onClick={() => onToolMode("select")}
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={toolMode === "pan" ? "secondary" : "ghost"}
          size="icon"
          className="h-11 w-11 shrink-0"
          title="平移工具"
          onClick={() => onToolMode("pan")}
        >
          <Hand className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={toolMode === "connector" ? "secondary" : "ghost"}
          size="icon"
          className="h-11 w-11 shrink-0"
          title="连接线工具"
          disabled={readOnly}
          onClick={() => onToolMode("connector")}
        >
          <GitBranch className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton
          title="撤销"
          disabled={!canUndo || readOnly}
          onClick={onUndo}
        >
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="重做"
          disabled={!canRedo || readOnly}
          onClick={onRedo}
        >
          <Redo2 className="h-4 w-4" />
        </ToolButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        {ALIGN_BUTTONS.map(({ mode, icon: Icon, label }) => (
          <ToolButton
            key={mode}
            title={label}
            disabled={readOnly || selectionCount < 2}
            onClick={() => onAlign(mode)}
          >
            <Icon className="h-4 w-4" />
          </ToolButton>
        ))}
        <ToolButton
          title="水平等距"
          disabled={readOnly || selectionCount < 3}
          onClick={() => onDistribute("horizontal")}
        >
          <AlignHorizontalDistributeCenter className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="垂直等距"
          disabled={readOnly || selectionCount < 3}
          onClick={() => onDistribute("vertical")}
        >
          <AlignVerticalDistributeCenter className="h-4 w-4" />
        </ToolButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton
          title="分组"
          disabled={readOnly || selectionCount < 2}
          onClick={onGroup}
        >
          <Group className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="取消分组"
          disabled={!editableSelection}
          onClick={onUngroup}
        >
          <Ungroup className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="删除"
          disabled={!editableSelection}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolButton title="搜索" onClick={onSearch}>
          <Search className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="导入 JSON" disabled={readOnly} onClick={onImport}>
          <FolderOpen className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="导出 PNG" onClick={() => onExport("png")}>
          <Download className="h-4 w-4" />
          <span className="sr-only">PNG</span>
        </ToolButton>
        <ToolButton title="导出 SVG" onClick={() => onExport("svg")}>
          <Download className="h-4 w-4" />
          <span className="sr-only">SVG</span>
        </ToolButton>
      </div>
      <div className="flex shrink-0 items-center border-l px-1">
        <ToolButton title="缩小" onClick={onZoomOut}>
          <Minus className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="放大" onClick={onZoomIn}>
          <Plus className="h-4 w-4" />
        </ToolButton>
        <Button
          type="button"
          variant="ghost"
          className="h-11 min-w-16 px-2 text-xs tabular-nums"
          title="重置为 100%"
          onClick={onZoomReset}
        >
          {zoom}
        </Button>
        <ToolButton title="适应画布" onClick={onFit}>
          <Scan className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="全屏" onClick={onFullscreen}>
          <Maximize2 className="h-4 w-4" />
        </ToolButton>
        {onClose && (
          <ToolButton title="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </ToolButton>
        )}
      </div>
    </div>
  );
}
