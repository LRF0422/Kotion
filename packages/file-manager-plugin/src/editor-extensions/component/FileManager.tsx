import { Archive, CopyIcon, CopyPlus, CopySlash, DownloadIcon, FileIcon, FolderIcon, ScissorsIcon, Trash2 } from "@repo/icon";
import { Button, TreeView } from "@repo/ui";
import React from "react";
import { FileCard } from "./FileCard";


export interface FileManagerProps {
    folderId: string
}

const files = [
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    },
    {
        name: '',
        isFolder: true
    }
]

export const FileManagerView: React.FC<FileManagerProps> = () => {
    return <div className=" rounded-sm border">
        <div className=" w-full bg-muted border-b flex items-center">
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
        <div className="grid w-full transition-all grid-cols-[200px_1fr]">
            <div className="border-r h-[400px]">
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
            <div>
                <div className="w-full border-b bg-muted/50">
                    <div className="ml-2">
                        Files
                    </div>
                </div>
                <div className="grid grid-cols-4 w-full gap-1 p-6 overflow-auto  h-[calc(100%-100px)]">
                    {
                        files.map((it, index) => (
                            <FileCard key={index} />
                        ))
                    }
                </div>
            </div>
        </div>
    </div>
}