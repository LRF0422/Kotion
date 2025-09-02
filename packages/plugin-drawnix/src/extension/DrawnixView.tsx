import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useEffect, useState } from "react";
import { BoardTransforms, PlaitBoard, PlaitElement, PlaitTheme, Selection, ThemeColorMode, Viewport } from '@plait/core';

import '../../node_modules/@plait/mind/styles/styles.scss';
import '../../node_modules/@plait-board/react-board/index.css';
import '../../node_modules/@plait-board/react-text/index.css';
import { OnlyMind } from "./only-mind";
import { initializeData } from "./data";
import { useTheme } from "@kn/ui";


export const DrawnixView: React.FC<NodeViewProps> = (props) => {

    const { updateAttributes } = props;
    const { theme } = useTheme()
    const { node } = props
    const { data } = node.attrs
    const [board, setBoard] = useState<PlaitBoard>();

    useEffect(() => {
        if (board) {
            if (theme === 'dark') {
                BoardTransforms.updateThemeColor(board, ThemeColorMode.dark);
            } else {
                BoardTransforms.updateThemeColor(board, ThemeColorMode.default);
            }
        }
    }, [theme])

    return <NodeViewWrapper className="w-full h-[400px]">
        <OnlyMind
            readonly={!props.editor.isEditable}
            value={data.children || initializeData}
            viewport={data.viewport}
            theme={theme === 'dark' ? { themeColorMode: ThemeColorMode.dark } : { themeColorMode: ThemeColorMode.colorful }}
            onChange={(value) => {
                updateAttributes({
                    ...props.node.attrs,
                    data: value
                });
            }}
            afterInit={(board) => {
                setBoard(board);
                console.log('board initialized');
            }}
        ></OnlyMind>
    </NodeViewWrapper>
}