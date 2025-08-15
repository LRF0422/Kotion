import { NodeViewProps } from "@kn/editor"
import { UpdateCellProps } from "./utils"
import { ColumnType } from "./DatabaseView"
import { createContext } from "react"

export type Context = NodeViewProps & {
    data: any[],
    handleAddRow: (data?: any) => void,
    handleAddCol: (column: any) => void,
    handleDelCol: (columnIndex: number) => void,
    handleDataChange: (row: number, col: number, data: any) => void,
    handleDataChangeBatch: (updateCells: UpdateCellProps[]) => void,
    handleMoveCol: (source: string, target: string) => void,
    handleDeleteRow: (rowIndex: string[]) => void,
    columns: any[], columnTypes: ColumnType[]
}

export const NodeViewContext = createContext<Context>({} as Context)