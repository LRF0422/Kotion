import {
  Baseline,
  ChevronDown,
  Circle,
  ExternalLink,
  Link2,
  PaintBucket,
  RotateCcw,
  Trash2,
} from "@kn/icon";
import {
  Button,
  ColorPicker,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@kn/ui";
import { NodeToolbar, Position } from "@xyflow/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeMindmapHref } from "../model/normalize";
import type { MindmapNode, MindmapNodeStyle } from "../model/types";
import type { MindmapNodeStylePatch } from "../model/operations";

const FONT_SIZES = [12, 13, 14, 16, 18, 20, 24, 28, 32] as const;
const ICON_SIZE = 16;

interface MindmapNodeToolbarProps {
  node: MindmapNode;
  selected: boolean;
  isEditable: boolean;
  isEditing: boolean;
  onPreviewStyle: (patch: MindmapNodeStylePatch) => void;
  onCommitStylePreview: () => void;
  onSetStyle: (patch: MindmapNodeStylePatch | null) => void;
  onUpdateHref: (href: string | null) => boolean;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          className={`drawnix-node-format-button ${destructive ? "is-destructive" : ""}`}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function openNodeHref(href: string) {
  const tab = window.open(href, "_blank", "noopener,noreferrer");
  if (tab) tab.opener = null;
}

function colorIcon(
  kind: keyof Pick<
    MindmapNodeStyle,
    "textColor" | "borderColor" | "backgroundColor"
  >,
  color: string | undefined,
) {
  const style = color ? { color } : undefined;
  if (kind === "textColor") return <Baseline size={ICON_SIZE} style={style} />;
  if (kind === "borderColor") return <Circle size={ICON_SIZE} style={style} />;
  return <PaintBucket size={ICON_SIZE} style={style} />;
}

export function MindmapNodeToolbar({
  node,
  selected,
  isEditable,
  isEditing,
  onPreviewStyle,
  onCommitStylePreview,
  onSetStyle,
  onUpdateHref,
}: MindmapNodeToolbarProps) {
  const [fontOpen, setFontOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [draftHref, setDraftHref] = useState(node.href ?? "");
  const [linkError, setLinkError] = useState("");
  const toolbarVisible =
    selected && !isEditing && (isEditable || Boolean(node.href));

  useEffect(() => {
    if (!linkOpen) setDraftHref(node.href ?? "");
  }, [linkOpen, node.href]);

  const fontSizes = useMemo(() => {
    const current = node.style?.fontSize;
    return current && !(FONT_SIZES as readonly number[]).includes(current)
      ? [...FONT_SIZES, current].sort((left, right) => left - right)
      : [...FONT_SIZES];
  }, [node.style?.fontSize]);

  const selectFontSize = useCallback(
    (value: string) => {
      setFontOpen(false);
      requestAnimationFrame(() => {
        onSetStyle({
          fontSize: value === "default" ? null : Number(value),
        });
      });
    },
    [onSetStyle],
  );

  const handleColorOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onCommitStylePreview();
    },
    [onCommitStylePreview],
  );

  const handleLinkOpenChange = useCallback(
    (open: boolean) => {
      setLinkOpen(open);
      setLinkError("");
      if (open) setDraftHref(node.href ?? "");
    },
    [node.href],
  );

  const saveHref = useCallback(() => {
    const normalized = normalizeMindmapHref(draftHref);
    if (!normalized) {
      setLinkError("请输入有效的 http 或 https 链接");
      return;
    }
    if (!onUpdateHref(normalized)) {
      setLinkError("链接保存失败");
      return;
    }
    setLinkOpen(false);
    setLinkError("");
  }, [draftHref, onUpdateHref]);

  return (
    <NodeToolbar
      isVisible={toolbarVisible}
      position={Position.Top}
      offset={12}
      role="toolbar"
      aria-label="节点格式"
      className="drawnix-node-format-toolbar nodrag nopan nowheel"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <TooltipProvider delayDuration={300}>
        {isEditable ? (
          <>
            <Popover open={fontOpen} onOpenChange={setFontOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="字体大小"
                  className="drawnix-node-font-size nodrag nopan nowheel"
                >
                  <span>
                    {node.style?.fontSize ? `${node.style.fontSize}px` : "默认"}
                  </span>
                  <ChevronDown size={14} aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                sideOffset={8}
                className="drawnix-node-font-size-popover nodrag nopan nowheel"
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div role="listbox" aria-label="字体大小" className="space-y-1">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!node.style?.fontSize}
                    className="drawnix-node-font-size-option"
                    onClick={() => selectFontSize("default")}
                  >
                    默认
                  </button>
                  {fontSizes.map((fontSize) => (
                    <button
                      key={fontSize}
                      type="button"
                      role="option"
                      aria-selected={node.style?.fontSize === fontSize}
                      className="drawnix-node-font-size-option"
                      onClick={() => selectFontSize(fontSize.toString())}
                    >
                      {fontSize}px
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-6" />

            <span title="文字颜色">
              <ColorPicker
                value={node.style?.textColor}
                showOpacity
                triggerIcon={colorIcon("textColor", node.style?.textColor)}
                triggerAriaLabel="文字颜色"
                triggerClassName="drawnix-node-format-button"
                onChange={(textColor) => onPreviewStyle({ textColor })}
                onUnset={() => onPreviewStyle({ textColor: null })}
                onOpenChange={handleColorOpenChange}
                align="center"
              />
            </span>
            <span title="边框颜色">
              <ColorPicker
                value={node.style?.borderColor}
                showOpacity
                triggerIcon={colorIcon("borderColor", node.style?.borderColor)}
                triggerAriaLabel="边框颜色"
                triggerClassName="drawnix-node-format-button"
                onChange={(borderColor) => onPreviewStyle({ borderColor })}
                onUnset={() => onPreviewStyle({ borderColor: null })}
                onOpenChange={handleColorOpenChange}
                align="center"
              />
            </span>
            <span title="背景颜色">
              <ColorPicker
                value={node.style?.backgroundColor}
                showOpacity
                triggerIcon={colorIcon(
                  "backgroundColor",
                  node.style?.backgroundColor,
                )}
                triggerAriaLabel="背景颜色"
                triggerClassName="drawnix-node-format-button"
                onChange={(backgroundColor) =>
                  onPreviewStyle({ backgroundColor })
                }
                onUnset={() => onPreviewStyle({ backgroundColor: null })}
                onOpenChange={handleColorOpenChange}
                align="center"
              />
            </span>

            <ToolbarButton
              label="恢复默认样式"
              disabled={!node.style}
              onClick={() => onSetStyle(null)}
            >
              <RotateCcw size={ICON_SIZE} />
            </ToolbarButton>

            <Separator orientation="vertical" className="h-6" />
          </>
        ) : null}

        {node.href ? (
          <ToolbarButton
            label="打开链接"
            onClick={() => openNodeHref(node.href!)}
          >
            <ExternalLink size={ICON_SIZE} />
          </ToolbarButton>
        ) : null}

        {isEditable ? (
          <Popover open={linkOpen} onOpenChange={handleLinkOpenChange}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={node.href ? "编辑链接" : "添加链接"}
                    className="drawnix-node-format-button"
                  >
                    <Link2 size={ICON_SIZE} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">
                {node.href ? "编辑链接" : "添加链接"}
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              align="center"
              side="bottom"
              sideOffset={8}
              className="drawnix-node-link-popover nodrag nopan nowheel"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="space-y-2">
                <label
                  htmlFor={`drawnix-node-link-${node.id}`}
                  className="text-xs font-medium"
                >
                  节点链接
                </label>
                <Input
                  id={`drawnix-node-link-${node.id}`}
                  autoFocus
                  value={draftHref}
                  placeholder="https://example.com"
                  className="h-9"
                  onChange={(event) => {
                    setDraftHref(event.target.value);
                    setLinkError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveHref();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setLinkOpen(false);
                    }
                  }}
                />
                {linkError ? (
                  <p className="text-xs text-destructive">{linkError}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLinkOpen(false)}
                  >
                    取消
                  </Button>
                  <Button type="button" size="sm" onClick={saveHref}>
                    保存
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        {isEditable && node.href ? (
          <ToolbarButton
            label="移除链接"
            destructive
            onClick={() => onUpdateHref(null)}
          >
            <Trash2 size={ICON_SIZE} />
          </ToolbarButton>
        ) : null}
      </TooltipProvider>
    </NodeToolbar>
  );
}
