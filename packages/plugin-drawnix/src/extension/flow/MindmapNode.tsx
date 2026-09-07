import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import React, { memo, useEffect, useRef, useState } from "react";
import type { MindmapDirection } from "../layout/tree-layout";
import type { MindmapNodeStylePatch } from "../model/operations";
import type { MindmapNode as SemanticMindmapNode } from "../model/types";
import { MindmapNodeToolbar } from "./MindmapNodeToolbar";

export interface MindmapFlowNodeData extends Record<string, unknown> {
  semanticNode: SemanticMindmapNode;
  direction: MindmapDirection;
  isRoot: boolean;
  isEditable: boolean;
  isEditing: boolean;
  toolbarVisible: boolean;
  draftText: string;
  onAddChild: (nodeId: string) => void;
  onAddSibling: (nodeId: string) => void;
  onDraftTextChange: (value: string) => void;
  onStartEdit: (nodeId: string) => void;
  onCommitEdit: (value?: string) => void;
  onCancelEdit: () => void;
  onPreviewStyle: (nodeId: string, patch: MindmapNodeStylePatch) => void;
  onCommitStylePreview: () => void;
  onSetStyle: (nodeId: string, patch: MindmapNodeStylePatch | null) => void;
  onUpdateHref: (nodeId: string, href: string | null) => boolean;
  onToggleCollapsed: (nodeId: string) => void;
}

export type MindmapFlowNode = Node<MindmapFlowNodeData, "mindmap">;

const HANDLE_POSITIONS = [
  ["source-left", "source", Position.Left],
  ["source-right", "source", Position.Right],
  ["source-top", "source", Position.Top],
  ["source-bottom", "source", Position.Bottom],
  ["target-left", "target", Position.Left],
  ["target-right", "target", Position.Right],
  ["target-top", "target", Position.Top],
  ["target-bottom", "target", Position.Bottom],
] as const;

function MindmapNodeComponent({ data, selected }: NodeProps<MindmapFlowNode>) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const cancelledRef = useRef(false);
  const [localText, setLocalText] = useState(data.draftText);
  const node = data.semanticNode;

  useEffect(() => {
    if (data.isEditing) {
      cancelledRef.current = false;
      setLocalText(data.draftText);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [data.isEditing]);

  return (
    <div
      className={`drawnix-mind-node direction-${data.direction} ${data.isRoot ? "is-root" : ""} ${selected ? "is-selected" : ""}`}
      onDoubleClick={() => data.onStartEdit(node.id)}
    >
      <MindmapNodeToolbar
        node={node}
        selected={selected && data.toolbarVisible}
        isEditable={data.isEditable}
        isEditing={data.isEditing}
        onAddChild={() => data.onAddChild(node.id)}
        onAddSibling={() => data.onAddSibling(node.id)}
        onPreviewStyle={(patch) => data.onPreviewStyle(node.id, patch)}
        onCommitStylePreview={data.onCommitStylePreview}
        onSetStyle={(patch) => data.onSetStyle(node.id, patch)}
        onUpdateHref={(href) => data.onUpdateHref(node.id, href)}
      />
      {HANDLE_POSITIONS.map(([id, type, position]) => (
        <Handle
          key={id}
          id={id}
          type={type}
          position={position}
          isConnectable={false}
          className="drawnix-handle"
        />
      ))}
      {data.isEditing ? (
        <textarea
          ref={inputRef}
          className="drawnix-node-input nodrag nopan nowheel"
          value={localText}
          rows={Math.max(1, localText.split("\n").length)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            setLocalText(event.currentTarget.value);
            data.onDraftTextChange(event.currentTarget.value);
          }}
          onChange={(event) => {
            const value = event.target.value;
            setLocalText(value);
            if (!composingRef.current) data.onDraftTextChange(value);
          }}
          onBlur={() => {
            if (cancelledRef.current) {
              cancelledRef.current = false;
              return;
            }
            data.onDraftTextChange(localText);
            data.onCommitEdit(localText);
          }}
          onKeyDown={(event) => {
            if (
              event.nativeEvent.isComposing ||
              event.keyCode === 229 ||
              composingRef.current
            )
              return;
            if (event.key === "Escape") {
              event.preventDefault();
              cancelledRef.current = true;
              data.onCancelEdit();
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              data.onCommitEdit(localText);
            }
          }}
        />
      ) : (
        <span className="drawnix-node-text">{node.text || "未命名节点"}</span>
      )}
      {node.children.length > 0 && (
        <button
          type="button"
          className="drawnix-collapse-button nodrag nopan"
          aria-label={node.collapsed ? "展开子节点" : "折叠子节点"}
          title={node.collapsed ? "展开子节点" : "折叠子节点"}
          disabled={!data.isEditable}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleCollapsed(node.id);
          }}
        >
          {node.collapsed ? node.children.length : "−"}
        </button>
      )}
    </div>
  );
}

export const MindmapNode = memo(MindmapNodeComponent);
