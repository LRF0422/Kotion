import React, { useCallback, useMemo, useState } from "react";
import { Editor, findParentNode } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { Settings2 } from "@kn/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Slider,
  ToggleGroup,
  ToggleGroupItem,
  Input,
  Label,
  Separator
} from "@kn/ui";

import { Columns } from "../columns";
import { Column, isSafeBackground } from "../column";

/**
 * Advanced settings popover for the columns bubble menu.
 *
 * Surfaces the schema-level attrs that agents can set (gap on columns; and
 * width / background / padding / verticalAlign on the active column) as a
 * hands-on control panel so users can fine-tune what the agent produces.
 */

type PaddingKey = 'none' | 'sm' | 'md' | 'lg';
type VAlignKey = 'top' | 'center' | 'bottom';

interface ActiveTargets {
  columnsPos: number;
  columnsNode: PMNode;
  columnPos: number;
  columnNode: PMNode;
}

const findActiveTargets = (editor: Editor): ActiveTargets | null => {
  const { selection } = editor.state;
  const columnsParent = findParentNode((n) => n.type.name === Columns.name)(selection);
  const columnParent = findParentNode((n) => n.type.name === Column.name)(selection);
  if (!columnsParent || !columnParent) return null;
  return {
    columnsPos: columnsParent.pos,
    columnsNode: columnsParent.node,
    columnPos: columnParent.pos,
    columnNode: columnParent.node
  };
};

const BG_PRESETS: Array<{ label: string; value: string | null }> = [
  { label: '无', value: null },
  { label: '柔灰', value: 'var(--muted)' },
  { label: '浅蓝', value: '#eef2ff' },
  { label: '浅绿', value: '#ecfdf5' },
  { label: '浅粉', value: '#fdf2f8' },
  { label: '浅黄', value: '#fefce8' }
];

export const ColumnsAdvancedPopover: React.FC<{ editor: Editor }> = React.memo(({ editor }) => {
  const [open, setOpen] = useState(false);

  // Snapshot the current targets each render while the popover is open.
  const targets = useMemo(() => findActiveTargets(editor), [editor, editor.state]);

  const gap = typeof targets?.columnsNode.attrs.gap === 'number'
    ? (targets!.columnsNode.attrs.gap as number)
    : 12;
  const width = typeof targets?.columnNode.attrs.width === 'number'
    ? (targets!.columnNode.attrs.width as number)
    : null;
  const padding: PaddingKey = (targets?.columnNode.attrs.padding as PaddingKey) || 'none';
  const verticalAlign: VAlignKey = (targets?.columnNode.attrs.verticalAlign as VAlignKey) || 'top';
  const background: string | null = typeof targets?.columnNode.attrs.background === 'string'
    ? (targets!.columnNode.attrs.background as string)
    : null;

  const [bgInput, setBgInput] = useState<string>(background ?? '');
  // Sync when the active column changes.
  React.useEffect(() => {
    setBgInput(background ?? '');
  }, [background]);

  const updateColumnsAttrs = useCallback((patch: Record<string, any>) => {
    const t = findActiveTargets(editor);
    if (!t) return;
    const nextAttrs = { ...t.columnsNode.attrs, ...patch };
    const tr = editor.state.tr.setNodeMarkup(t.columnsPos, undefined, nextAttrs);
    editor.view.dispatch(tr);
  }, [editor]);

  const updateColumnAttrs = useCallback((patch: Record<string, any>) => {
    const t = findActiveTargets(editor);
    if (!t) return;
    const nextAttrs = { ...t.columnNode.attrs, ...patch };
    const tr = editor.state.tr.setNodeMarkup(t.columnPos, undefined, nextAttrs);
    editor.view.dispatch(tr);
  }, [editor]);

  const handleGapChange = useCallback((values: number[]) => {
    updateColumnsAttrs({ gap: values[0] });
  }, [updateColumnsAttrs]);

  const handlePaddingChange = useCallback((value: string) => {
    if (!value) return;
    updateColumnAttrs({ padding: value as PaddingKey });
  }, [updateColumnAttrs]);

  const handleVAlignChange = useCallback((value: string) => {
    if (!value) return;
    updateColumnAttrs({ verticalAlign: value as VAlignKey });
  }, [updateColumnAttrs]);

  const applyBackground = useCallback((raw: string | null) => {
    if (raw === null || raw === '') {
      updateColumnAttrs({ background: null });
      return;
    }
    if (!isSafeBackground(raw)) return;
    updateColumnAttrs({ background: raw });
  }, [updateColumnAttrs]);

  const handleBackgroundBlur = useCallback(() => {
    const v = bgInput.trim();
    applyBackground(v.length === 0 ? null : v);
  }, [bgInput, applyBackground]);

  const handleWidthChange = useCallback((raw: string) => {
    if (raw === '') {
      updateColumnAttrs({ width: null });
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    const clamped = Math.min(95, Math.max(5, n));
    updateColumnAttrs({ width: clamped });
  }, [updateColumnAttrs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Advanced"
          className="p-1 hover:bg-muted rounded-md cursor-pointer flex items-center justify-center bg-transparent border-0"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">列间距</Label>
              <span className="text-muted-foreground">{gap}px</span>
            </div>
            <Slider
              value={[gap]}
              min={0}
              max={48}
              step={1}
              onValueChange={handleGapChange}
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">当前列 · 内边距</Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={padding}
              onValueChange={handlePaddingChange}
              className="justify-start"
            >
              <ToggleGroupItem value="none" className="px-2 text-xs">无</ToggleGroupItem>
              <ToggleGroupItem value="sm" className="px-2 text-xs">紧</ToggleGroupItem>
              <ToggleGroupItem value="md" className="px-2 text-xs">中</ToggleGroupItem>
              <ToggleGroupItem value="lg" className="px-2 text-xs">松</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">当前列 · 垂直对齐</Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={verticalAlign}
              onValueChange={handleVAlignChange}
              className="justify-start"
            >
              <ToggleGroupItem value="top" className="px-2 text-xs">顶部</ToggleGroupItem>
              <ToggleGroupItem value="center" className="px-2 text-xs">居中</ToggleGroupItem>
              <ToggleGroupItem value="bottom" className="px-2 text-xs">底部</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">当前列 · 背景色</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {BG_PRESETS.map((preset) => {
                const isActive = (preset.value ?? '') === (background ?? '');
                return (
                  <button
                    key={preset.label}
                    type="button"
                    title={preset.label}
                    onClick={() => {
                      applyBackground(preset.value);
                      setBgInput(preset.value ?? '');
                    }}
                    className={
                      'h-6 w-6 rounded-md border transition ' +
                      (isActive ? 'ring-2 ring-primary/60 border-primary/60 ' : 'border-border ')
                    }
                    style={{
                      background: preset.value ?? 'repeating-linear-gradient(45deg,#fff,#fff 4px,#eee 4px,#eee 8px)'
                    }}
                  />
                );
              })}
            </div>
            <Input
              value={bgInput}
              onChange={(e) => setBgInput(e.target.value)}
              onBlur={handleBackgroundBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBackgroundBlur();
                }
              }}
              placeholder="自定义颜色 (#hex / rgb() / var(--x))"
              className="h-7 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">当前列 · 宽度 (%)</Label>
            <Input
              type="number"
              min={5}
              max={95}
              step={1}
              value={width ?? ''}
              placeholder="留空使用预设"
              onChange={(e) => handleWidthChange(e.target.value)}
              className="h-7 text-xs"
            />
            <span className="text-muted-foreground text-[10px]">
              留空可回退到 layout 预设；设置后单列宽度独立生效。
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}, (prev, next) => prev.editor === next.editor);

ColumnsAdvancedPopover.displayName = 'ColumnsAdvancedPopover';
