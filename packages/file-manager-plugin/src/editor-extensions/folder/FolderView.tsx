import React from "react"
import { NodeViewProps, NodeViewWrapper } from "@repo/editor"
import { Button, DataTable, Input } from "@repo/ui"
import { PlusCircle, UploadIcon } from "@repo/icon"

export const FolderView: React.FC<NodeViewProps> = (props) => {

    const { node: { attrs } } = props

    return <NodeViewWrapper as="div" className=" rounded-sm w-full">
        <div className="w-full border-b flex items-center gap-1 p-1">
            <Button variant={"ghost"}> <PlusCircle /> 新建文件夹</Button>
            <Button variant={"ghost"}><UploadIcon /> 上传文件</Button>
            <Input placeholder="搜索文件" className=" w-[200px] h-7" />
        </div>
        <DataTable data={[]} columns={[]} />
    </NodeViewWrapper>
}