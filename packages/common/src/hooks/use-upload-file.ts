import { useState } from "react";
import { useOptionalFileService } from "../services/file-service";
import { fileOpen } from "browser-fs-access";
import { useApi } from "../api/use-api";
import { APIS } from "../api";
import { getAccessToken } from "../utils/auth";

export interface KnowledgeFile {
    name: string
    originalName: string
}

export interface PluginArtifactFile extends KnowledgeFile {
    integrity: string
}

export interface UploadKit {
    uploadedFiles: KnowledgeFile[]
    remove: (path: string) => void
    upload: (type?: string[]) => Promise<KnowledgeFile>,
    uploadFile: (file: File) => Promise<KnowledgeFile>,
    uploadPluginFile: (file: File) => Promise<PluginArtifactFile>,
    usePath: (fileName: string) => string
}

/**
 * @deprecated Use useFileService() from @kn/common instead
 * This hook is kept for backward compatibility
 */
export const useUploadFile = () => {
    const fileService = useOptionalFileService();
    const [files, setFiles] = useState<KnowledgeFile[]>([])

    const downloadPath = "https://kotion.top:888/api/knowledge-resource/oss/endpoint/download?fileName="
    // <img> cannot send the Authorization header, so images load from the
    // anonymous public endpoint (gateway whitelists /oss/endpoint/public/**).
    const publicImagePath = "https://kotion.top:888/api/knowledge-resource/oss/endpoint/public/image?fileName="
    const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i

    const remove = (path: string) => {
        setFiles(files.filter(file => file.name !== path))
    }

    const usePath = (fileName: string) => {
        if (!fileName) {
            return '';
        }
        if (fileName.startsWith('http://') || fileName.startsWith('https://')) {
            return fileName;
        }
        if (IMAGE_FILE.test(fileName)) {
            return publicImagePath + fileName;
        }
        if (fileService) {
            return fileService.getDownloadUrl(fileName);
        }
        const token = getAccessToken();
        return downloadPath + fileName + (token ? '&Authorization=' + token : '')
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

    const uploadPluginFile = async (file: File): Promise<PluginArtifactFile> => {
        const res = await useApi(APIS.UPLOAD_PLUGIN_FILE, null, {
            file
        }, { 'Content-Type': 'multipart/form-data' })
        return res.data
    }

    return {
        uploadedFiles: files,
        upload,
        uploadFile,
        uploadPluginFile,
        remove,
        usePath
    } as UploadKit

}
