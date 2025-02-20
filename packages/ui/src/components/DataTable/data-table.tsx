
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    Row,
    RowData,
    Table,
    useReactTable,
} from '@tanstack/react-table'


import {
    useVirtualizer,
    VirtualItem,
    Virtualizer,
} from '@tanstack/react-virtual'
import React from 'react';
import { Table as STable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Empty } from '../ui/empty';
import { Input } from '../ui/input';
import { EditableCell } from './EditableCell';
import { DateTimePicker } from '../ui/datetime-picker';
import { useCellSelection } from './useCellSelection';
import { cn } from '@ui/lib/utils';

declare module '@tanstack/react-table' {
    interface TableMeta<TData extends RowData> {
        updateData: (rowIndex: number, columnId: string, value: unknown) => void
    }
    interface ColumnMeta<TData, TValue> {
        editable: boolean
    }
}

type Column = ColumnDef<any> & {
    title: string;
    dataIndex: string;
    key: string;
}

interface DataTableProps {
    columns: Column[];
    data: any[];
}

function useSkipper() {
    const shouldSkipRef = React.useRef(true)
    const shouldSkip = shouldSkipRef.current

    // Wrap a function with this to skip a pagination reset temporarily
    const skip = React.useCallback(() => {
        shouldSkipRef.current = false
    }, [])

    React.useEffect(() => {
        shouldSkipRef.current = true
    })

    return [shouldSkip, skip] as const
}


export const DataTable: React.FC<DataTableProps> = (props) => {

    const [data, setData] = React.useState([
        {
            status: 'success',
            progress: '100%',
            createdAt: new Date(),
        },
        {
            status: 'success',
            progress: '100%',
            createdAt: new Date(),
        },
        {
            status: 'success',
            progress: '100%',
            createdAt: new Date(),
        }
    ])
    const [autoResetPageIndex, skipAutoResetPageIndex] = useSkipper()
    const columns = React.useMemo<ColumnDef<any>[]>(
        () => [
            {
                accessorKey: 'status',
                header: 'Status',
                cell: (cell) => (
                    <EditableCell {...cell}
                        renderInput={(props) => {
                            return <Input
                                onBlur={() => props.onBlur()}
                                value={props.value as any}
                                onChange={(e) => props.onChange(e.target.value)}
                            />
                        }}
                    />
                )
            },
            {
                accessorKey: 'progress',
                header: 'Profile Progress',
                size: 80,
                cell: (cell) => (
                    <EditableCell {...cell}
                        renderInput={(props) => {
                            return <Input
                                onBlur={() => props.onBlur()}
                                value={props.value as any}
                                onChange={(e) => props.onChange(e.target.value)}
                            />
                        }}
                    />
                )
            },
            {
                accessorKey: 'createdAt',
                header: 'Created At',
                cell: (cell) => (
                    <EditableCell {...cell}
                        renderInput={(props) => {
                            return <DateTimePicker
                                value={props.value ? new Date(props.value as string) : undefined}
                                onChange={(e) => {
                                    props.onChange(e?.toISOString())
                                }}
                                onPopoverOpenChange={(value) => {
                                    if (!value) {
                                        setTimeout(() => {
                                            props.onBlur()
                                        }, 500);
                                    }
                                }}
                            />
                        }}
                    />
                ),
                size: 250,
            },
        ],
        []
    )



    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        meta: {
            updateData: (rowIndex, columnId, value) => {
                skipAutoResetPageIndex()
                setData(old =>
                    old.map((row, index) => {
                        if (index === rowIndex) {
                            return {
                                ...old[rowIndex]!,
                                [columnId]: value,
                            }
                        }
                        return row
                    })
                )
            },
        },
        debugTable: true,
    })

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

    return <div>
        <STable>
            <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                            return (
                                <TableHead key={header.id}>
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                </TableHead>
                            )
                        })}
                    </TableRow>
                ))}
            </TableHeader>
            <TableBody>
                {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
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
                                    className={cn(" outline-offset-[-2px] select-none", {
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
                    ))
                ) : (
                    <TableRow>
                        <TableCell
                            colSpan={columns.length}
                            className="h-24 text-center"
                        >
                            <Empty />
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
        </STable>
    </div>
}