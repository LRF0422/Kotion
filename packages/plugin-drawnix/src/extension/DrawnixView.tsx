import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { Drawnix as DrawnixBoard } from '@drawnix/drawnix';
import { PlaitElement, ThemeColorMode, PlaitBoard } from '@plait/core';
import { initializeData } from "./data";
import { useTheme } from "@kn/ui";
import "./style/index.css";

import '../../node_modules/@drawnix/drawnix/index.css';
import '../../node_modules/@plait-board/react-board/index.css';
import '../../node_modules/@plait-board/react-text/index.css';
import '../../node_modules/@plait/mind/styles/styles.scss';

export const DrawnixView: React.FC<NodeViewProps> = (props) => {
    const { updateAttributes, editor } = props;
    const { theme } = useTheme();
    const { node } = props;
    const { data, mode } = node.attrs;
    const isEditable = editor.isEditable;
    const isWhiteboard = mode === 'whiteboard' || !mode;
    const isDark = theme === 'dark';

    // Ref for the container element
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle board initialization - dispatch resize so Plait viewport initializes correctly
    const handleAfterInit = useCallback((board: PlaitBoard) => {
        // Trigger a resize event so the board recalculates its viewport
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }, []);

    // Prevent wheel/pointer events from bubbling up to ProseMirror editor
    // We use BUBBLE phase (not capture) so events reach the Plait board first,
    // then we stop them from reaching the editor handlers above.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            // Stop the wheel event from reaching the editor/page scroll handler
            e.stopPropagation();
        };

        const handlePointerDown = (e: PointerEvent) => {
            // Stop ProseMirror from intercepting pointer events on the board
            // after the Plait board has already received the event
            e.stopPropagation();
        };

        // Both use bubble phase (no capture) so Plait board receives events first
        container.addEventListener('wheel', handleWheel, { passive: false });
        container.addEventListener('pointerdown', handlePointerDown);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('pointerdown', handlePointerDown);
        };
    }, []);

    // Track the drawnix-internal theme mode (can be changed via the theme toolbar dropdown)
    const [internalThemeMode, setInternalThemeMode] = useState<string | null>(null);

    // Determine if dark mode should be applied (either from app theme or from drawnix internal theme selector)
    const effectiveIsDark = isDark || internalThemeMode === 'dark' || internalThemeMode === 'starry';

    // Get initial data based on mode
    const getInitialData = useCallback((): PlaitElement[] => {
        if (isWhiteboard) {
            return data?.children || [];
        } else {
            return data?.children || initializeData;
        }
    }, [isWhiteboard, data]);

    // Handle board changes
    const handleChange = useCallback((value: any) => {
        updateAttributes({
            ...props.node.attrs,
            data: {
                children: value.children,
                viewport: value.viewport
            }
        });
    }, [props.node.attrs, updateAttributes]);

    // Compute theme prop for Drawnix - sync with app theme
    const drawnixTheme = useMemo(() => {
        const mode = isDark ? ThemeColorMode.dark : ThemeColorMode.colorful;
        return { themeColorMode: mode };
    }, [isDark]);

    // Handle theme changes from Drawnix's internal theme toolbar
    const handleThemeChange = useCallback((newTheme: any) => {
        if (newTheme?.themeColorMode) {
            setInternalThemeMode(newTheme.themeColorMode);
        }
    }, []);

    return (
        <NodeViewWrapper className="w-full shadow-md">
            <div
                ref={containerRef}
                className={`w-full h-[500px] relative drawnix-container ${effectiveIsDark ? 'drawnix-dark' : ''}`}
            >
                <DrawnixBoard
                    value={getInitialData()}
                    viewport={data?.viewport}
                    theme={drawnixTheme}
                    onChange={handleChange}
                    onThemeChange={handleThemeChange}
                    afterInit={handleAfterInit}
                />
            </div>
        </NodeViewWrapper>
    );
};
