import { useState } from "react";
import { useOptionalFileService } from "../services/file-service";
import { fileOpen } from "browser-fs-access";
import { useApi } from "./use-api";
import { APIS } from "../api";

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

/**
 * @deprecated Use useFileService() from @kn/core instead
 * This hook is kept for backward compatibility
 */
export const useUploadFile = () => {
    const fileService = useOptionalFileService();
    const [files, setFiles] = useState<KnowledgeFile[]>([])

    const downloadPath = "https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName="

    const remove = (path: string) => {
        setFiles(files.filter(file => file.name !== path))
    }

    const usePath = (fileName: string) => {
        if (fileService) {
            return fileService.getDownloadUrl(fileName);
        }
        return downloadPath + fileName
    }

    const upload = async (type: string[] = ["**/*"]) => {
        if (fileService) {
            const result = await fileService.upload({ mimeTypes: type });
            const knFile = { name: result.name, originalName: result.originalName };
            setFiles([...files, knFile]);
            return knFile;
        }

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
        if (fileService) {
            const result = await fileService.uploadFile(file);
            const knFile = { name: result.name, originalName: result.originalName };
            setFiles([...files, knFile]);
            return knFile;
        }

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