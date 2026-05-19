import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Board, BoardChangeData, Wrapper } from '@plait-board/react-board';
import {
    PlaitBoard,
    PlaitElement,
    PlaitBoardOptions,
    ThemeColorMode,
    BoardTransforms,
    PlaitPointerType,
    Viewport,
} from '@plait/core';
import { withDraw } from '@plait/draw';
import { withMind, withMindExtend, MindThemeColors } from '@plait/mind';
import { withGroup } from '@plait/common';
import { initializeData } from "./data";
import { useTheme } from "@kn/ui";
import "./style/index.css";

import '../../node_modules/@plait-board/react-board/index.css';
import '../../node_modules/@plait-board/react-text/index.css';
import '../../node_modules/@plait/mind/styles/styles.scss';

// ============================================================
// Mindmap-only View Component
// ============================================================

export const DrawnixView: React.FC<NodeViewProps> = (props) => {
    const { updateAttributes, editor } = props;
    const { theme } = useTheme();
    const { node } = props;
    const { data } = node.attrs;
    const isDark = theme === 'dark';

    const containerRef = useRef<HTMLDivElement>(null);
    const boardRef = useRef<PlaitBoard | null>(null);
    const [boardKey, setBoardKey] = useState(0);

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

    // Handle board changes
    const handleChange = useCallback((value: BoardChangeData) => {
        updateAttributes({
            ...props.node.attrs,
            data: {
                children: value.children,
                viewport: value.viewport
            }
        });
    }, [props.node.attrs, updateAttributes]);

    // After board init
    const handleAfterInit = useCallback((board: PlaitBoard) => {
        boardRef.current = board;
        // Initialize with selection pointer for mindmap interaction
        BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
        // Trigger resize for viewport initialization
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }, []);

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

    return (
        <NodeViewWrapper className="w-full">
            <div
                ref={containerRef}
                className={`drawnix-native ${isDark ? 'drawnix-dark' : ''}`}
            >
                <div className="drawnix-board-area">
                    <Wrapper
                        key={boardKey}
                        value={getInitialData()}
                        viewport={data?.viewport}
                        theme={boardTheme}
                        options={options}
                        plugins={plugins}
                        onChange={handleChange}
                    >
                        <Board afterInit={handleAfterInit} />
                    </Wrapper>
                </div>
            </div>
        </NodeViewWrapper>
    );
};