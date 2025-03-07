import { Plus, SearchIcon, Settings, Table } from "@repo/icon";
import { useContext, useEffect, useMemo, useRef } from "react";
import { NodeViewContext } from "../DatabaseView";
import { Button, Input } from "@repo/ui";
import 'react-data-grid/lib/styles.css';

import DataGrid, { DataGridHandle, FillEvent } from 'react-data-grid';

import { useToggle } from "ahooks";
import { cn } from "@repo/ui";
import { getCellIcon, getCellView, getEditor } from "./custom-columns/DateColumns";
import styled from "styled-components";
import { useTheme } from "@repo/ui";
import { UpdateCellProps } from "../utils";
import React from "react";
import { TableViewCfg } from "./TableViewCfg";


const Container = styled.div`
    .rdg-cell {
        border: 1px solid #eee
    }
`

export const TableView: React.FC = () => {

    const { theme } = useTheme()
    const { editor, columns, data, handleMoveCol, node, updateAttributes, handleDataChangeBatch, handleAddRow } = useContext(NodeViewContext)
    const [visible, { toggle }] = useToggle(false)
    const gridRef = useRef<DataGridHandle>(null);

    useEffect(() => {
        console.log('columns Change', columns);
    }, [columns])

    useEffect(() => {
        console.log('data Change', data);

    }, [data])

    useEffect(() => {
    }, [])

    function handleFill({ columnKey, sourceRow, targetRow }: FillEvent<any>): any {
        return { ...targetRow, [columnKey]: sourceRow[columnKey as keyof any] };
    }

    const handleReorder = (sourceKey: string, targetKey: string) => {
        handleMoveCol && handleMoveCol(sourceKey, targetKey)
    }

    const summaryRows = useMemo((): readonly any[] => {
        return [
            {
                id: 'total_0',
                Test: data.length
            }
        ];
    }, [data]);

    const handleColumnResize = (index: number, width: number) => {
        columns[index].width = width
        updateAttributes({
            ...node.attrs,
            columns: columns
        })
    }

    return <div className="relative space-y-2 ">
        {
            editor.isEditable && <div className=" space-x-1 flex items-center">
                <Button variant="outline" size="sm" onClick={toggle} ><Settings className="h-4 w-4 mr-1" /> Setting</Button>
                <Button variant="outline" size="sm" onClick={handleAddRow}><Plus className="h-4 w-4 mr-1" /> Add Row</Button>
                <Input className="h-9 w-30" icon={<SearchIcon className="h-5 w-5" />} />
            </div>
        }
        <Container>
            <DataGrid
                ref={gridRef}
                rowClass={() => ''}
                onFill={handleFill}
                rowKeyGetter={(row) => row.id}
                columns={columns.map((it) => ({
                    name: it.title,
                    key: it.id,
                    width: it.width || 150,
                    renderEditCell: getEditor(it.dataType),
                    renderCell: getCellView(it.dataType),
                    editable: editor.isEditable,
                    resizable: true,
                    draggable: editor.isEditable && it.dataType !== 'id',
                    renderSummaryCell: () => {
                        return it.dataType === 'id' && <div className=" w-full h-full flex flex-row gap-1 items-center text-gray-500 cursor-pointer" onClick={() => {
                            handleAddRow && handleAddRow()
                            gridRef.current && gridRef.current.scrollToCell({ rowIdx: data.length - 1 })
                        }}>
                            <Plus className=" h-4 w-4" />
                            Add New Row
                        </div>;
                    },
                    renderHeaderCell: ({ column }) => <div className="flex flex-row gap-1 items-center justify-between">
                        <div className="flex flex-row gap-1 items-center">
                            {getCellIcon(it.dataType)}
                            {column.name}
                        </div>
                    </div>
                }))}
                className={cn("fill-grid", theme === 'dark' ? 'rdg-dark' : 'rdg-light')}
                rows={data}
                onColumnResize={handleColumnResize}
                bottomSummaryRows={editor.isEditable ? summaryRows : undefined}
                onColumnsReorder={handleReorder}
                onRowsChange={(rows, data) => {
                    if (data.indexes.length > 0) {
                        const updateCells: UpdateCellProps[] = data.indexes.map(index => {
                            const d = rows[index]
                            return {
                                colIndex: data.column.idx,
                                rowIndex: index,
                                data: d[data.column.key]
                            }
                        })
                        handleDataChangeBatch(updateCells)
                    }
                }}
            />
        </Container>
        <div id="portal" className=" left-0 top-0 z-[9999] fixed" />
        <TableViewCfg visible={visible} toggle={toggle} />
        <div className="italic text-secondary-foreground text-sm">{data.length} total rows</div>
    </div>
}
// @ts-ignore
TableView.Icon = Table