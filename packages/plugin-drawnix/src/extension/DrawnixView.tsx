import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Board, BoardChangeData, Wrapper } from '@plait-board/react-board';
import { PlaitBoard, PlaitBoardOptions, PlaitElement, ThemeColorMode, BoardTransforms, PlaitPlugin } from '@plait/core';
import { withMind } from '@plait/mind';
import { withDraw } from '@plait/draw';
import { withGroup } from '@plait/common';
import { initializeData } from "./data";
import { useTheme, Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { MousePointer2, Square, Circle, Diamond, Pencil, Type, Download, MoreHorizontal } from "@kn/icon";
import "./style/index.css";

import '../../node_modules/@plait-board/react-board/index.css';
import '../../node_modules/@plait-board/react-text/index.css';
import '../../node_modules/@plait/mind/styles/styles.scss';

export const DrawnixView: React.FC<NodeViewProps> = (props) => {

    const { updateAttributes, editor } = props;
    const { theme } = useTheme();
    const { node } = props;
    const { data, mode } = node.attrs;
    const [board, setBoard] = useState<PlaitBoard | null>(null);
    const [activeTool, setActiveTool] = useState<'select' | 'rectangle' | 'ellipse' | 'diamond' | 'pen' | 'text'>('select');
    const [showMenu, setShowMenu] = useState(true);
    const menuRef = useRef<HTMLDivElement>(null);
    const isEditable = editor.isEditable;

    // Get initial data based on mode
    const getInitialData = useCallback((): PlaitElement[] => {
        if (mode === 'whiteboard') {
            return data?.children || [];
        } else {
            // For mindmap mode, return mindmap data
            return data?.children || initializeData;
        }
    }, [mode, data]);

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

    // Update theme when it changes
    useEffect(() => {
        if (board) {
            if (theme === 'dark') {
                BoardTransforms.updateThemeColor(board, ThemeColorMode.dark);
            } else {
                BoardTransforms.updateThemeColor(board, ThemeColorMode.colorful);
            }
        }
    }, [theme, board]);

    // Fit viewport when board is ready
    useEffect(() => {
        if (board) {
            BoardTransforms.fitViewport(board);
        }
    }, [board]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Define plugins based on mode
    const plugins: PlaitPlugin[] = mode === 'whiteboard'
        ? [withDraw, withGroup, withMind]  // Enable drawing tools for whiteboard
        : [withMind];  // Just mind mapping for mindmap mode

    // Options for the board
    const options: PlaitBoardOptions = {
        readonly: !isEditable,
        hideScrollbar: false,
        disabledScrollOnNonFocus: false,
    };

    // Function to set the active tool on the board
    const setBoardTool = useCallback((tool: any) => {
        if (board) {
            // Set the active tool on the board
            (board as any).pointer = tool;
        }
    }, [board]);

    // Handle tool selection
    const handleToolSelect = useCallback((tool: 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'pen' | 'text') => {
        setActiveTool(tool);
        setBoardTool(tool);
    }, [setBoardTool]);

    // Export to PNG
    const handleExport = useCallback(() => {
        if (board) {
            // In a real implementation, this would trigger export functionality
            alert('Export functionality would be implemented here');
        }
    }, [board]);

    return (
        <NodeViewWrapper className="w-full shadow-md">
            <div className="w-full h-[500px] relative">
                {/* Toolbar */}
                {isEditable && mode === 'whiteboard' && (
                    <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-10 flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-1 border">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={activeTool === 'select' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleToolSelect('select')}
                                    >
                                        <MousePointer2 className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Select Tool</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={activeTool === 'rectangle' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleToolSelect('rectangle')}
                                    >
                                        <Square className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Rectangle</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={activeTool === 'ellipse' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleToolSelect('ellipse')}
                                    >
                                        <Circle className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Ellipse</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={activeTool === 'diamond' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleToolSelect('diamond')}
                                    >
                                        <Diamond className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Diamond</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={activeTool === 'pen' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleToolSelect('pen')}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Pen Tool</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={activeTool === 'text' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => handleToolSelect('text')}
                                    >
                                        <Type className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Text Tool</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleExport}
                                    >
                                        <Download className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Export</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                )}

                {/* Overflow menu button */}
                {isEditable && mode === 'whiteboard' && (
                    <div className="absolute top-2 right-2 z-10">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowMenu(!showMenu)}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>

                        {/* Dropdown menu */}
                        {showMenu && (
                            <div
                                ref={menuRef}
                                className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border z-20 overflow-hidden"
                            >
                                <div className="py-1">
                                    <button
                                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                                        onClick={() => {
                                            // Clear canvas functionality
                                            if (board) {
                                                updateAttributes({
                                                    ...props.node.attrs,
                                                    data: { children: [], viewport: undefined }
                                                });
                                                setShowMenu(false);
                                            }
                                        }}
                                    >
                                        Clear Canvas
                                    </button>
                                    <button
                                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                                        onClick={() => {
                                            // Change theme functionality
                                            setShowMenu(false);
                                        }}
                                    >
                                        Change Theme
                                    </button>
                                    <button
                                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                                        onClick={handleExport}
                                    >
                                        Export as PNG
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <Wrapper
                    value={getInitialData()}
                    viewport={data?.viewport}
                    theme={theme === 'dark' ? { themeColorMode: ThemeColorMode.dark } : { themeColorMode: ThemeColorMode.colorful }}
                    options={options}
                    plugins={plugins}
                    onChange={handleChange}
                    onSelectionChange={() => { }}
                    onViewportChange={() => { }}
                    onThemeChange={() => { }}
                    onValueChange={() => { }}
                >
                    <Board className="h-full w-full" afterInit={(initBoard) => {
                        setBoard(initBoard);
                    }} />
                </Wrapper>
            </div>
        </NodeViewWrapper>
    );
};