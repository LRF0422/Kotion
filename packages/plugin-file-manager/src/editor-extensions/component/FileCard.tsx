import { Download, FcFile, FcOpenedFolder, XIcon } from "@kn/icon";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, Checkbox, cn } from "@kn/ui";
import { useSafeState } from "@kn/core";
import React, { useEffect } from "react";
import { FileItem, FileManagerState, useFileManagerState } from "./FileContext";


export interface FileCardProps {
    objectId: string,
    isSelect?: boolean
    name: string
    suffix?: string
    isFolder: boolean,
    onSelect: (id: string, checked: boolean) => void
    target?: 'folder' | 'file' | 'both'
}


export const FileCard: React.FC<FileItem> = (props) => {
    const { isFolder, id, name } = props
    const { selectedFiles, setSelectFiles, selectable, setCurrentFolderId } = useFileManagerState() as FileManagerState
    const [checked, setChecked] = useSafeState<boolean>(false)

    useEffect(() => {
        setChecked(!!selectedFiles.find(it => it.id === id))
    }, [selectedFiles, props])
    return name && <div
        onContextMenu={() => {
            selectable && setChecked(true)
        }}
        onDoubleClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setCurrentFolderId(id)
        }}
    >
        <Card className={cn("w-[200px] bg-muted/40 shadow-sm hover:bg-muted/50 hover:shadow-md", checked ? "outline" : "")}>
            <CardHeader className="p-0">
                <CardTitle className="p-0 m-0 border-b">
                    <div className="flex items-center justify-between p-1">
                        {
                            selectable && <Checkbox className="ml-1" checked={checked} onCheckedChange={(value) => {
                                if (value) {
                                    setSelectFiles([...selectedFiles, props])
                                } else {
                                    setSelectFiles(selectedFiles.filter(it => it.id !== id))
                                }
                            }} />
                        }
                        <div className="flex items-center gap-1">
                            <div className="p-1 hover:bg-muted cursor-pointer rounded-sm">
                                <Download className="h-4 w-4" />
                            </div>
                            <div className="p-1 hover:bg-muted cursor-pointer rounded-sm">
                                <XIcon className="h-4 w-4" />
                            </div>
                        </div>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center p-2">
                {
                    isFolder ? <FcOpenedFolder className="h-20 w-20" /> :
                        <FcFile className="h-20 w-20" />
                }
            </CardContent>
            <CardFooter className="p-2 m-0 border-t text-sm">
                {
                    name
                }
            </CardFooter>
        </Card>
    </div>
}

export const FileCardList: React.FC = (props) => {
    const { currentFolderItems } = useFileManagerState() as FileManagerState
    return <div className="h-full w-full overflow-auto max-h-full">
        <div className="flex flex-wrap w-full gap-2 p-6">
            {
                currentFolderItems.map((it, index) => (
                    <FileCard
                        key={index}
                        {...it}
                    />
                ))
            }
        </div>
    </div>
}