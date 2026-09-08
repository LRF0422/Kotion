import {
  Check,
  ChevronDown,
  Clock3,
  Pencil,
  Save,
  Search,
  Shapes,
  Star,
  Trash2,
  X,
} from "@kn/icon";
import { Button, Input, ScrollArea } from "@kn/ui";
import React, { useMemo, useState } from "react";
import type { DiagramFragment, ScratchpadItem } from "../model/types";
import {
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
  ShapePreviewSvg,
  searchShapes,
  type ShapeCategory,
  type ShapeDefinition,
} from "../shapes";

export type ShapeLibraryScratchpadItem = ScratchpadItem;

export interface ShapeLibraryProps {
  mobile: boolean;
  onStartDrag: (shape: ShapeDefinition) => void;
  onAdd: (shape: ShapeDefinition) => void;
  scratchpadItems?: readonly ShapeLibraryScratchpadItem[];
  canSaveSelection?: boolean;
  onSaveSelectionToScratchpad?: (name: string) => void;
  onInsertScratchpadItem?: (item: ShapeLibraryScratchpadItem) => void;
  onRenameScratchpadItem?: (id: string, name: string) => void;
  onDeleteScratchpadItem?: (id: string) => void;
}

type FragmentNode = {
  id?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  r?: unknown;
  rx?: unknown;
  ry?: unknown;
  properties?: unknown;
};

type FragmentEdge = {
  sourceNodeId?: unknown;
  targetNodeId?: unknown;
};

type PreviewNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fragmentParts(fragment: DiagramFragment): {
  nodes: FragmentNode[];
  edges: FragmentEdge[];
} {
  const value = object(fragment);
  return {
    nodes: Array.isArray(value.nodes) ? (value.nodes as FragmentNode[]) : [],
    edges: Array.isArray(value.edges) ? (value.edges as FragmentEdge[]) : [],
  };
}

function fragmentPreviewData(fragment: DiagramFragment) {
  const { nodes: rawNodes, edges } = fragmentParts(fragment);
  const nodes: PreviewNode[] = rawNodes.map((raw, index) => {
    const properties = object(raw.properties);
    const type = typeof raw.type === "string" ? raw.type : "rect";
    const definition = SHAPE_DEFINITIONS.find((shape) => shape.type === type);
    const radius = finite(raw.r, finite(properties.r, 0));
    const rx = finite(raw.rx, finite(properties.rx, 0));
    const ry = finite(raw.ry, finite(properties.ry, 0));
    return {
      id: typeof raw.id === "string" ? raw.id : `node-${index}`,
      type,
      x: finite(raw.x, index * 120),
      y: finite(raw.y, 0),
      width: finite(
        raw.width,
        finite(
          properties.width,
          radius * 2 || rx * 2 || definition?.width || 100,
        ),
      ),
      height: finite(
        raw.height,
        finite(
          properties.height,
          radius * 2 || ry * 2 || definition?.height || 60,
        ),
      ),
    };
  });
  if (!nodes.length) return { nodes, edges: [], viewBox: "0 0 100 60" };
  const left = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const right = Math.max(...nodes.map((node) => node.x + node.width / 2));
  const top = Math.min(...nodes.map((node) => node.y - node.height / 2));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height / 2));
  const padding = Math.max(12, Math.max(right - left, bottom - top) * 0.08);
  return {
    nodes,
    edges,
    viewBox: `${left - padding} ${top - padding} ${Math.max(1, right - left + padding * 2)} ${Math.max(1, bottom - top + padding * 2)}`,
  };
}

export function ScratchpadFragmentPreview({
  fragment,
  className,
}: {
  fragment: DiagramFragment;
  className?: string;
}) {
  const data = useMemo(() => fragmentPreviewData(fragment), [fragment]);
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  return (
    <svg
      className={className}
      viewBox={data.viewBox}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {data.edges.map((edge, index) => {
        const source =
          typeof edge.sourceNodeId === "string"
            ? byId.get(edge.sourceNodeId)
            : undefined;
        const target =
          typeof edge.targetNodeId === "string"
            ? byId.get(edge.targetNodeId)
            : undefined;
        if (!source || !target) return null;
        return (
          <line
            key={`edge-${index}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {data.nodes.map((node) => {
        const common = {
          fill: "hsl(var(--card))",
          stroke: "hsl(var(--foreground))",
          strokeWidth: 2,
          vectorEffect: "non-scaling-stroke" as const,
        };
        if (node.type === "circle") {
          return (
            <ellipse
              key={node.id}
              {...common}
              cx={node.x}
              cy={node.y}
              rx={node.width / 2}
              ry={node.height / 2}
            />
          );
        }
        if (
          node.type === "diamond" ||
          node.type === "er-relationship" ||
          node.type === "bpmn:exclusiveGateway"
        ) {
          return (
            <path
              key={node.id}
              {...common}
              d={`M ${node.x} ${node.y - node.height / 2} L ${node.x + node.width / 2} ${node.y} L ${node.x} ${node.y + node.height / 2} L ${node.x - node.width / 2} ${node.y} Z`}
            />
          );
        }
        if (node.type.includes("cloud")) {
          const left = node.x - node.width / 2;
          const top = node.y - node.height / 2;
          return (
            <path
              key={node.id}
              {...common}
              d={`M ${left + node.width * 0.18} ${top + node.height * 0.76} C ${left} ${top + node.height * 0.72}, ${left + node.width * 0.06} ${top + node.height * 0.42}, ${left + node.width * 0.26} ${top + node.height * 0.43} C ${left + node.width * 0.32} ${top + node.height * 0.12}, ${left + node.width * 0.7} ${top + node.height * 0.12}, ${left + node.width * 0.76} ${top + node.height * 0.4} C ${left + node.width} ${top + node.height * 0.38}, ${left + node.width} ${top + node.height * 0.76}, ${left + node.width * 0.82} ${top + node.height * 0.76} Z`}
            />
          );
        }
        return (
          <rect
            key={node.id}
            {...common}
            x={node.x - node.width / 2}
            y={node.y - node.height / 2}
            width={node.width}
            height={node.height}
            rx={Math.min(8, node.height * 0.12)}
          />
        );
      })}
    </svg>
  );
}

function ShapeTile({
  shape,
  mobile,
  favorite,
  onToggleFavorite,
  onStartDrag,
  onAdd,
}: {
  shape: ShapeDefinition;
  mobile: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  onStartDrag: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        className="logicflow-shape-item w-full px-2 pr-11"
        title={`${shape.label} · ${shape.aliases.join(", ")}`}
        onMouseDown={() => {
          if (!mobile) onStartDrag();
        }}
        onClick={() => {
          if (mobile) onAdd();
        }}
      >
        <ShapePreviewSvg shape={shape} className="h-11 w-full max-w-[5rem]" />
        <span className="line-clamp-2">{shape.label}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-11 w-11 rounded-lg"
        aria-label={
          favorite
            ? `Remove ${shape.label} from favorites`
            : `Add ${shape.label} to favorites`
        }
        aria-pressed={favorite}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
      >
        <Star
          className={`h-4 w-4 ${favorite ? "fill-current text-primary" : "text-muted-foreground"}`}
        />
      </Button>
    </div>
  );
}

function ShapeSection({
  id,
  title,
  icon,
  shapes,
  collapsed,
  favorites,
  mobile,
  onToggle,
  onToggleFavorite,
  onStartDrag,
  onAdd,
}: {
  id: string;
  title: string;
  icon?: React.ReactNode;
  shapes: ShapeDefinition[];
  collapsed: boolean;
  favorites: ReadonlySet<string>;
  mobile: boolean;
  onToggle: () => void;
  onToggleFavorite: (type: string) => void;
  onStartDrag: (shape: ShapeDefinition) => void;
  onAdd: (shape: ShapeDefinition) => void;
}) {
  if (!shapes.length) return null;
  return (
    <section aria-labelledby={`shape-section-${id}`}>
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full justify-between px-3"
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <span
          id={`shape-section-${id}`}
          className="flex min-w-0 items-center gap-2 text-sm font-medium"
        >
          {icon}
          <span className="truncate">{title}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {shapes.length}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
      </Button>
      {!collapsed && (
        <div className="logicflow-shape-grid pt-1">
          {shapes.map((shape) => (
            <ShapeTile
              key={`${id}-${shape.type}`}
              shape={shape}
              mobile={mobile}
              favorite={favorites.has(shape.type)}
              onToggleFavorite={() => onToggleFavorite(shape.type)}
              onStartDrag={() => onStartDrag(shape)}
              onAdd={() => onAdd(shape)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ScratchpadSection({
  items,
  canSaveSelection,
  onSave,
  onInsert,
  onRename,
  onDelete,
}: {
  items: readonly ShapeLibraryScratchpadItem[];
  canSaveSelection: boolean;
  onSave?: (name: string) => void;
  onInsert?: (item: ShapeLibraryScratchpadItem) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [draftName, setDraftName] = useState("Selection");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const commitRename = (item: ShapeLibraryScratchpadItem) => {
    const name = editingName.trim();
    if (name && name !== item.name) onRename?.(item.id, name);
    setEditingId(null);
  };

  return (
    <section
      aria-labelledby="shape-section-scratchpad"
      className="border-t border-border"
    >
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full justify-between px-3"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span
          id="shape-section-scratchpad"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Shapes className="h-4 w-4" />
          Scratchpad
          <span className="text-xs font-normal text-muted-foreground">
            {items.length}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
      </Button>
      {!collapsed && (
        <div className="space-y-2 px-3 pb-3">
          {onSave && (
            <div className="flex gap-2">
              <Input
                value={draftName}
                className="h-11 min-w-0"
                aria-label="Scratchpad item name"
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    canSaveSelection &&
                    draftName.trim()
                  ) {
                    onSave(draftName.trim());
                    setDraftName("Selection");
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={!canSaveSelection || !draftName.trim()}
                aria-label="Save selection to Scratchpad"
                onClick={() => {
                  onSave(draftName.trim());
                  setDraftName("Selection");
                }}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          )}
          {!items.length && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Save a selection to reuse it later.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-card p-1 text-card-foreground"
            >
              {editingId === item.id ? (
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    value={editingName}
                    className="h-11 min-w-0"
                    aria-label={`Rename ${item.name}`}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={() => commitRename(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(item);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label="Confirm rename"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitRename(item)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label="Cancel rename"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left hover:bg-accent hover:text-accent-foreground"
                    onClick={() => onInsert?.(item)}
                    disabled={!onInsert}
                  >
                    <ScratchpadFragmentPreview
                      fragment={item.fragment}
                      className="h-9 w-14 shrink-0 rounded border border-border bg-background"
                    />
                    <span className="truncate text-xs font-medium">
                      {item.name}
                    </span>
                  </button>
                  {onRename && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      aria-label={`Rename ${item.name}`}
                      onClick={() => {
                        setEditingId(item.id);
                        setEditingName(item.name);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-destructive hover:text-destructive"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ShapeLibrary({
  mobile,
  onStartDrag,
  onAdd,
  scratchpadItems = [],
  canSaveSelection = false,
  onSaveSelectionToScratchpad,
  onInsertScratchpadItem,
  onRenameScratchpadItem,
  onDeleteScratchpadItem,
}: ShapeLibraryProps) {
  const [query, setQuery] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [enabledCategories, setEnabledCategories] = useState<
    Set<ShapeCategory>
  >(() => new Set(SHAPE_CATEGORIES.map((category) => category.id)));
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(["er", "uml", "bpmn", "network"]),
  );
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [recent, setRecent] = useState<string[]>([]);
  const matches = useMemo(() => searchShapes(query), [query]);
  const matchTypes = useMemo(
    () => new Set(matches.map((shape) => shape.type)),
    [matches],
  );

  const recordRecent = (shape: ShapeDefinition) => {
    setRecent((current) =>
      [shape.type, ...current.filter((type) => type !== shape.type)].slice(
        0,
        8,
      ),
    );
  };
  const startDrag = (shape: ShapeDefinition) => {
    recordRecent(shape);
    onStartDrag(shape);
  };
  const add = (shape: ShapeDefinition) => {
    recordRecent(shape);
    onAdd(shape);
  };
  const toggleFavorite = (type: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };
  const toggleCollapsed = (id: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const visible = (shape: ShapeDefinition) =>
    !query.trim() || matchTypes.has(shape.type);
  const recentShapes = recent
    .map((type) => SHAPE_DEFINITIONS.find((shape) => shape.type === type))
    .filter((shape): shape is ShapeDefinition => Boolean(shape))
    .filter(visible);
  const favoriteShapes = SHAPE_DEFINITIONS.filter((shape) =>
    favorites.has(shape.type),
  ).filter(visible);

  return (
    <div className="logicflow-shape-library bg-background text-foreground">
      <div className="space-y-2 border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            className="h-11 pl-9 pr-11"
            placeholder="Search shapes and aliases"
            aria-label="Search shapes"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-11 w-11"
              aria-label="Clear shape search"
              onClick={() => setQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between"
          aria-expanded={showMore}
          onClick={() => setShowMore((value) => !value)}
        >
          <span className="flex items-center gap-2">
            <Shapes className="h-4 w-4" />
            More Shapes
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`}
          />
        </Button>
        {showMore && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
            {SHAPE_CATEGORIES.map((category) => {
              const enabled = enabledCategories.has(category.id);
              return (
                <Button
                  key={category.id}
                  type="button"
                  variant={enabled ? "secondary" : "ghost"}
                  className="h-11 justify-start gap-2 px-2 text-xs"
                  aria-pressed={enabled}
                  onClick={() =>
                    setEnabledCategories((current) => {
                      const next = new Set(current);
                      if (next.has(category.id)) next.delete(category.id);
                      else next.add(category.id);
                      return next;
                    })
                  }
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                  >
                    {enabled && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{category.label}</span>
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y divide-border pb-2">
          <ScratchpadSection
            items={scratchpadItems}
            canSaveSelection={canSaveSelection}
            onSave={onSaveSelectionToScratchpad}
            onInsert={onInsertScratchpadItem}
            onRename={onRenameScratchpadItem}
            onDelete={onDeleteScratchpadItem}
          />
          <ShapeSection
            id="recent"
            title="Recent"
            icon={<Clock3 className="h-4 w-4" />}
            shapes={recentShapes}
            collapsed={collapsedSections.has("recent")}
            favorites={favorites}
            mobile={mobile}
            onToggle={() => toggleCollapsed("recent")}
            onToggleFavorite={toggleFavorite}
            onStartDrag={startDrag}
            onAdd={add}
          />
          <ShapeSection
            id="favorites"
            title="Favorites"
            icon={<Star className="h-4 w-4" />}
            shapes={favoriteShapes}
            collapsed={collapsedSections.has("favorites")}
            favorites={favorites}
            mobile={mobile}
            onToggle={() => toggleCollapsed("favorites")}
            onToggleFavorite={toggleFavorite}
            onStartDrag={startDrag}
            onAdd={add}
          />
          {SHAPE_CATEGORIES.filter((category) =>
            query.trim() ? true : enabledCategories.has(category.id),
          ).map((category) => {
            const categoryShapes = SHAPE_DEFINITIONS.filter(
              (shape) => shape.category === category.id && visible(shape),
            );
            return (
              <ShapeSection
                key={category.id}
                id={category.id}
                title={category.label}
                shapes={categoryShapes}
                collapsed={
                  query.trim() ? false : collapsedSections.has(category.id)
                }
                favorites={favorites}
                mobile={mobile}
                onToggle={() => toggleCollapsed(category.id)}
                onToggleFavorite={toggleFavorite}
                onStartDrag={startDrag}
                onAdd={add}
              />
            );
          })}
          {query.trim() && !matches.length && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No shapes match “{query.trim()}”.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
