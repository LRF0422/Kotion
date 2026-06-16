import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Board, BoardChangeData, Wrapper } from '@plait-board/react-board';
import {
    PlaitBoard,
    PlaitElement,
    PlaitBoardOptions,
    ThemeColorMode,
    BoardTransforms,
    CoreTransforms,
    PlaitPointerType,
} from '@plait/core';
import { withDraw } from '@plait/draw';
import {
    withMind,
    withMindExtend,
    MindThemeColors,
    MindTransforms,
    getSelectedMindElements,
    getRootLayout,
    editTopic,
    type MindElement,
} from '@plait/mind';
import { withGroup } from '@plait/common';
import { MindLayoutType } from '@plait/layouts';
import { initializeData } from "./data";
import { MindmapToolbar } from "./MindmapToolbar";
import { useTheme } from "@kn/ui";
import "./style/index.css";

import '../../node_modules/@plait-board/react-board/index.css';
import '../../node_modules/@plait-board/react-text/index.css';
import '../../node_modules/@plait/mind/styles/styles.scss';

// ============================================================
// Mindmap-only View Component
// ============================================================

const ZOOM_STEP = 0.1;

// Find the mindmap root element on the board (the deletable/layout anchor).
function getRootElement(board: PlaitBoard): MindElement | null {
    const root = (board.children as any[]).find((c) => c?.isRoot);
    return (root ?? board.children[0] ?? null) as MindElement | null;
}

export const DrawnixView: React.FC<NodeViewProps> = (props) => {
    const { updateAttributes } = props;
    const { theme } = useTheme();
    const { node } = props;
    const { data } = node.attrs;
    const isDark = theme === 'dark';

    const containerRef = useRef<HTMLDivElement>(null);
    const boardRef = useRef<PlaitBoard | null>(null);
    const [boardKey, setBoardKey] = useState(0);

    // Toolbar-driving state (kept in sync with the board on every change)
    const [selected, setSelected] = useState<MindElement[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [zoomPercent, setZoomPercent] = useState(100);
    const [layout, setLayout] = useState<MindLayoutType | undefined>(undefined);

    // Plugins — mindmap only
    const plugins = useMemo(() => {
        return [withDraw, withGroup, withMind, withMindExtend];
    }, []);

    // Board options
    const options: PlaitBoardOptions = useMemo(() => ({
        readonly: false,
        hideScrollbar: false,
        disabledScrollOnNonFocus: false,
        themeColors: MindThemeColors,
    }), []);

    // Get initial data — always use mindmap data
    const getInitialData = useCallback((): PlaitElement[] => {
        return data?.children || initializeData;
    }, [data]);

    // Board theme
    const boardTheme = useMemo(() => ({
        themeColorMode: isDark ? ThemeColorMode.dark : ThemeColorMode.colorful,
    }), [isDark]);

    // Read the current board state into React state so the toolbar reflects it
    const refreshState = useCallback((board: PlaitBoard) => {
        setSelected(getSelectedMindElements(board));
        setCanUndo((board.history?.undos?.length ?? 0) > 0);
        setCanRedo((board.history?.redos?.length ?? 0) > 0);
        setZoomPercent(Math.round((board.viewport?.zoom ?? 1) * 100));
        const root = getRootElement(board);
        if (root) {
            try {
                setLayout(getRootLayout(root));
            } catch {
                // root may be transiently malformed during edits; ignore
            }
        }
    }, []);

    // Re-read state after an imperative SDK mutation has been applied
    const scheduleRefresh = useCallback(() => {
        requestAnimationFrame(() => {
            if (boardRef.current) refreshState(boardRef.current);
        });
    }, [refreshState]);

    // Handle board changes — persist + sync toolbar state
    const handleChange = useCallback((value: BoardChangeData) => {
        updateAttributes({
            ...props.node.attrs,
            data: {
                children: value.children,
                viewport: value.viewport
            }
        });
        if (boardRef.current) refreshState(boardRef.current);
    }, [props.node.attrs, updateAttributes, refreshState]);

    const handleSelectionChange = useCallback(() => {
        if (boardRef.current) refreshState(boardRef.current);
    }, [refreshState]);

    // After board init
    const handleAfterInit = useCallback((board: PlaitBoard) => {
        boardRef.current = board;
        // Initialize with selection pointer for mindmap interaction
        BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
        refreshState(board);
        // Trigger resize for viewport initialization
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }, [refreshState]);

    // ----------------------------------------------------------------
    // Toolbar handlers (all backed by the plait SDK)
    // ----------------------------------------------------------------

    const onAddChild = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        const sel = getSelectedMindElements(board);
        const target = sel[0] ?? getRootElement(board);
        if (!target) return;
        MindTransforms.insertChildNode(board as any, target);
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onAddSibling = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        const el = getSelectedMindElements(board)[0];
        if (!el) return;
        // Root has no siblings — add a child instead so the action still works
        if ((el as any).isRoot) {
            MindTransforms.insertChildNode(board as any, el);
        } else {
            MindTransforms.insertSiblingNode(board as any, el);
        }
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onEdit = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        const el = getSelectedMindElements(board)[0];
        if (el) editTopic(el);
    }, []);

    const onDelete = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        const removable = getSelectedMindElements(board).filter((e) => !(e as any).isRoot);
        if (removable.length === 0) return;
        CoreTransforms.removeElements(board, removable);
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onUndo = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        board.undo();
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onRedo = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        board.redo();
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onZoomIn = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        BoardTransforms.updateZoom(board, (board.viewport?.zoom ?? 1) + ZOOM_STEP);
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onZoomOut = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        BoardTransforms.updateZoom(board, (board.viewport?.zoom ?? 1) - ZOOM_STEP);
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onZoomReset = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        BoardTransforms.updateZoom(board, 1);
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onFit = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        BoardTransforms.fitViewport(board);
        scheduleRefresh();
    }, [scheduleRefresh]);

    const onSetLayout = useCallback((type: MindLayoutType) => {
        const board = boardRef.current;
        if (!board) return;
        MindTransforms.setLayout(board, type);
        scheduleRefresh();
    }, [scheduleRefresh]);

    // Re-mount board when theme changes so Plait picks up the new ThemeColorMode
    useEffect(() => {
        setBoardKey(prev => prev + 1);
    }, [isDark]);

    // Prevent events from bubbling to ProseMirror
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => e.stopPropagation();
        const handlePointerDown = (e: PointerEvent) => e.stopPropagation();
        const handleDragStart = (e: DragEvent) => e.preventDefault();
        const handleSelectStart = (e: Event) => e.preventDefault();

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('pointerdown', handlePointerDown);
        container.addEventListener('dragstart', handleDragStart);
        container.addEventListener('selectstart', handleSelectStart);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('pointerdown', handlePointerDown);
            container.removeEventListener('dragstart', handleDragStart);
            container.removeEventListener('selectstart', handleSelectStart);
        };
    }, []);

    const hasSelection = selected.length > 0;
    const canDelete = selected.some((e) => !(e as any).isRoot);

    return (
        <NodeViewWrapper className="w-full">
            <div
                ref={containerRef}
                className={`drawnix-native ${isDark ? 'drawnix-dark' : ''}`}
            >
                <MindmapToolbar
                    canUndo={canUndo}
                    canRedo={canRedo}
                    zoom={zoomPercent}
                    hasSelection={hasSelection}
                    canDelete={canDelete}
                    layout={layout}
                    onAddChild={onAddChild}
                    onAddSibling={onAddSibling}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onZoomIn={onZoomIn}
                    onZoomOut={onZoomOut}
                    onZoomReset={onZoomReset}
                    onFit={onFit}
                    onSetLayout={onSetLayout}
                />
                <div className="drawnix-board-area">
                    <Wrapper
                        key={boardKey}
                        value={getInitialData()}
                        viewport={data?.viewport}
                        theme={boardTheme}
                        options={options}
                        plugins={plugins}
                        onChange={handleChange}
                        onSelectionChange={handleSelectionChange}
                    >
                        <Board afterInit={handleAfterInit} />
                    </Wrapper>
                </div>
            </div>
        </NodeViewWrapper>
    );
};
