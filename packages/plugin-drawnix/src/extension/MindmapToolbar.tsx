import React from "react";
import {
    Plus,
    CornerDownRight,
    Pencil,
    Trash2,
    Undo2,
    Redo2,
    ZoomIn,
    ZoomOut,
    Maximize2,
} from "@kn/icon";
import { MindLayoutType } from "@plait/layouts";

// ============================================================
// Mindmap Toolbar
// Presentational floating toolbar wired to handlers from
// DrawnixView. All board mutations happen in the parent via
// the plait SDK; this component only renders controls + state.
// ============================================================

export interface MindmapToolbarProps {
    canUndo: boolean;
    canRedo: boolean;
    /** Zoom level as a percentage (e.g. 100). */
    zoom: number;
    /** Whether a mind node is currently selected. */
    hasSelection: boolean;
    /** Whether the current selection contains a deletable (non-root) node. */
    canDelete: boolean;
    /** Active layout of the focused mindmap (drives the select value). */
    layout?: MindLayoutType;
    onAddChild: () => void;
    onAddSibling: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onFit: () => void;
    onSetLayout: (layout: MindLayoutType) => void;
}

const LAYOUT_OPTIONS: Array<{ value: MindLayoutType; label: string }> = [
    { value: MindLayoutType.standard, label: "标准" },
    { value: MindLayoutType.right, label: "向右" },
    { value: MindLayoutType.left, label: "向左" },
    { value: MindLayoutType.downward, label: "向下" },
    { value: MindLayoutType.upward, label: "向上" },
];

const ICON_SIZE = 16;

const ToolButton: React.FC<{
    title: string;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}> = ({ title, onClick, disabled, children }) => (
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

export const MindmapToolbar: React.FC<MindmapToolbarProps> = ({
    canUndo,
    canRedo,
    zoom,
    hasSelection,
    canDelete,
    layout,
    onAddChild,
    onAddSibling,
    onEdit,
    onDelete,
    onUndo,
    onRedo,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onFit,
    onSetLayout,
}) => {
    // Prevent the toolbar from stealing focus / clearing the board selection
    // when a button is pressed (mousedown blurs the active mind node otherwise).
    const preventBlur = (e: React.MouseEvent) => e.preventDefault();

    return (
        <div className="drawnix-toolbar" onMouseDown={preventBlur}>
            <div className="drawnix-toolbar-group">
                <ToolButton title="添加子节点 (Tab)" onClick={onAddChild}>
                    <Plus size={ICON_SIZE} />
                </ToolButton>
                <ToolButton
                    title="添加同级节点 (Enter)"
                    onClick={onAddSibling}
                    disabled={!hasSelection}
                >
                    <CornerDownRight size={ICON_SIZE} />
                </ToolButton>
                <ToolButton
                    title="编辑节点 (双击)"
                    onClick={onEdit}
                    disabled={!hasSelection}
                >
                    <Pencil size={ICON_SIZE} />
                </ToolButton>
                <ToolButton
                    title="删除节点 (Delete)"
                    onClick={onDelete}
                    disabled={!canDelete}
                >
                    <Trash2 size={ICON_SIZE} />
                </ToolButton>
            </div>

            <span className="drawnix-toolbar-sep" />

            <div className="drawnix-toolbar-group">
                <ToolButton title="撤销 (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
                    <Undo2 size={ICON_SIZE} />
                </ToolButton>
                <ToolButton title="重做 (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
                    <Redo2 size={ICON_SIZE} />
                </ToolButton>
            </div>

            <span className="drawnix-toolbar-sep" />

            <div className="drawnix-toolbar-group">
                <ToolButton title="缩小" onClick={onZoomOut}>
                    <ZoomOut size={ICON_SIZE} />
                </ToolButton>
                <button
                    type="button"
                    className="drawnix-tool-zoom"
                    title="重置缩放"
                    onClick={onZoomReset}
                >
                    {Math.round(zoom)}%
                </button>
                <ToolButton title="放大" onClick={onZoomIn}>
                    <ZoomIn size={ICON_SIZE} />
                </ToolButton>
                <ToolButton title="适应画布" onClick={onFit}>
                    <Maximize2 size={ICON_SIZE} />
                </ToolButton>
            </div>

            <span className="drawnix-toolbar-sep" />

            <select
                className="drawnix-toolbar-layout"
                title="布局"
                value={layout ?? MindLayoutType.standard}
                onChange={(e) => onSetLayout(e.target.value as MindLayoutType)}
            >
                {LAYOUT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
};
