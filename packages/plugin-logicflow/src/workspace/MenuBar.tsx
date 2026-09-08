import {
  Check,
  Copy,
  Download,
  FileJson,
  FilePlus2,
  Group,
  HelpCircle,
  Layers3,
  Lock,
  Maximize2,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  Ungroup,
  Unlock,
} from "@kn/icon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@kn/ui";
import React from "react";

function Menu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-11 items-center rounded px-3 text-xs hover:bg-accent data-[state=open]:bg-accent">
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Shortcut({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

export function MenuBar({
  title,
  grid,
  snapline,
  minimap,
  hasSelection,
  selectionLocked,
  canUndo,
  canRedo,
  onTitleChange,
  onNewPage,
  onImport,
  onExport,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onSelectAll,
  onToggleGrid,
  onToggleSnapline,
  onToggleMinimap,
  onToggleLayers,
  onFullscreen,
  onGroup,
  onUngroup,
  onSetLocked,
  onRotate,
  onFlip,
  onReorder,
  onAlign,
  onDistribute,
  onShowShortcuts,
}: {
  title: string;
  grid: boolean;
  snapline: boolean;
  minimap: boolean;
  hasSelection: boolean;
  selectionLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTitleChange: (title: string) => void;
  onNewPage: () => void;
  onImport: () => void;
  onExport: (type: "json" | "png" | "svg" | "pdf") => void;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onToggleGrid: () => void;
  onToggleSnapline: () => void;
  onToggleMinimap: () => void;
  onToggleLayers: () => void;
  onFullscreen: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onSetLocked: (locked: boolean) => void;
  onRotate: (angle: number | "reset") => void;
  onFlip: (axis: "horizontal" | "vertical") => void;
  onReorder: (action: "forward" | "front" | "backward" | "back") => void;
  onAlign: (
    mode: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) => void;
  onDistribute: (mode: "horizontal" | "vertical") => void;
  onShowShortcuts: () => void;
}) {
  return (
    <div className="logicflow-menubar">
      <input
        value={title}
        aria-label="Diagram title"
        className="mr-3 h-9 w-48 rounded bg-transparent px-2 text-sm font-medium outline-none hover:bg-accent focus:bg-accent"
        onChange={(event) => onTitleChange(event.target.value)}
      />
      <Menu label="文件">
        <DropdownMenuItem onSelect={onNewPage}>
          <FilePlus2 className="mr-2 h-4 w-4" />
          新建页面
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onImport}>
          <FileJson className="mr-2 h-4 w-4" />
          导入 JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {(["json", "png", "svg", "pdf"] as const).map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onExport(type)}>
            <Download className="mr-2 h-4 w-4" />
            导出 {type.toUpperCase()}
          </DropdownMenuItem>
        ))}
      </Menu>
      <Menu label="编辑">
        <DropdownMenuItem disabled={!canUndo} onSelect={onUndo}>
          <Undo2 className="mr-2 h-4 w-4" />
          撤销<Shortcut>⌘Z</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canRedo} onSelect={onRedo}>
          <Redo2 className="mr-2 h-4 w-4" />
          重做<Shortcut>⇧⌘Z</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hasSelection} onSelect={onCut}>
          <Scissors className="mr-2 h-4 w-4" />
          剪切<Shortcut>⌘X</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasSelection} onSelect={onCopy}>
          <Copy className="mr-2 h-4 w-4" />
          复制<Shortcut>⌘C</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPaste}>
          粘贴<Shortcut>⌘V</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasSelection} onSelect={onDuplicate}>
          创建副本<Shortcut>⌘D</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSelectAll}>
          全选<Shortcut>⌘A</Shortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasSelection}
          className="text-destructive"
          onSelect={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          删除
        </DropdownMenuItem>
      </Menu>
      <Menu label="视图">
        <DropdownMenuCheckboxItem checked={grid} onCheckedChange={onToggleGrid}>
          网格
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={snapline}
          onCheckedChange={onToggleSnapline}
        >
          对齐参考线
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={minimap}
          onCheckedChange={onToggleMinimap}
        >
          小地图
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem onSelect={onToggleLayers}>
          <Layers3 className="mr-2 h-4 w-4" />
          图层
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onFullscreen}>
          <Maximize2 className="mr-2 h-4 w-4" />
          全屏
        </DropdownMenuItem>
      </Menu>
      <Menu label="排列">
        <DropdownMenuItem disabled={!hasSelection} onSelect={onGroup}>
          <Group className="mr-2 h-4 w-4" />
          分组
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!hasSelection} onSelect={onUngroup}>
          <Ungroup className="mr-2 h-4 w-4" />
          取消分组
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasSelection}
          onSelect={() => onSetLocked(!selectionLocked)}
        >
          {selectionLocked ? (
            <Unlock className="mr-2 h-4 w-4" />
          ) : (
            <Lock className="mr-2 h-4 w-4" />
          )}
          {selectionLocked ? "解锁" : "锁定"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>顺序</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => onReorder("front")}>
              置于顶层
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReorder("forward")}>
              上移一层
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReorder("backward")}>
              下移一层
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReorder("back")}>
              置于底层
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>对齐</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(
              ["left", "center", "right", "top", "middle", "bottom"] as const
            ).map((mode) => (
              <DropdownMenuItem key={mode} onSelect={() => onAlign(mode)}>
                {mode}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => onDistribute("horizontal")}>
          水平分布
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDistribute("vertical")}>
          垂直分布
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onRotate(-90)}>
          逆时针旋转 90°
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRotate(90)}>
          顺时针旋转 90°
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRotate("reset")}>
          重置旋转
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onFlip("horizontal")}>
          水平翻转
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onFlip("vertical")}>
          垂直翻转
        </DropdownMenuItem>
      </Menu>
      <Menu label="帮助">
        <DropdownMenuLabel>LogicFlow</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onShowShortcuts}>
          <HelpCircle className="mr-2 h-4 w-4" />
          快捷键
        </DropdownMenuItem>
      </Menu>
    </div>
  );
}
