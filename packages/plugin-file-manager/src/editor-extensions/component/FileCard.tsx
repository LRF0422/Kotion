import { Download, EyeIcon, FcFile, FcOpenedFolder, XIcon } from "@kn/icon";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, Checkbox, cn } from "@kn/ui";
import { useSafeState } from "@kn/core";
import React, { useEffect, useMemo, useCallback } from "react";
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


export const FileCard: React.FC<FileItem> = React.memo((props) => {
    const { isFolder, id, name } = props
    const { selectedFiles, setSelectFiles, selectable, setCurrentFolderId, loading } = useFileManagerState() as FileManagerState
    const [checked, setChecked] = useSafeState<boolean>(false)

    useEffect(() => {
        setChecked(!!selectedFiles.find(it => it.id === id))
    }, [selectedFiles, id])

    const handleCheckChange = useCallback((value: boolean) => {
        if (value) {
            setSelectFiles([...selectedFiles, props])
        } else {
            setSelectFiles(selectedFiles.filter(it => it.id !== id))
        }
    }, [selectedFiles, props, id, setSelectFiles])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (isFolder) {
            setCurrentFolderId(id)
        }
    }, [isFolder, id, setCurrentFolderId])

    const handleContextMenu = useCallback(() => {
        if (selectable) {
            setChecked(true)
        }
    }, [selectable])

    if (!name) return null

    return <div
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        className="group"
    >
        <Card className={cn(
            "w-[160px] border hover:border-primary/50 hover:shadow-md transition-all cursor-pointer",
            checked && "border-primary bg-primary/5",
            loading && "opacity-50 pointer-events-none"
        )}>
            <CardHeader className="p-2">
                <div className="flex items-center justify-between">
                    {
                        selectable && <Checkbox
                            checked={checked}
                            onCheckedChange={handleCheckChange}
                            disabled={loading}
                        />
                    }
                    <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="p-1 hover:bg-accent cursor-pointer rounded" title="Download">
                            <Download className="h-3 w-3" />
                        </div>
                        <div className="p-1 hover:bg-accent cursor-pointer rounded" title="Preview">
                            <EyeIcon className="h-3 w-3" />
                        </div>
                        <div className="p-1 hover:bg-destructive/10 cursor-pointer rounded" title="Delete">
                            <XIcon className="h-3 w-3 hover:text-destructive" />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-4">
                {
                    isFolder ?
                        <FcOpenedFolder className="h-20 w-20" /> :
                        <FcFile className="h-20 w-20" />
                }
            </CardContent>
            <CardFooter className="px-2 pb-2 pt-0">
                <div className="w-full truncate text-xs text-center" title={name}>
                    {name}
                </div>
            </CardFooter>
        </Card>
    </div>
})

export const FileCardList: React.FC = React.memo(() => {
    const { currentFolderItems } = useFileManagerState() as FileManagerState

    return <div className="h-full w-full overflow-auto max-h-full">
        <div className="flex flex-wrap w-full gap-2 p-6">
            {
                currentFolderItems.map((it) => (
                    <FileCard
                        key={it.id}
                        {...it}
                    />
                ))
            }
        </div>
    </div>
})