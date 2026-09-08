import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus2,
  Pencil,
  Trash2,
  X,
} from "@kn/icon";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Input,
} from "@kn/ui";
import React, { useEffect, useRef, useState } from "react";
import type { Page } from "../model/types";

export function PageTabs({
  pages,
  activePageId,
  editable,
  dirtyPageIds,
  onSelect,
  onAdd,
  onDuplicate,
  onRename,
  onReorder,
  onDelete,
}: {
  pages: Page[];
  activePageId: string;
  editable: boolean;
  dirtyPageIds: string[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (id: string, index: number) => void;
  onDelete: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateScroll = () => {
    const element = scrollerRef.current;
    if (!element) return;
    setCanLeft(element.scrollLeft > 1);
    setCanRight(
      element.scrollLeft < element.scrollWidth - element.clientWidth - 1,
    );
  };
  useEffect(() => {
    updateScroll();
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateScroll);
    observer.observe(element);
    element.addEventListener("scroll", updateScroll);
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", updateScroll);
    };
  }, [pages.length]);

  const startRename = (page: Page) => {
    if (!editable) return;
    setEditingId(page.id);
    setName(page.name);
  };
  const saveRename = () => {
    if (editingId && name.trim()) onRename(editingId, name.trim());
    setEditingId(null);
  };

  return (
    <div className="logicflow-page-tabs">
      {editable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          title="新建页面"
          onClick={onAdd}
        >
          <FilePlus2 className="h-4 w-4" />
        </Button>
      )}
      {canLeft && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() =>
            scrollerRef.current?.scrollBy({ left: -180, behavior: "smooth" })
          }
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      <div ref={scrollerRef} className="logicflow-page-tabs-scroll">
        {pages.map((page, index) => (
          <ContextMenu key={page.id}>
            <ContextMenuTrigger asChild>
              <div
                draggable={editable && editingId !== page.id}
                className={`logicflow-page-tab ${activePageId === page.id ? "is-active" : ""}`}
                onClick={() => onSelect(page.id)}
                onDoubleClick={() => startRename(page)}
                onDragStart={() => setDraggedId(page.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedId) onReorder(draggedId, index);
                  setDraggedId(null);
                }}
              >
                {editingId === page.id ? (
                  <div
                    className="flex items-center gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Input
                      autoFocus
                      value={name}
                      className="h-9 w-28 px-2 text-xs"
                      onChange={(event) => setName(event.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveRename();
                        if (event.key === "Escape") setEditingId(null);
                      }}
                    />
                    <Check className="h-3.5 w-3.5" />
                    <X className="h-3.5 w-3.5" />
                  </div>
                ) : (
                  <>
                    <span className="truncate">{page.name}</span>
                    {dirtyPageIds.includes(page.id) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => startRename(page)}>
                <Pencil className="mr-2 h-4 w-4" />
                重命名
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onDuplicate(page.id)}>
                <Copy className="mr-2 h-4 w-4" />
                复制页面
              </ContextMenuItem>
              {pages.length > 1 && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive"
                    onSelect={() => onDelete(page.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除页面
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
      {canRight && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() =>
            scrollerRef.current?.scrollBy({ left: 180, behavior: "smooth" })
          }
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
