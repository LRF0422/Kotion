import { Eye, EyeOff, Layers3, Lock, LockOpen, Plus, Trash2 } from "@kn/icon";
import { Button, Input, ScrollArea } from "@kn/ui";
import React, { useMemo, useState } from "react";
import { getContainerParent } from "../composites";
import type { Layer, Page } from "../model/types";

export function LayersPanel({
  page,
  selection,
  editable,
  onAdd,
  onRename,
  onDelete,
  onToggleVisible,
  onToggleLocked,
  onMoveSelection,
  onSelectElement,
}: {
  page: Page;
  selection: string[];
  editable: boolean;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onToggleVisible: (layer: Layer) => void;
  onToggleLocked: (layer: Layer) => void;
  onMoveSelection: (layerId: string) => void;
  onSelectElement: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const nodeById = useMemo(
    () => new Map(page.graph.nodes.map((node) => [node.id, node])),
    [page.graph.nodes],
  );
  const save = () => {
    if (editingId && name.trim()) onRename(editingId, name.trim());
    setEditingId(null);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 items-center justify-between border-b px-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Layers3 className="h-4 w-4" />
          图层
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          disabled={!editable}
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {[...page.layers].reverse().map((layer) => (
            <div key={layer.id} className="rounded-md border bg-card">
              <div className="flex min-h-11 items-center gap-1 px-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => onToggleVisible(layer)}
                >
                  {layer.visible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => onToggleLocked(layer)}
                >
                  {layer.locked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <LockOpen className="h-4 w-4" />
                  )}
                </Button>
                {editingId === layer.id ? (
                  <Input
                    autoFocus
                    value={name}
                    className="h-9 min-w-0 flex-1 text-xs"
                    onChange={(event) => setName(event.target.value)}
                    onBlur={save}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") save();
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="min-h-10 min-w-0 flex-1 truncate text-left text-xs font-medium"
                    onDoubleClick={() => {
                      if (!editable) return;
                      setEditingId(layer.id);
                      setName(layer.name);
                    }}
                    onClick={() => {
                      if (selection.length) onMoveSelection(layer.id);
                    }}
                  >
                    {layer.name}
                  </button>
                )}
                {page.layers.length > 1 && layer.id !== "layer-1" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(layer.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="border-t px-2 py-1">
                {[...layer.elementIds].reverse().map((id) => {
                  const node = nodeById.get(id);
                  const parentId = node ? getContainerParent(node) : undefined;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="flex min-h-11 w-full items-center truncate rounded px-2 text-left text-[11px] text-muted-foreground hover:bg-accent"
                      style={{ paddingLeft: parentId ? "1.5rem" : "0.5rem" }}
                      title={parentId ? `${id} · ${parentId}` : id}
                      onClick={() => onSelectElement(id)}
                    >
                      {parentId && <span className="mr-1 opacity-50">↳</span>}
                      {id}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
