import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import React, { useEffect, useState } from "react";
import { BoardTransforms, PlaitBoard, ThemeColorMode } from "@plait/core";

import "../../node_modules/@plait/mind/styles/styles.scss";
import "../../node_modules/@plait-board/react-board/index.css";
import "../../node_modules/@plait-board/react-text/index.css";
import { OnlyMind } from "./only-mind";
import { initializeData } from "./data";
import { useTheme } from "@kn/ui";
import "./style/index.css";

export const DrawnixView: React.FC<NodeViewProps> = (props) => {
  const { updateAttributes, editor, node } = props;
  const { theme } = useTheme();
  const { data } = node.attrs;
  const [board, setBoard] = useState<PlaitBoard>();

  // 当前思维导图的数据（PlaitElement[]）
  const currentChildren = (data?.children || initializeData) as any[];

  const handleAddNode = () => {
    if (!editor.isEditable) return;
    if (!currentChildren.length) return;

    const root = currentChildren[0] || {};
    const rootChildren = Array.isArray(root.children) ? root.children : [];
    const template = rootChildren[0] || {
      id: "",
      data: {
        topic: {
          children: [{ text: "" }],
        },
      },
      children: [],
      width: 42,
      height: 20,
    };

    const newId = `node_${Math.random().toString(36).slice(2, 8)}`;

    const newNode = {
      ...template,
      id: newId,
      data: {
        ...template.data,
        topic: {
          ...(template.data?.topic || {}),
          children: [{ text: "新节点" }],
        },
      },
    };

    const newRoot = {
      ...root,
      children: [...rootChildren, newNode],
    };

    const newChildren = [newRoot, ...currentChildren.slice(1)];

    updateAttributes({
      ...node.attrs,
      data: {
        ...(data || {}),
        children: newChildren,
      },
    });
  };

  const handleDeleteNode = () => {
    if (!editor.isEditable) return;
    if (!currentChildren.length) return;

    const root = currentChildren[0] || {};
    const rootChildren = Array.isArray(root.children) ? root.children : [];

    // 保证至少保留一个子节点，避免全部删光导致结构异常
    if (rootChildren.length <= 1) return;

    const newRoot = {
      ...root,
      children: rootChildren.slice(0, rootChildren.length - 1),
    };

    const newChildren = [newRoot, ...currentChildren.slice(1)];

    updateAttributes({
      ...node.attrs,
      data: {
        ...(data || {}),
        children: newChildren,
      },
    });
  };

  useEffect(() => {
    if (board) {
      if (theme === "dark") {
        BoardTransforms.updateThemeColor(board, ThemeColorMode.dark);
      } else {
        BoardTransforms.updateThemeColor(board, ThemeColorMode.colorful);
      }
    }
  }, [theme, board]);

  useEffect(() => {
    if (board) {
      BoardTransforms.fitViewport(board);
    }
  }, [board]);

  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper className="w-full h-[400px] shadow-md">
      <div className="w-full h-full flex flex-col bg-white">
        {isEditable && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
            <span className="text-sm font-medium text-slate-700">
              Drawnix 思维导图
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100"
                type="button"
                onClick={handleAddNode}
              >
                添加节点
              </button>
              <button
                className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100"
                type="button"
                onClick={handleDeleteNode}
              >
                删除节点
              </button>
            </div>
          </div>
        )}
        <div className="flex-1">
          <OnlyMind
            className="h-full w-full"
            readonly={!isEditable}
            value={currentChildren}
            viewport={data?.viewport}
            theme={
              theme === "dark"
                ? { themeColorMode: ThemeColorMode.dark }
                : { themeColorMode: ThemeColorMode.colorful }
            }
            onChange={(value) => {
              updateAttributes({
                ...node.attrs,
                data: value,
              });
            }}
            afterInit={(boardInstance) => {
              setBoard(boardInstance);
            }}
          ></OnlyMind>
        </div>
      </div>
    </NodeViewWrapper>
  );
};