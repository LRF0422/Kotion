import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useEffect, useState } from "react";
import { BoardTransforms, PlaitBoard, ThemeColorMode, PlaitElement } from '@plait/core';
import { MindElement } from '@plait/mind';

import '../../node_modules/@plait/mind/styles/styles.scss';
import '../../node_modules/@plait-board/react-board/index.css';
import '../../node_modules/@plait-board/react-text/index.css';
import { OnlyMind } from "./only-mind";
import { initializeData } from "./data";
import { useTheme, Button } from "@kn/ui";
import "./style/index.css";
import { nanoid } from "nanoid"


export const DrawnixView: React.FC<NodeViewProps> = (props) => {

    const { updateAttributes, editor } = props;
    const { theme } = useTheme()
    const { node } = props
    const { data } = node.attrs
    const [board, setBoard] = useState<PlaitBoard>();
    const [selectedNode, setSelectedNode] = useState<PlaitElement | null>(null);
    const isEditable = editor.isEditable;

    useEffect(() => {
        if (board) {
            if (theme === 'dark') {
                BoardTransforms.updateThemeColor(board, ThemeColorMode.dark);
            } else {
                BoardTransforms.updateThemeColor(board, ThemeColorMode.colorful);
            }
        }
    }, [theme])

    useEffect(() => {
        if (board) {
            BoardTransforms.fitViewport(board)
        }
    }, [board])

    /**
     * Add a child node to the currently selected node (or root if none selected)
     */
    const addChildNode = () => {
        if (!board) return;

        const target = selectedNode || board.children[0];
        if (!target) return;

        const newNode: any = {
            id: nanoid(6),
            data: {
                topic: {
                    children: [{ text: '新节点' }]
                }
            },
            children: [],
            width: 42,
            height: 20
        };

        // Add as child to the selected node
        const targetNode = target as MindElement;
        if (!targetNode.children) {
            targetNode.children = [];
        }
        targetNode.children.push(newNode);

        // Update board
        const newChildren = [...board.children];
        updateAttributes({
            ...props.node.attrs,
            data: { children: newChildren, viewport: data?.viewport }
        });
    };

    /**
     * Delete the currently selected node and all its children
     * Root node cannot be deleted
     */
    const deleteNode = () => {
        if (!board || !selectedNode) return;

        const rootNode = board.children[0] as MindElement;
        if (selectedNode === rootNode || (selectedNode as any).id === (rootNode as any).id) {
            return; // Cannot delete root node
        }

        // Recursively remove node and its children
        const removeNodeById = (nodes: any[], nodeId: string): any[] => {
            return nodes.filter(node => {
                if (node.id === nodeId) {
                    return false;
                }
                if (node.children && node.children.length > 0) {
                    node.children = removeNodeById(node.children, nodeId);
                }
                return true;
            });
        };

        const selectedId = (selectedNode as any).id;
        const newChildren = removeNodeById([...board.children], selectedId);

        updateAttributes({
            ...props.node.attrs,
            data: { children: newChildren, viewport: data?.viewport }
        });

        setSelectedNode(null);
    };

    return <NodeViewWrapper className="w-full shadow-md">
        <div className="w-full h-[400px]">
            <OnlyMind
                className="h-full w-full"
                readonly={!props.editor.isEditable}
                value={data?.children || initializeData}
                viewport={data?.viewport}
                theme={theme === 'dark' ? { themeColorMode: ThemeColorMode.dark } : { themeColorMode: ThemeColorMode.colorful }}
                onChange={(value) => {
                    updateAttributes({
                        ...props.node.attrs,
                        data: value
                    });
                }}
                onSelectionChange={(selection) => {

                }}
                afterInit={(board) => {
                    setBoard(board);
                }}
            ></OnlyMind>
        </div>
    </NodeViewWrapper>
}