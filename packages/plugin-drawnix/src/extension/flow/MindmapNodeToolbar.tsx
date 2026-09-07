import {
  Baseline,
  ChevronDown,
  Circle,
  ExternalLink,
  GitBranchPlus,
  Link2,
  PaintBucket,
  Plus,
  RotateCcw,
  Trash2,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
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
  onAddChild: () => void;
  onAddSibling: () => void;
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
  onAddChild,
  onAddSibling,
  onPreviewStyle,
  onCommitStylePreview,
  onSetStyle,
  onUpdateHref,
}: MindmapNodeToolbarProps) {
  const { t } = useTranslation();
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
      setLinkError(t("drawnix.toolbar.invalidLink"));
      return;
    }
    if (!onUpdateHref(normalized)) {
      setLinkError(t("drawnix.toolbar.linkSaveFailed"));
      return;
    }
    setLinkOpen(false);
    setLinkError("");
  }, [draftHref, onUpdateHref, t]);

  return (
    <NodeToolbar
      isVisible={toolbarVisible}
      position={Position.Top}
      offset={12}
      role="toolbar"
      aria-label={t("drawnix.toolbar.nodeFormat")}
      className="drawnix-node-format-toolbar nodrag nopan nowheel"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <TooltipProvider delayDuration={300}>
        {isEditable ? (
          <>
            <ToolbarButton
              label={t("drawnix.toolbar.addChild")}
              onClick={onAddChild}
            >
              <Plus size={ICON_SIZE} />
            </ToolbarButton>
            <ToolbarButton
              label={t("drawnix.toolbar.addSibling")}
              onClick={onAddSibling}
            >
              <GitBranchPlus size={ICON_SIZE} />
            </ToolbarButton>

            <Separator orientation="vertical" className="h-6" />

            <Popover open={fontOpen} onOpenChange={setFontOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t("drawnix.toolbar.fontSize")}
                      className="drawnix-node-font-size nodrag nopan nowheel"
                    >
                      <span>
                        {node.style?.fontSize ?? t("drawnix.toolbar.default")}
                      </span>
                      <ChevronDown size={12} aria-hidden />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t("drawnix.toolbar.fontSize")}
                </TooltipContent>
              </Tooltip>
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
                <div
                  role="listbox"
                  aria-label={t("drawnix.toolbar.fontSize")}
                  className="space-y-0.5"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={!node.style?.fontSize}
                    className="drawnix-node-font-size-option"
                    onClick={() => selectFontSize("default")}
                  >
                    {t("drawnix.toolbar.default")}
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

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <ColorPicker
                    value={node.style?.textColor}
                    showOpacity
                    triggerIcon={colorIcon("textColor", node.style?.textColor)}
                    triggerAriaLabel={t("drawnix.toolbar.textColor")}
                    triggerClassName="drawnix-node-format-button"
                    onChange={(textColor) => onPreviewStyle({ textColor })}
                    onUnset={() => onPreviewStyle({ textColor: null })}
                    onOpenChange={handleColorOpenChange}
                    align="center"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("drawnix.toolbar.textColor")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <ColorPicker
                    value={node.style?.borderColor}
                    showOpacity
                    triggerIcon={colorIcon(
                      "borderColor",
                      node.style?.borderColor,
                    )}
                    triggerAriaLabel={t("drawnix.toolbar.borderColor")}
                    triggerClassName="drawnix-node-format-button"
                    onChange={(borderColor) => onPreviewStyle({ borderColor })}
                    onUnset={() => onPreviewStyle({ borderColor: null })}
                    onOpenChange={handleColorOpenChange}
                    align="center"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("drawnix.toolbar.borderColor")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <ColorPicker
                    value={node.style?.backgroundColor}
                    showOpacity
                    triggerIcon={colorIcon(
                      "backgroundColor",
                      node.style?.backgroundColor,
                    )}
                    triggerAriaLabel={t("drawnix.toolbar.backgroundColor")}
                    triggerClassName="drawnix-node-format-button"
                    onChange={(backgroundColor) =>
                      onPreviewStyle({ backgroundColor })
                    }
                    onUnset={() => onPreviewStyle({ backgroundColor: null })}
                    onOpenChange={handleColorOpenChange}
                    align="center"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t("drawnix.toolbar.backgroundColor")}
              </TooltipContent>
            </Tooltip>

            <ToolbarButton
              label={t("drawnix.toolbar.resetStyle")}
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
            label={t("drawnix.toolbar.openLink")}
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
                    aria-label={
                      node.href
                        ? t("drawnix.toolbar.editLink")
                        : t("drawnix.toolbar.addLink")
                    }
                    className="drawnix-node-format-button"
                  >
                    <Link2 size={ICON_SIZE} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">
                {node.href
                  ? t("drawnix.toolbar.editLink")
                  : t("drawnix.toolbar.addLink")}
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
                  {t("drawnix.toolbar.nodeLink")}
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
                    {t("drawnix.toolbar.cancel")}
                  </Button>
                  <Button type="button" size="sm" onClick={saveHref}>
                    {t("drawnix.toolbar.save")}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}

        {isEditable && node.href ? (
          <ToolbarButton
            label={t("drawnix.toolbar.removeLink")}
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
