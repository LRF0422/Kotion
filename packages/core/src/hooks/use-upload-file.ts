import { fileOpen } from "browser-fs-access"
import { useApi } from "./use-api";
import { APIS } from "../api";
import { useState } from "react";


export interface KnowledgeFile {
    name: string
    originalName: string
}

export interface UploadKit {
    uploadedFiles: KnowledgeFile[]
    remove: (path: string) => void
    upload: (type?: string[]) => Promise<KnowledgeFile>,
    uploadFile: (file: File) => Promise<KnowledgeFile>,
    usePath: (fileName: string) => string
}

export const useUploadFile = () => {

    const [files, setFiles] = useState<KnowledgeFile[]>([])

    const downloadPath = "https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName="
    const remove = (path: string) => {
        setFiles(files.filter(file => file.name !== path))
    }

    const usePath = (fileName: string) => {
        return downloadPath + fileName
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

    const uploadFile = async (file: File) => {
        const res = await useApi(APIS.UPLOAD_FILE, null, {
            file: file
        }, { 'Content-Type': 'multipart/form-data' })
        setFiles([...files, res.data])
        return res.data
    }

    return {
        uploadedFiles: files,
        upload,
        uploadFile,
        remove,
        usePath
    } as UploadKit

}