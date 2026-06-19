import { Editor } from "@tiptap/core";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import scrollIntoView from "scroll-into-view-if-needed";

import { SlashMenuItem } from "./slash";
import { cn } from "@kn/ui";

interface IProps {
  editor: Editor;
  items: SlashMenuItem[];
  command: (command: any) => void;
}

type SlashMenuItemNonDivider = Extract<SlashMenuItem, { text: string }>;

/** A renderable cell pointing back to its index in the flat `items` array. */
interface Cell {
  flatIndex: number;
  /** Custom-rendered items take a full row instead of a grid slot. */
  full: boolean;
}

interface Group {
  title?: string;
  cells: Cell[];
}

const COLS = 2;

export const SlashMenuView: React.FC<IProps> = forwardRef((props, ref) => {
  const $container = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Derive the visual groups plus a 2D navigation grid from the flat item list.
  // `rows` is the source of truth for keyboard movement; `coord` maps a flat
  // index back to its (row, col) so any selection can be moved in 2D.
  const { groups, rows, coord } = useMemo(() => {
    const groups: Group[] = [];
    let current: Group | null = null;

    props.items.forEach((item, flatIndex) => {
      if ("divider" in item) {
        current = { title: item.title, cells: [] };
        groups.push(current);
        return;
      }
      if (!current) {
        current = { cells: [] };
        groups.push(current);
      }
      current.cells.push({ flatIndex, full: !!item.render });
    });

    const rows: number[][] = [];
    const coord = new Map<number, { row: number; col: number }>();

    groups.forEach((group) => {
      let row: number[] | null = null;
      group.cells.forEach((cell) => {
        if (cell.full) {
          rows.push([cell.flatIndex]);
          coord.set(cell.flatIndex, { row: rows.length - 1, col: 0 });
          row = null;
          return;
        }
        if (!row || row.length === COLS) {
          row = [];
          rows.push(row);
        }
        row.push(cell.flatIndex);
        coord.set(cell.flatIndex, { row: rows.length - 1, col: row.length - 1 });
      });
    });

    return { groups, rows, coord };
  }, [props.items]);

  const selectItem = useCallback(
    (index: number) => {
      const command = props.items[index];
      if (command && !("divider" in command)) {
        props.command(command);
      }
    },
    [props]
  );

  // Move to (row, col) with wrapping on rows and clamping on columns.
  const moveTo = useCallback(
    (row: number, col: number) => {
      if (!rows.length) return 0;
      const r = (row + rows.length) % rows.length;
      const targetRow = rows[r];
      return targetRow[Math.min(col, targetRow.length - 1)];
    },
    [rows]
  );

  const upHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      const cur = coord.get(prev);
      if (!cur) return prev;
      return moveTo(cur.row - 1, cur.col);
    });
  }, [coord, moveTo]);

  const downHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      const cur = coord.get(prev);
      if (!cur) return prev;
      return moveTo(cur.row + 1, cur.col);
    });
  }, [coord, moveTo]);

  const leftHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      const cur = coord.get(prev);
      if (!cur) return prev;
      if (cur.col > 0) return rows[cur.row][cur.col - 1];
      // Wrap to the last cell of the previous row.
      const r = (cur.row - 1 + rows.length) % rows.length;
      const target = rows[r];
      return target[target.length - 1];
    });
  }, [coord, rows]);

  const rightHandler = useCallback(() => {
    setSelectedIndex((prev) => {
      const cur = coord.get(prev);
      if (!cur) return prev;
      if (cur.col < rows[cur.row].length - 1) return rows[cur.row][cur.col + 1];
      // Wrap to the first cell of the next row.
      const r = (cur.row + 1) % rows.length;
      return rows[r][0];
    });
  }, [coord, rows]);

  const enterHandler = useCallback(() => {
    selectItem(selectedIndex);
  }, [selectedIndex, selectItem]);

  // When the list changes (e.g. while filtering), land on the first cell.
  useEffect(() => {
    setSelectedIndex(rows[0]?.[0] ?? 0);
  }, [rows]);

  // Keep the active cell in view.
  useEffect(() => {
    if (Number.isNaN(selectedIndex)) return;
    const el = $container.current?.querySelector(
      `[data-flat-index="${selectedIndex}"]`
    );
    if (el) {
      scrollIntoView(el, {
        behavior: "smooth",
        scrollMode: "if-needed",
        block: "nearest"
      });
    }
  }, [selectedIndex]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        switch (event.key) {
          case "ArrowUp":
            upHandler();
            return true;
          case "ArrowDown":
            downHandler();
            return true;
          case "ArrowLeft":
            leftHandler();
            return true;
          case "ArrowRight":
            rightHandler();
            return true;
          case "Enter":
            enterHandler();
            return true;
          default:
            return false;
        }
      }
    }),
    [upHandler, downHandler, leftHandler, rightHandler, enterHandler]
  );

  return (
    <div
      ref={$container}
      className={cn(
        "w-[340px] max-h-[380px] overflow-y-auto",
        "p-1.5 bg-popover text-popover-foreground",
        "border border-border/60 rounded-xl shadow-xl dark:shadow-2xl backdrop-blur-sm",
        "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20",
        "hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30"
      )}
    >
      {rows.length ? (
        groups.map((group, gi) => (
          <div key={`group-${gi}`} className="mb-1 last:mb-0">
            {group.title && (
              <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group.title}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1">
              {group.cells.map((cell) => {
                const item = props.items[cell.flatIndex] as SlashMenuItemNonDivider;
                const active = selectedIndex === cell.flatIndex;

                if (item.render) {
                  return (
                    <item.render
                      key={`render-${cell.flatIndex}`}
                      data-flat-index={cell.flatIndex}
                      editor={props.editor}
                      className="col-span-2 rounded-lg"
                      active={active}
                    />
                  );
                }

                return (
                  <button
                    key={`item-${cell.flatIndex}`}
                    type="button"
                    data-flat-index={cell.flatIndex}
                    onClick={() => selectItem(cell.flatIndex)}
                    onMouseEnter={() => setSelectedIndex(cell.flatIndex)}
                    className={cn(
                      "group flex items-center gap-2 min-w-0 px-2 py-1.5 rounded-lg text-left",
                      "transition-colors duration-150 outline-none",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-md shrink-0",
                        "transition-colors duration-150 [&_svg]:w-4 [&_svg]:h-4",
                        active
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span
                        className={cn(
                          "truncate text-[13px] leading-tight",
                          active ? "font-medium text-foreground" : "text-foreground/90"
                        )}
                      >
                        {item.text}
                      </span>
                      <span
                        className={cn(
                          "truncate text-[11px] leading-tight font-mono",
                          active ? "text-primary/80" : "text-muted-foreground/60"
                        )}
                      >
                        {item.slash}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="px-4 py-8 text-center">
          <div className="text-muted-foreground text-sm">未找到指令</div>
          <div className="text-muted-foreground/60 text-xs mt-1">
            请尝试其他关键词
          </div>
        </div>
      )}
    </div>
  );
});

SlashMenuView.displayName = "SlashMenuView";
