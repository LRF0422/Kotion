import { Download, FileIcon, FolderIcon } from "@repo/icon";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, Checkbox, cn } from "@repo/ui";
import { useSafeState } from "@repo/core";
import React from "react";
import { FileProps } from "./FileManager";


export interface FileCardProps {
    objectId: string,
    isSelect?: boolean
    name: string
    suffix?: string
    isFolder: boolean,
    onSelect: (id: string, checked: boolean) => void
    target?: 'folder' | 'file' | 'both'
}


export const FileCard: React.FC<FileCardProps> = (props) => {
    const { name, isFolder, objectId, target = 'both' } = props
    const [checked, setChecked] = useSafeState<boolean>(false)
    return <Card className={cn("w-[200px] bg-muted/40 shadow-sm hover:bg-muted/90 hover:shadow-md", checked ? "outline" : "")}>
        <CardHeader className="p-0">
            <CardTitle className="p-0 m-0">
                <div className="flex items-center justify-between p-1">
                    {
                        (isFolder && (target == 'both' || target == 'folder')) && <Checkbox className="ml-1" defaultChecked={checked} onCheckedChange={(checked) => {
                            props.onSelect(objectId, checked as boolean)
                            setChecked(checked as boolean)
                        }} />
                    }
                    {
                        (!isFolder && (target == 'both' || target == 'file')) && <Checkbox className="ml-1" defaultChecked={checked} onCheckedChange={(checked) => {
                            props.onSelect(objectId, checked as boolean)
                            setChecked(checked as boolean)
                        }} />
                    }
                    <div>
                        <div className="p-1 hover:bg-muted cursor-pointer rounded-sm">
                            <Download className="h-4 w-4" />
                        </div>
                    </div>
                </div>
            </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
            {
                isFolder ? <FolderIcon className="h-20 w-20 fill-sky-500 text-sky-500" strokeWidth={0} /> :
                    <FileIcon className="h-20 w-20" strokeWidth={1} />
            }
        </CardContent>
        <CardFooter className="p-2 m-0 border-t text-sm text-nowrap overflow-hidden text-ellipsis">
            {name}
        </CardFooter>
    </Card>
}

export interface FileCardListPros {
    files: FileProps[],
    selectedFiles: string[],
    setSelectFiles: any,
    target?: 'folder' | 'file' | 'both'
}
export const FileCardList: React.FC<FileCardListPros> = (props) => {
    const { files, selectedFiles, setSelectFiles, target = 'both' } = props
    return <div className="h-full w-full">
        <div className="flex flex-wrap w-full gap-2 p-6 overflow-auto">
            {
                files.map((it, index) => (
                    <FileCard
                        target={target}
                        onSelect={(id, checked) => {
                            if (checked) {
                                setSelectFiles([...selectedFiles, id])
                            } else {
                                setSelectFiles(selectedFiles.filter(it => it !== id))
                            }
                        }}
                        objectId={it.id}
                        key={index}
                        name={it.name}
                        isFolder={it.isFolder}
                    />
                ))
            }
        </div>
    </div>
}