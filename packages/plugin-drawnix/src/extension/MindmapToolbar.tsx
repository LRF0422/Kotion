import {
  ChevronDown,
  Expand,
  GitBranchPlus,
  Pencil,
  Plus,
  Redo2,
  Scan,
  Shrink,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useResponsive,
} from "@kn/ui";
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

const LAYOUT_OPTIONS: Array<{
  value: MindmapLayout;
  labelKey: string;
}> = [
  { value: "standard", labelKey: "drawnix.toolbar.layouts.standard" },
  { value: "right", labelKey: "drawnix.toolbar.layouts.right" },
  { value: "left", labelKey: "drawnix.toolbar.layouts.left" },
  { value: "downward", labelKey: "drawnix.toolbar.layouts.downward" },
  { value: "upward", labelKey: "drawnix.toolbar.layouts.upward" },
];

const ICON_SIZE = 16;

function ToolButton({
  title,
  onClick,
  disabled,
  className = "drawnix-tool-btn",
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={className}
          aria-label={title}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}

export function MindmapToolbar(props: MindmapToolbarProps) {
  const { isMobile } = useResponsive();
  const { t } = useTranslation();
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = React.useState(false);
  const selectedLayoutLabel = t(
    LAYOUT_OPTIONS.find((option) => option.value === props.layout)?.labelKey ??
      "drawnix.toolbar.layouts.standard",
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={`drawnix-toolbar ${isLayoutMenuOpen ? "is-layout-menu-open" : ""}`}
      >
        {props.isEditable && (
          <div className="drawnix-toolbar-group">
            <ToolButton
              title={t("drawnix.toolbar.addChild")}
              onClick={props.onAddChild}
            >
              <Plus size={ICON_SIZE} />
            </ToolButton>
            <ToolButton
              title={t("drawnix.toolbar.addSibling")}
              onClick={props.onAddSibling}
              disabled={!props.hasSelection}
            >
              <GitBranchPlus size={ICON_SIZE} />
            </ToolButton>
            <ToolButton
              title={t("drawnix.toolbar.editNode")}
              onClick={props.onEdit}
              disabled={!props.hasSelection}
            >
              <Pencil size={ICON_SIZE} />
            </ToolButton>
            <ToolButton
              title={t("drawnix.toolbar.deleteNode")}
              onClick={props.onDelete}
              disabled={!props.canDelete}
            >
              <Trash2 size={ICON_SIZE} />
            </ToolButton>
            {props.canCollapse && (
              <ToolButton
                title={
                  props.isCollapsed
                    ? t("drawnix.toolbar.expandChildren")
                    : t("drawnix.toolbar.collapseChildren")
                }
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
              title={t("drawnix.toolbar.undo")}
              onClick={props.onUndo}
              disabled={!props.canUndo}
            >
              <Undo2 size={ICON_SIZE} />
            </ToolButton>
            <ToolButton
              title={t("drawnix.toolbar.redo")}
              onClick={props.onRedo}
              disabled={!props.canRedo}
            >
              <Redo2 size={ICON_SIZE} />
            </ToolButton>
          </div>
        )}

        <span className="drawnix-toolbar-sep" />

        <div className="drawnix-toolbar-group">
          <ToolButton
            title={t("drawnix.toolbar.zoomOut")}
            onClick={props.onZoomOut}
          >
            <ZoomOut size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title={t("drawnix.toolbar.resetZoom")}
            className="drawnix-tool-zoom"
            onClick={props.onZoomReset}
          >
            {Math.round(props.zoom)}%
          </ToolButton>
          <ToolButton
            title={t("drawnix.toolbar.zoomIn")}
            onClick={props.onZoomIn}
          >
            <ZoomIn size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title={t("drawnix.toolbar.fitView")}
            onClick={props.onFit}
          >
            <Scan size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title={
              props.isFullscreen
                ? t("drawnix.toolbar.exitFullscreen")
                : t("drawnix.toolbar.fullscreen")
            }
            onClick={props.onToggleFullscreen}
          >
            {props.isFullscreen ? (
              <Shrink size={ICON_SIZE} />
            ) : (
              <Expand size={ICON_SIZE} />
            )}
          </ToolButton>
        </div>

        {props.isEditable && (
          <>
            <span className="drawnix-toolbar-sep" />
            <div
              className="drawnix-toolbar-layout-wrap"
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (
                  !(nextTarget instanceof Node) ||
                  !event.currentTarget.contains(nextTarget)
                ) {
                  setIsLayoutMenuOpen(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setIsLayoutMenuOpen(false);
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="drawnix-toolbar-layout"
                    aria-label={t("drawnix.toolbar.changeLayout")}
                    aria-haspopup="listbox"
                    aria-expanded={isLayoutMenuOpen}
                    onClick={() => setIsLayoutMenuOpen((open) => !open)}
                  >
                    <span>{selectedLayoutLabel}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("drawnix.toolbar.changeLayout")}
                </TooltipContent>
              </Tooltip>
              {isLayoutMenuOpen && (
                <div
                  className="drawnix-toolbar-layout-menu"
                  role="listbox"
                  aria-label={t("drawnix.toolbar.layout")}
                >
                  {LAYOUT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === props.layout}
                      className="drawnix-toolbar-layout-option"
                      onClick={() => {
                        props.onSetLayout(option.value);
                        setIsLayoutMenuOpen(false);
                      }}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
