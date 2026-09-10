import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "@kn/common";
import { Editor, findParentNode } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { Settings2 } from "@kn/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Slider,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  Input,
  Label,
  Separator
} from "@kn/ui";

import { Columns } from "../columns";
import { Column, isSafeBackground, resolveColumnBackground } from "../column";

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

const BG_PRESETS: Array<{ labelKey: string; value: string | null }> = [
  { labelKey: 'editor.columns.background.none', value: null },
  { labelKey: 'editor.columns.background.gray', value: 'hsl(var(--muted))' },
  { labelKey: 'editor.columns.background.blue', value: 'var(--column-bg-blue)' },
  { labelKey: 'editor.columns.background.green', value: 'var(--column-bg-green)' },
  { labelKey: 'editor.columns.background.pink', value: 'var(--column-bg-pink)' },
  { labelKey: 'editor.columns.background.yellow', value: 'var(--column-bg-yellow)' }
];

export const ColumnsAdvancedPopover: React.FC<{ editor: Editor }> = React.memo(({ editor }) => {
  const { t } = useTranslation();
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
  const border = targets?.columnNode.attrs.border !== false;
  const background: string | null = typeof targets?.columnNode.attrs.background === 'string'
    ? (targets!.columnNode.attrs.background as string)
    : null;
  const resolvedBackground = resolveColumnBackground(background);

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

  const handleBorderChange = useCallback((checked: boolean) => {
    updateColumnAttrs({ border: checked });
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
          title={t('editor.columns.advanced')}
          aria-label={t('editor.columns.advanced')}
          className="p-1 hover:bg-muted rounded-md cursor-pointer flex items-center justify-center bg-transparent border-0"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('editor.columns.gap')}</Label>
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
            <Label className="text-xs font-medium">{t('editor.columns.padding')}</Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={padding}
              onValueChange={handlePaddingChange}
              className="justify-start"
            >
              <ToggleGroupItem value="none" className="px-2 text-xs">{t('editor.columns.paddingOptions.none')}</ToggleGroupItem>
              <ToggleGroupItem value="sm" className="px-2 text-xs">{t('editor.columns.paddingOptions.compact')}</ToggleGroupItem>
              <ToggleGroupItem value="md" className="px-2 text-xs">{t('editor.columns.paddingOptions.medium')}</ToggleGroupItem>
              <ToggleGroupItem value="lg" className="px-2 text-xs">{t('editor.columns.paddingOptions.loose')}</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">{t('editor.columns.verticalAlign')}</Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={verticalAlign}
              onValueChange={handleVAlignChange}
              className="justify-start"
            >
              <ToggleGroupItem value="top" className="px-2 text-xs">{t('editor.columns.verticalAlignOptions.top')}</ToggleGroupItem>
              <ToggleGroupItem value="center" className="px-2 text-xs">{t('editor.columns.verticalAlignOptions.center')}</ToggleGroupItem>
              <ToggleGroupItem value="bottom" className="px-2 text-xs">{t('editor.columns.verticalAlignOptions.bottom')}</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="column-border" className="text-xs font-medium">
              {t('editor.columns.border')}
            </Label>
            <Switch
              id="column-border"
              checked={border}
              onCheckedChange={handleBorderChange}
              aria-label={t('editor.columns.border')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">{t('editor.columns.backgroundLabel')}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {BG_PRESETS.map((preset) => {
                const isActive = (preset.value ?? '') === (resolvedBackground ?? '');
                return (
                  <button
                    key={preset.labelKey}
                    type="button"
                    title={t(preset.labelKey)}
                    aria-label={t(preset.labelKey)}
                    onClick={() => {
                      applyBackground(preset.value);
                      setBgInput(preset.value ?? '');
                    }}
                    className={
                      'h-6 w-6 rounded-md border transition ' +
                      (isActive ? 'ring-2 ring-primary/60 border-primary/60 ' : 'border-border ')
                    }
                    style={{
                      background: preset.value ?? 'repeating-linear-gradient(45deg,hsl(var(--background)),hsl(var(--background)) 4px,hsl(var(--muted)) 4px,hsl(var(--muted)) 8px)'
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
              placeholder={t('editor.columns.customColorPlaceholder')}
              className="h-7 text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">{t('editor.columns.width')}</Label>
            <Input
              type="number"
              min={5}
              max={95}
              step={1}
              value={width ?? ''}
              placeholder={t('editor.columns.widthPlaceholder')}
              onChange={(e) => handleWidthChange(e.target.value)}
              className="h-7 text-xs"
            />
            <span className="text-muted-foreground text-[10px]">
              {t('editor.columns.widthHint')}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}, (prev, next) => prev.editor === next.editor);

ColumnsAdvancedPopover.displayName = 'ColumnsAdvancedPopover';
