import React from "react"
import { FileProps } from "./FileManager"
import { Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui"


export interface FileListProps {
    files: FileProps[],
    selectedFiles: string[],
    setSelectFiles: any
}

export const FileItem: React.FC = () => {
    return <div>FileItem</div>
}

export const FileList: React.FC<FileListProps> = (props) => {
    const { files } = props
    return <div className="not-prose">
        <Table className="rounded-sm">
            <TableHeader className=" border-b">
                <TableHead></TableHead>
                <TableHead>名称</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>上传时间</TableHead>
            </TableHeader>
            <TableBody>
                {files.map(file => (
                    <TableRow>
                        <TableCell className=""><Checkbox /></TableCell>
                        <TableCell>{file.name}</TableCell>
                        <TableCell>{file.name}</TableCell>
                        <TableCell>{file.name}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
}