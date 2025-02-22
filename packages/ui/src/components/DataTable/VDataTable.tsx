import {
    ColumnDef,
    Row,
    SortDirection,
    SortingState,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";

import { Table, TableBody, TableCell, TableHead, TableRow } from "@ui/components/ui/table";
import { HTMLAttributes, forwardRef, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { cn } from "@ui/lib/utils";
import React from "react";
import { useCellSelection } from "./useCellSelection";

// Original Table is wrapped with a <div> (see https://ui.shadcn.com/docs/components/table#radix-:r24:-content-manual), 
// but here we don't want it, so let's use a new component with only <table> tag
const TableComponent = forwardRef<
    HTMLTableElement,
    React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
    <Table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
    />
));
TableComponent.displayName = "TableComponent";


interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    height: string;
}

export function VDataTable<TData, TValue>({
    columns,
    data,
    height,
}: DataTableProps<TData, TValue>) {
    // const [sorting, setSorting] = useState<SortingState>([]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        meta: {
            updateData: (rowIndex, columnId, value) => {
                // skipAutoResetPageIndex()
                // setData(old =>
                //     old.map((row, index) => {
                //         if (index === rowIndex) {
                //             return {
                //                 ...old[rowIndex]!,
                //                 [columnId]: value,
                //             }
                //         }
                //         return row
                //     })
                // )
            },
        },
        debugTable: true,
    });

    const { rows } = table.getRowModel();

    const {
        selectedCell,
        selection: selectedRange,
        getCellRef,
        isCellSelected,
        isCellInRange,
        handleClick,
        handleKeyDown,
        handleMouseDown,
        handleMouseEnter,
    } = useCellSelection(table.getRowModel().rows, table.getVisibleFlatColumns());

    console.log('row count', rows.length);

    return (
        rows && <div className="rounded-md border">
            <TableVirtuoso
                style={{ height }}
                totalCount={rows.length}
                data={rows}
                components={{
                    Table: TableComponent,
                    TableBody: TableBody,
                    TableRow: (props) => {
                        const index = props["data-index"];
                        const row = rows[index];
                        console.log('row', props)
                        if (!row) return null;

                        return (
                            <TableRow
                                key={row.id}
                                data-state={row.getIsSelected() && "selected"}
                            >
                                {row.getVisibleCells().map((cell) => {
                                    const cellRef = getCellRef(cell.row.id, cell.column.id);
                                    const isSelected = isCellSelected(
                                        cell.row.id,
                                        cell.column.id
                                    );
                                    const isInRange = isCellInRange(cell.row.id, cell.column.id);
                                    const isEditable = cell.column.columnDef.meta?.editable;
                                    return <TableCell
                                        ref={cellRef}
                                        key={cell.id}
                                        className={cn(`outline-offset-[-2px] select-none`, {
                                            "outline outline-cyan-400 outline-3": isSelected,
                                            "bg-cyan-400": !isSelected && isInRange
                                        })}
                                        onKeyDown={(e) => {
                                            handleKeyDown(e, cell.row.id, cell.column.id);
                                            if (e.key === "Enter") {
                                                const editableCell = cellRef.current?.querySelector(
                                                    ".qz__data-table__editable-cell--viewing"
                                                );
                                                if (editableCell) {
                                                    const event = new KeyboardEvent("keydown", {
                                                        key: "Enter",
                                                        bubbles: true,
                                                        cancelable: true,
                                                    });

                                                    editableCell.dispatchEvent(event);
                                                }
                                            }
                                        }}
                                        onMouseDown={() =>
                                            handleMouseDown(cell.row.id, cell.column.id)
                                        }
                                        onMouseEnter={() =>
                                            handleMouseEnter(cell.row.id, cell.column.id)
                                        }
                                        onClick={() =>
                                            handleClick(cell.row.id, cell.column.id)
                                        }
                                    >
                                        {flexRender(
                                            cell.column.columnDef.cell,
                                            cell.getContext()
                                        )}
                                    </TableCell>
                                })}
                            </TableRow>
                        );
                    },
                }}
                fixedHeaderContent={() =>
                    table.getHeaderGroups().map((headerGroup) => (
                        // Change header background color to non-transparent
                        <TableRow className="bg-card hover:bg-muted" key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                return (
                                    <TableHead
                                        key={header.id}
                                        colSpan={header.colSpan}
                                        style={{
                                            width: header.getSize(),
                                        }}
                                    >
                                        {header.isPlaceholder ? null : (
                                            <div
                                                className="flex items-center"
                                                {...{
                                                    style: header.column.getCanSort()
                                                        ? {
                                                            cursor: "pointer",
                                                            userSelect: "none",
                                                        }
                                                        : {},
                                                    onClick: header.column.getToggleSortingHandler(),
                                                }}
                                            >
                                                {flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext(),
                                                )}
                                            </div>
                                        )}
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    ))
                }
            />
        </div>
    );
}