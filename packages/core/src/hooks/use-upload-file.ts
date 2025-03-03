import { fileOpen } from "browser-fs-access"
import { useApi } from "./use-api";
import { APIS } from "../api";
import { useState } from "react";


export interface KnowledgeFile {
    name: string
    orginalName: string
}

export interface UploadKit {
    uploadedFiles: KnowledgeFile[]
    remove: (path: string) => void
    upload: (type?: string[]) => Promise<KnowledgeFile>
}

export const useUploadFile = () => {

    const [files, setFiles] = useState<KnowledgeFile[]>([])
    const remove = (path: string) => {
        setFiles(files.filter(file => file.name !== path))
    }
    const upload = async (type: string[] = ["**/*"]) => {
        const blob = await fileOpen({
            mimeTypes: type
        });
        const res = await useApi(APIS.UPLOAD_FILE, null, {
            file: blob
        }, { 'Content-Type': 'multipart/form-data' })
        setFiles([...files, res.data])
        return res.data
    }

    return {
        uploadedFiles: files,
        upload,
        remove
    } as UploadKit

}