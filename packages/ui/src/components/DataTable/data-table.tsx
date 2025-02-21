
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
    elementScroll,
    useVirtualizer,
    VirtualItem,
    Virtualizer,
    VirtualizerOptions,
} from '@tanstack/react-virtual'
import React from 'react';
import { MTable, MTableBody, MTableCell, MTableHead, MTableHeader, MTableRow, Table as STable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Empty } from '../ui/empty';
import { Input } from '../ui/input';
import { EditableCell } from './EditableCell';
import { DateTimePicker } from '../ui/datetime-picker';
import { useCellSelection } from './useCellSelection';
import { cn } from '@ui/lib/utils';
import { MRate, Rate } from '../ui/rate';
import { VDataTable } from './VDataTable';

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

function easeInOutQuint(t: number) {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t
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

    const [data, setData] = React.useState(() => {
        const d = []
        for (let i = 0; i < 2; i++) {
            d.push({
                id: i,
                status: 'success',
                progress: '100%',
                createdAt: new Date(),
                rate: 3
            })
        }
        return d
    })

    const columns = React.useMemo<ColumnDef<any>[]>(
        () => [
            {
                accessorKey: 'id',
                header: 'ID',
            },
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
                accessorKey: 'rate',
                header: 'Rate',
                cell: (cell) => (
                    <EditableCell {...cell}
                        renderValueView={(value) => (
                            <MRate variant='yellow' rating={value as number} disabled />
                        )}
                        renderInput={(props) => {
                            return <MRate
                                variant='yellow'
                                rating={props.value as any | 0}
                                onRatingChange={(rate) => {
                                    props.onChange(rate)
                                    props.onBlur()
                                }}
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
            },
        ],
        []
    )


    // const table = useReactTable({
    //     data,
    //     columns,
    //     getCoreRowModel: getCoreRowModel(),
    //     getSortedRowModel: getSortedRowModel(),
    //     meta: {
    //         updateData: (rowIndex, columnId, value) => {
    //             skipAutoResetPageIndex()
    //             setData(old =>
    //                 old.map((row, index) => {
    //                     if (index === rowIndex) {
    //                         return {
    //                             ...old[rowIndex]!,
    //                             [columnId]: value,
    //                         }
    //                     }
    //                     return row
    //                 })
    //             )
    //         },
    //     },
    //     debugTable: true,
    // })

    // const {
    //     selectedCell,
    //     selection: selectedRange,
    //     getCellRef,
    //     isCellSelected,
    //     isCellInRange,
    //     handleClick,
    //     handleKeyDown,
    //     handleMouseDown,
    //     handleMouseEnter,
    // } = useCellSelection(table.getRowModel().rows, table.getVisibleFlatColumns());

    // const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    //     count: table.getRowModel().rows.length,
    //     estimateSize: () => 33, //estimate row height for accurate scrollbar dragging
    //     getScrollElement: () => tableContainerRef.current,
    //     overscan: 40,
    //     scrollToFn
    // })

    // const { rows } = table.getRowModel()

    return <VDataTable columns={columns} data={data} height="300px" />
}
