import React, { useCallback, useState } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../../hooks/use-active";
import { Table } from "../index";
import { Table2 } from "@kn/icon";
import { Toggle, Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { cn } from "@kn/ui";

const MAX_ROWS = 8;
const MAX_COLS = 10;

export const TableStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isTableActive = useActive(editor, Table.name);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [open, setOpen] = useState(false);

  const insertTable = useCallback(
    (rows: number, cols: number) => {
      editor
        .chain()
        .insertTable({ rows, cols, withHeaderRow: true })
        .focus()
        .run();
      setOpen(false);
      setHoveredCell(null);
    },
    [editor]
  );

  const handleCellHover = (row: number, col: number) => {
    setHoveredCell({ row, col });
  };

  const handleCellClick = (row: number, col: number) => {
    insertTable(row, col);
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  const getCellClassName = (row: number, col: number) => {
    if (!hoveredCell) return "";
    const isSelected = row <= hoveredCell.row && col <= hoveredCell.col;
    return isSelected ? "bg-primary" : "";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Toggle pressed={isTableActive} size="sm">
          <Table2 className="h-4 w-4" />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)` }}
          onMouseLeave={handleMouseLeave}
        >
          {Array.from({ length: MAX_ROWS }, (_, rowIndex) =>
            Array.from({ length: MAX_COLS }, (_, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={cn(
                  "h-4 w-4 cursor-pointer rounded-sm border border-border transition-colors",
                  getCellClassName(rowIndex + 1, colIndex + 1)
                )}
                onMouseEnter={() => handleCellHover(rowIndex + 1, colIndex + 1)}
                onClick={() => handleCellClick(rowIndex + 1, colIndex + 1)}
              />
            ))
          )}
        </div>
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {hoveredCell ? `${hoveredCell.row} × ${hoveredCell.col} 表格` : "选择行列数"}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export * from "./bubble";
