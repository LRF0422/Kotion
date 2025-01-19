import { fileOpen } from "browser-fs-access";
import { APIS } from "../api";
import { useApi } from "../hooks/use-api";

export async function upload() {
    const blob = await fileOpen({
        mimeTypes: ["**/*"]
    });
    const res = await useApi(APIS.UPLOAD_FILE, null, {
        file: blob
    }, { 'Content-Type': 'multipart/form-data' })
    return res
}