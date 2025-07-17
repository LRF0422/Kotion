import { API } from "@repo/core";


export const APIS = {

    GET_ROOT_FOLDER: {
        url: '/knowledge-file-center/folder/root',
        method: 'GET',
        name: 'Get Root Folder'
    } as API,
    UPLOAD_FILE: {
        url: '/knowledge-file-center/file',
        method: 'POST',
        name: 'Upload File'
    } as API,
    GET_CHILDREN: {
        url: '/knowledge-file-center/folder/children',
        method: 'GET',
        name: 'Get Children'
    } as API,
    CREATE_FOLDER: {
        url: '/knowledge-file-center/file',
        method: 'POST',
        name: 'Create Folder'
    } as API

}