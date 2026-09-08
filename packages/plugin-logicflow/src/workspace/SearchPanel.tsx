import { Input, ScrollArea } from "@kn/ui";
import { Search } from "@kn/icon";
import React, { useMemo, useState } from "react";
import type { Page } from "../model/types";

function nodeText(text: unknown): string {
  if (typeof text === "string") return text;
  if (text && typeof text === "object" && "value" in text)
    return String((text as { value?: unknown }).value ?? "");
  return "";
}

export function SearchPanel({
  document,
  onSelect,
}: {
  document: Page;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return document.graph.nodes.slice(0, 30);
    return document.graph.nodes
      .filter((node) => {
        const haystack =
          `${node.type} ${nodeText(node.text)} ${JSON.stringify(node.properties ?? {})}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 50);
  }, [document.graph.nodes, query]);
  return (
    <div className="flex h-full flex-col">
      <div className="relative border-b p-3">
        <Search className="absolute left-5 top-5 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文字、类型或属性"
          className="h-11 pl-8 text-xs"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {results.map((node) => (
            <button
              key={node.id}
              type="button"
              className="flex min-h-11 w-full items-center justify-between rounded px-3 py-2 text-left text-xs hover:bg-accent"
              onClick={() => onSelect(node.id)}
            >
              <span className="truncate">
                {nodeText(node.text) || node.type}
              </span>
              <span className="ml-3 shrink-0 text-[10px] text-muted-foreground">
                {node.type}
              </span>
            </button>
          ))}
          {!results.length && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              未找到节点
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
