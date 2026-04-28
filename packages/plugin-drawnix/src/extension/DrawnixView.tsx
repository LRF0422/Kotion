import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
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
import { withDraw, BasicShapes, ArrowLineShape } from '@plait/draw';
import { withMind, withMindExtend, MindThemeColors, MindPointerType } from '@plait/mind';
import { withGroup, setCreationMode, BoardCreationMode } from '@plait/common';
import { initializeData } from "./data";
import { useTheme } from "@kn/ui";
import { withFreehand } from "./plugins/with-freehand";
import { withFreehandCreate } from "./plugins/with-freehand-create";
import { withEraser, ERASER_TYPE } from "./plugins/with-eraser";
import { FREEHAND_TYPE } from "./plugins/with-freehand";
import "./style/index.css";

import '../../node_modules/@plait-board/react-board/index.css';
import '../../node_modules/@plait-board/react-text/index.css';
import '../../node_modules/@plait/mind/styles/styles.scss';

// ============================================================
// Tool types for the toolbar
// ============================================================

type ToolType = 'hand' | 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'pen' | 'arrow' | 'eraser' | 'mind';

function getPointerForTool(tool: ToolType): string {
    switch (tool) {
        case 'hand': return PlaitPointerType.hand;
        case 'select': return PlaitPointerType.selection;
        case 'rectangle': return BasicShapes.rectangle;
        case 'ellipse': return BasicShapes.ellipse;
        case 'diamond': return BasicShapes.diamond;
        case 'text': return BasicShapes.text;
        case 'arrow': return ArrowLineShape.straight;
        case 'pen': return FREEHAND_TYPE;
        case 'eraser': return ERASER_TYPE;
        case 'mind': return MindPointerType.mind;
    }
}

// Tools that need the board in "drawing" creation mode
const DRAWING_TOOLS: ToolType[] = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'pen', 'mind'];

function getCursorForTool(tool: ToolType): string {
    switch (tool) {
        case 'hand': return 'grab';
        case 'eraser': return 'crosshair';
        case 'pen': return 'crosshair';
        default: return 'default';
    }
}

// ============================================================
// SVG Icons (minimal inline SVGs for each tool)
// ============================================================

const icons: Record<ToolType, React.ReactNode> = {
    hand: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" /><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" /><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>,
    select: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="m13 13 6 6" /></svg>,
    rectangle: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>,
    ellipse: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="6" /></svg>,
    diamond: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 12l10 10 10-10L12 2z" /></svg>,
    text: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" x2="15" y1="20" y2="20" /><line x1="12" x2="12" y1="4" y2="20" /></svg>,
    pen: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>,
    arrow: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>,
    eraser: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>,
    mind: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="9" /><line x1="12" y1="15" x2="12" y2="22" /><line x1="2" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="22" y2="12" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></svg>,
};

// ============================================================
// Main View Component
// ============================================================

export const DrawnixView: React.FC<NodeViewProps> = (props) => {
    const { updateAttributes, editor } = props;
    const { theme } = useTheme();
    const { node } = props;
    const { data, mode } = node.attrs;
    const isDark = theme === 'dark';
    const isWhiteboard = mode === 'whiteboard' || !mode;

    const containerRef = useRef<HTMLDivElement>(null);
    const boardRef = useRef<PlaitBoard | null>(null);
    const [activeTool, setActiveTool] = useState<ToolType>('hand');
    const [zoom, setZoom] = useState(100);

    // Plugins configuration
    const plugins = useMemo(() => {
        if (isWhiteboard) {
            return [withDraw, withGroup, withMind, withMindExtend, withFreehand, withFreehandCreate, withEraser];
        }
        return [withDraw, withGroup, withMind, withMindExtend];
    }, [isWhiteboard]);

    // Board options
    const options: PlaitBoardOptions = useMemo(() => ({
        readonly: false,
        hideScrollbar: false,
        disabledScrollOnNonFocus: false,
        themeColors: MindThemeColors,
    }), []);

    // Get initial data
    const getInitialData = useCallback((): PlaitElement[] => {
        if (isWhiteboard) {
            return data?.children || [];
        }
        return data?.children || initializeData;
    }, [isWhiteboard, data]);

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

    // Handle viewport changes (for zoom display)
    const handleViewportChange = useCallback((viewport: Viewport) => {
        if (viewport?.zoom) {
            setZoom(Math.round(viewport.zoom * 100));
        }
    }, []);

    // After board init
    const handleAfterInit = useCallback((board: PlaitBoard) => {
        boardRef.current = board;
        // Initialize board with a known good state matching the default tool ('hand')
        BoardTransforms.updatePointerType(board, PlaitPointerType.hand);
        setCreationMode(board, BoardCreationMode.dnd);
        // Trigger resize for viewport initialization
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }, []);

    // Switch tool
    const switchTool = useCallback((tool: ToolType) => {
        const board = boardRef.current;
        if (!board) return;

        const pointer = getPointerForTool(tool);
        BoardTransforms.updatePointerType(board, pointer);

        // Always reset creation mode so non-drawing tools (hand/select/eraser)
        // are not blocked after using a shape/pen tool.
        setCreationMode(
            board,
            DRAWING_TOOLS.includes(tool) ? BoardCreationMode.drawing : BoardCreationMode.dnd
        );

        // Update cursor
        const container = containerRef.current;
        if (container) {
            const boardEl = container.querySelector('.plait-board-container');
            if (boardEl) {
                (boardEl as HTMLElement).style.cursor = getCursorForTool(tool);
            }
        }

        setActiveTool(tool);
    }, []);

    // Zoom controls
    const handleZoomIn = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        const newZoom = Math.min(board.viewport.zoom + 0.1, 5);
        BoardTransforms.updateZoom(board, newZoom);
        setZoom(Math.round(newZoom * 100));
    }, []);

    const handleZoomOut = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        const newZoom = Math.max(board.viewport.zoom - 0.1, 0.1);
        BoardTransforms.updateZoom(board, newZoom);
        setZoom(Math.round(newZoom * 100));
    }, []);

    const handleZoomReset = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        BoardTransforms.updateZoom(board, 1);
        setZoom(100);
    }, []);

    // Prevent wheel/pointer events from bubbling to ProseMirror (use bubble phase)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => e.stopPropagation();
        const handlePointerDown = (e: PointerEvent) => e.stopPropagation();

        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('pointerdown', handlePointerDown);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('pointerdown', handlePointerDown);
        };
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle shortcuts when the board area is focused
            if (!container.contains(e.target as Node)) return;

            const key = e.key.toLowerCase();
            const shortcuts: Record<string, ToolType> = {
                'h': 'hand', 'v': 'select', 'r': 'rectangle',
                'o': 'ellipse', 'd': 'diamond', 't': 'text',
                'p': 'pen', 'a': 'arrow', 'e': 'eraser', 'm': 'mind',
            };
            if (shortcuts[key] && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                switchTool(shortcuts[key]);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [switchTool]);

    // Drawing tools definition
    const drawingTools: { tool: ToolType; label: string; shortcut: string }[] = [
        { tool: 'hand', label: 'Hand', shortcut: 'H' },
        { tool: 'select', label: 'Select', shortcut: 'V' },
        { tool: 'rectangle', label: 'Rectangle', shortcut: 'R' },
        { tool: 'ellipse', label: 'Ellipse', shortcut: 'O' },
        { tool: 'diamond', label: 'Diamond', shortcut: 'D' },
        { tool: 'text', label: 'Text', shortcut: 'T' },
        { tool: 'arrow', label: 'Arrow', shortcut: 'A' },
        { tool: 'pen', label: 'Pen', shortcut: 'P' },
        { tool: 'eraser', label: 'Eraser', shortcut: 'E' },
        { tool: 'mind', label: 'Mind Map', shortcut: 'M' },
    ];

    return (
        <NodeViewWrapper className="w-full">
            <div
                ref={containerRef}
                className={`drawnix-native ${isDark ? 'drawnix-dark' : ''}`}
            >
                {/* Board */}
                <div className="drawnix-board-area">
                    <Wrapper
                        value={getInitialData()}
                        viewport={data?.viewport}
                        theme={boardTheme}
                        options={options}
                        plugins={plugins}
                        onChange={handleChange}
                        onViewportChange={handleViewportChange}
                    >
                        <Board afterInit={handleAfterInit} />
                    </Wrapper>
                </div>

                {/* Floating toolbar — centered at top */}
                <div className="drawnix-toolbar">
                    {drawingTools.map(({ tool, label, shortcut }) => (
                        <button
                            key={tool}
                            className={`drawnix-tool-btn ${activeTool === tool ? 'active' : ''}`}
                            onClick={() => switchTool(tool)}
                            title={`${label} (${shortcut})`}
                        >
                            {icons[tool]}
                        </button>
                    ))}
                </div>

                {/* Floating zoom controls — top-right */}
                <div className="drawnix-zoom-controls">
                    <button className="drawnix-tool-btn" onClick={handleZoomOut} title="Zoom Out">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" x2="19" y1="12" y2="12" /></svg>
                    </button>
                    <button className="drawnix-zoom-display" onClick={handleZoomReset} title="Reset Zoom">
                        {zoom}%
                    </button>
                    <button className="drawnix-tool-btn" onClick={handleZoomIn} title="Zoom In">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>
                    </button>
                </div>
            </div>
        </NodeViewWrapper>
    );
};
