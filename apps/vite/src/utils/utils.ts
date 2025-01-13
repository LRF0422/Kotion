import { APIS } from "../api";
import { useApi } from "../hooks/use-api";
import { fileOpen } from "browser-fs-access";

export async function upload() {
    const blob = await fileOpen({
        mimeTypes: ["**/*"]
    });
    const res = await useApi(APIS.UPLOAD_FILE, null, {
        file: blob
    }, { 'Content-Type': 'multipart/form-data' })
    return res
}