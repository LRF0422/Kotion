import { Plus, SearchIcon, Settings, Table, Trash2 } from "@kn/icon";
import { useContext, useMemo, useRef, useState } from "react";
import { NodeViewContext } from "../Context";
import { Button, Input } from "@kn/ui";
import 'react-data-grid/lib/styles.css';

import DataGrid, { DataGridHandle, FillEvent, SelectColumn } from 'react-data-grid';

import { useToggle } from "ahooks";
import { cn } from "@kn/ui";
import { getCellIcon, getCellView, getEditor } from "./custom-columns/DateColumns";
import { styled } from "@kn/ui";
import { useTheme } from "@kn/ui";
import { UpdateCellProps } from "../utils";
import React from "react";
import { TableViewCfg } from "./TableViewCfg";


const Container = styled.div`
`

export const TableView: React.FC<any> = (props: { pageSize?: number }) => {

    const { pageSize = 20 } = props
    const { theme } = useTheme()
    const { editor,
        columns,
        data,
        handleMoveCol,
        node,
        updateAttributes,
        handleDataChangeBatch,
        handleAddRow, handleDeleteRow } = useContext(NodeViewContext)
    const [visible, { toggle }] = useToggle(false)
    const gridRef = useRef<DataGridHandle>(null);
    const [selectedRows, setSelectedRows] = useState((): ReadonlySet<string> => new Set());

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
    }

    return <div className="relative space-y-2 ">
        {
            editor.isEditable && <div className=" space-x-1 flex items-center">
                <Button variant="outline" size="sm" onClick={toggle} ><Settings className="h-4 w-4 mr-1" /> Setting</Button>
                <Button variant="outline" size="sm" onClick={handleAddRow}><Plus className="h-4 w-4 mr-1" /> Add Row</Button>
                {
                    selectedRows.size > 0 && <Button variant="outline" size="sm" onClick={() => {
                        handleDeleteRow(Array.from(selectedRows))
                        setSelectedRows(new Set())
                    }}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
                }
                <Input className="h-9 w-30" icon={<SearchIcon className="h-5 w-5" />} />
                {
                    selectedRows.size > 0 && <div className=" text-sm italic text-secondary">
                        selected {selectedRows.size} items
                    </div>
                }
            </div>
        }
        <Container>
            <DataGrid
                ref={gridRef}
                rowClass={() => ''}
                style={{
                    height: `${(pageSize + 2) * 35}px`
                }}
                onFill={handleFill}
                rowKeyGetter={(row: any) => row.id}
                selectedRows={selectedRows}
                onSelectedRowsChange={setSelectedRows}
                columns={[
                    SelectColumn,
                    ...columns.filter(it => !!it.isShow).map((it: any) => ({
                        name: it.title,
                        key: it.id,
                        // width: it.width || 150,
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
                        renderHeaderCell: (props: any) => <div className="flex flex-row gap-1 items-center justify-between">
                            <div className="flex flex-row gap-1 items-center">
                                {getCellIcon(it.dataType)}
                                {props.column.name}
                            </div>
                        </div>
                    }))
                ]}
                className={cn("", theme === 'dark' ? 'rdg-dark' : 'rdg-light')}
                rows={data}
                onColumnResize={handleColumnResize}
                bottomSummaryRows={editor.isEditable ? summaryRows : undefined}
                onColumnsReorder={handleReorder}
                onRowsChange={(rows: any, data: any) => {
                    if (data.indexes.length > 0) {
                        const updateCells: UpdateCellProps[] = data.indexes.map((index: number) => {
                            const d = rows[index]
                            return {
                                colIndex: data.column.idx - 1,
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