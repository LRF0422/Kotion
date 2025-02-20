
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    Row,
    Table,
    useReactTable,
} from '@tanstack/react-table'


import {
    useVirtualizer,
    VirtualItem,
    Virtualizer,
} from '@tanstack/react-virtual'
import React from 'react';
import { Table as STable, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Empty } from './empty';

interface Column {
    title: string;
    dataIndex: string;
    key: string;
}

interface DataTableProps {
    columns: Column[];
    data: any[];
}


export const DataTable: React.FC<DataTableProps> = (props) => {

    const { data } = props
    const [activeCell, setActiveCell] = React.useState<{ row: number, column: number, id: string } | null>(null)
    const columns = React.useMemo<ColumnDef<any>[]>(
        () => [
            {
                accessorKey: 'id',
                header: 'ID',
                size: 60,
            },
            {
                accessorKey: 'firstName',
                cell: info => info.getValue(),
            },
            {
                accessorFn: row => row.lastName,
                id: 'lastName',
                cell: info => info.getValue(),
                header: () => <span>Last Name</span>,
            },
            {
                accessorKey: 'age',
                header: () => 'Age',
                size: 50,
            },
            {
                accessorKey: 'visits',
                header: () => <span>Visits</span>,
                size: 50,
            },
            {
                accessorKey: 'status',
                header: 'Status',
            },
            {
                accessorKey: 'progress',
                header: 'Profile Progress',
                size: 80,
            },
            {
                accessorKey: 'createdAt',
                header: 'Created At',
                cell: info => info.getValue<Date>().toLocaleString(),
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
        debugTable: true,
    })

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
                            {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                    {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                    )}
                                </TableCell>
                            ))}
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