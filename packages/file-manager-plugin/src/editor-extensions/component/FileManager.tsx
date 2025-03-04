import { CopySlash, DownloadIcon, FileIcon, FolderIcon, ListIcon, ScissorsIcon, Trash2, UploadIcon } from "@repo/icon";
import { Button, TreeView, cn } from "@repo/ui";
import React, { useEffect, useState } from "react";
import { FileCardList } from "./FileCard";
import "@repo/ui/globals.css"
import { useSafeState, useUploadFile } from "@repo/core";
import { useApi } from "@repo/core";
import { APIS } from "../../api";


export interface FileManagerProps {
    folderId?: string
    className?: string
}

export interface FileProps {
    name: string,
    isFolder: boolean,
    id: string,
    children?: FileProps[]
}

export const FileManagerView: React.FC<FileManagerProps> = (props) => {

    const [selectedFiles, setSelectFiles] = useSafeState<string[]>([])
    const [currentFolderId, setCurrentFolderId] = useSafeState<string | undefined>(props.folderId)
    const [currentItem, setCurrentItem] = useState<any | undefined>()
    const [updateFlag, setUpdateFlag] = useState(0)
    const [currentFolderItems, setCurrentFolderItems] = useState<FileProps[]>([])
    const [repoKey, setRepoKey] = useState<string>()
    const [files, setFiles] = useSafeState<FileProps[]>([])
    const { folderId } = props
    const { uploadedFiles, upload } = useUploadFile()


    const reslove = (file: any) => {
        if (!file.children) {
            return {
                id: file.id,
                name: file.name,
                isFolder: file.type.value === 'FOLDER',
                icon: file.type.value === 'FOLDER' ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />,
                onClick: () => {
                    if (file.type.value === 'FOLDER') {
                        setCurrentFolderId(file.id)
                    }
                    setCurrentItem(file)
                }
            }
        } else {
            return {
                id: file.id,
                name: file.name,
                isFolder: file.type.value === 'FOLDER',
                children: file.children.map((item: any) => reslove(item)),
                icon: file.type.value === 'FOLDER' ? <FolderIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />,
                onClick: () => {
                    if (file.type.value === 'FOLDER') {
                        setCurrentFolderId(file.id)
                    }
                    setCurrentItem(file)
                }
            }
        }
    }
    useEffect(() => {
        if (!folderId) {
            useApi(APIS.GET_ROOT_FOLDER).then(res => {
                setFiles(res.data.map((item: any) => reslove(item)))
            })
        }
    }, [folderId, updateFlag])

    useEffect(() => {
        if (currentItem && currentItem.type.value === 'FOLDER') {
            useApi(APIS.GET_CHILDREN, { folderId: currentItem.id }).then(res => {
                setCurrentFolderItems(res.data.map((item: any) => reslove(item)))
            })
        }
    }, [currentItem])

    return <div className={cn("rounded-sm border not-prose", props.className)}>
        <div className=" w-full bg-muted border-b flex items-center justify-between">
            <div className="flex items-center">
                <Button size="sm" variant="ghost" onClick={() => {
                    upload().then(res => {
                        useApi(APIS.UPLOAD_FILE, null, {
                            name: res.orginalName,
                            path: res.name
                        }).then(res => {
                            console.log(res)
                        })
                    })
                }}>
                    <UploadIcon className="-ms-1 me-2 opacity-60 mr-1" size={16} strokeWidth={2} aria-hidden="true" />
                    Upload
                </Button>
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
        <div className="grid w-full transition-all grid-cols-[200px_1fr] h-full">
            <div className="border-r h-full">
                <div className=" p-1 bg-muted/80">
                    Files
                </div>
                <TreeView
                    selectParent={true}
                    size="sm"
                    className="w-full m-0"
                    elements={files}
                />
            </div>
            <div className="">
                <div className="w-full border-b bg-muted/50 h-[45px] flex items-center" >
                    <div className="ml-2">
                        Files
                    </div>
                </div>
                <FileCardList files={currentFolderItems} selectedFiles={selectedFiles} setSelectFiles={setSelectFiles} />
                {/* <FileList files={files} selectedFiles={selectedFiles} setSelectFiles={setSelectFiles} /> */}
            </div>
        </div>
    </div>
}