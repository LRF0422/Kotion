import { CopySlash, DownloadIcon, FileIcon, FolderIcon, ListIcon, ScissorsIcon, Trash2 } from "@repo/icon";
import { Button, TreeView, cn } from "@repo/ui";
import React, { useEffect } from "react";
import { FileCardList } from "./FileCard";
import { FileList } from "./FileList";
import "@repo/ui/globals.css"
import { useSafeState } from "ahooks";
import { useApi } from "@repo/core";
import { APIS } from "../../api";


export interface FileManagerProps {
    folderId?: string
    className?: string
}

export interface FileProps {
    name: string,
    isFolder: boolean,
    id: string
}

const files: FileProps[] = [
    {
        name: 'tmp',
        isFolder: true,
        id: '1123123'
    },
    {
        name: 'workspace',
        isFolder: false,
        id: 'wwerewre'
    },
    {
        name: 'workspace',
        isFolder: true,
        id: 'drgfhfg'
    },
    {
        name: 'workspace',
        isFolder: true,
        id: "43656"
    },
]

export const FileManagerView: React.FC<FileManagerProps> = (props) => {

    const [selectedFiles, setSelectFiles] = useSafeState<string[]>([])
    const [files, setFiles] = useSafeState<FileProps[]>([])
    const { folderId} = props

    useEffect(() => {
        if(!folderId) {
            useApi(APIS.GET_ROOT_FOLDER)
        }
    }, [folderId])

    return <div className={cn("rounded-sm border not-prose", props.className)}>
        <div className=" w-full bg-muted border-b flex items-center justify-between">
            <div className="flex items-center">
                <Button size="sm" variant="ghost">
                    <CopySlash className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                    Copy
                </Button>
                <Button size="sm" variant="ghost">
                    <ScissorsIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                    Cut
                </Button>
                <Button size="sm" variant="ghost">
                    <Trash2 className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                    Delete
                </Button>
                <Button size="sm" variant="ghost">
                    <DownloadIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                    Download
                </Button>
            </div>
            <div className="flex items-center">
                <Button size="sm" variant="ghost">
                    <ListIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                </Button>
            </div>
        </div>
        <div className="grid w-full transition-all grid-cols-[200px_1fr]">
            <div className="border-r h-[calc(100vh-40px)]">
                <TreeView
                    size="sm"
                    className="w-full m-0"
                    elements={[
                        {
                            name: 'Folder 1',
                            id: '1',
                            icon: <FolderIcon className="h-4 w-4" />,
                            children: [
                                {
                                    name: 'Folder 2',
                                    id: '1-1',
                                    icon: <FileIcon className="h-4 w-4" />,
                                }
                            ]
                        }
                    ]}
                />
            </div>
            <div className="">
                <div className="w-full border-b bg-muted/50 h-[45px] flex items-center" >
                    <div className="ml-2">
                        Files
                    </div>
                </div>
                <FileCardList files={files} selectedFiles={selectedFiles} setSelectFiles={setSelectFiles} />
                <FileList files={files} selectedFiles={selectedFiles} setSelectFiles={setSelectFiles} />
            </div>
        </div>
    </div>
}