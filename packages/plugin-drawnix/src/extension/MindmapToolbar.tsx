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
import { useResponsive } from "@kn/ui";
import React from "react";
import { type DrawnixI18nKey, useDrawnixI18n } from "../i18n";
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
  labelKey: DrawnixI18nKey;
}> = [
  { value: "standard", labelKey: "toolbar.layout.standard" },
  { value: "right", labelKey: "toolbar.layout.right" },
  { value: "left", labelKey: "toolbar.layout.left" },
  { value: "downward", labelKey: "toolbar.layout.downward" },
  { value: "upward", labelKey: "toolbar.layout.upward" },
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
    <button
      type="button"
      className={`${className} drawnix-tooltip`}
      data-tooltip={title}
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
  const { t } = useDrawnixI18n();
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = React.useState(false);
  const selectedLayoutLabel = t(
    LAYOUT_OPTIONS.find((option) => option.value === props.layout)?.labelKey ??
      "toolbar.layout.standard",
  );

  return (
    <div
      className={`drawnix-toolbar ${isLayoutMenuOpen ? "is-layout-menu-open" : ""}`}
    >
      {props.isEditable && (
        <div className="drawnix-toolbar-group">
          <ToolButton title={t("toolbar.addChild")} onClick={props.onAddChild}>
            <Plus size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title={t("toolbar.addSibling")}
            onClick={props.onAddSibling}
            disabled={!props.hasSelection}
          >
            <GitBranchPlus size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title={t("toolbar.editNode")}
            onClick={props.onEdit}
            disabled={!props.hasSelection}
          >
            <Pencil size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title={t("toolbar.deleteNode")}
            onClick={props.onDelete}
            disabled={!props.canDelete}
          >
            <Trash2 size={ICON_SIZE} />
          </ToolButton>
          {props.canCollapse && (
            <ToolButton
              title={
                props.isCollapsed
                  ? t("toolbar.expandChildren")
                  : t("toolbar.collapseChildren")
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
            title={t("toolbar.undo")}
            onClick={props.onUndo}
            disabled={!props.canUndo}
          >
            <Undo2 size={ICON_SIZE} />
          </ToolButton>
          <ToolButton
            title={t("toolbar.redo")}
            onClick={props.onRedo}
            disabled={!props.canRedo}
          >
            <Redo2 size={ICON_SIZE} />
          </ToolButton>
        </div>
      )}

      <span className="drawnix-toolbar-sep" />

      <div className="drawnix-toolbar-group">
        <ToolButton title={t("toolbar.zoomOut")} onClick={props.onZoomOut}>
          <ZoomOut size={ICON_SIZE} />
        </ToolButton>
        <ToolButton
          title={t("toolbar.resetZoom")}
          className="drawnix-tool-zoom"
          onClick={props.onZoomReset}
        >
          {Math.round(props.zoom)}%
        </ToolButton>
        <ToolButton title={t("toolbar.zoomIn")} onClick={props.onZoomIn}>
          <ZoomIn size={ICON_SIZE} />
        </ToolButton>
        <ToolButton title={t("toolbar.fitView")} onClick={props.onFit}>
          <Scan size={ICON_SIZE} />
        </ToolButton>
        <ToolButton
          title={
            props.isFullscreen
              ? t("toolbar.exitFullscreen")
              : t("toolbar.fullscreen")
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
            <button
              type="button"
              className="drawnix-toolbar-layout drawnix-tooltip"
              data-tooltip={t("toolbar.changeLayout")}
              aria-label={t("toolbar.changeLayout")}
              aria-haspopup="listbox"
              aria-expanded={isLayoutMenuOpen}
              onClick={() => setIsLayoutMenuOpen((open) => !open)}
            >
              <span>{selectedLayoutLabel}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {isLayoutMenuOpen && (
              <div
                className="drawnix-toolbar-layout-menu"
                role="listbox"
                aria-label={t("toolbar.layout")}
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
  );
}
