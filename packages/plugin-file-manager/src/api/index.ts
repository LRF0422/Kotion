import { API } from "@kn/common";

/**
 * FileCenter API 定义。
 * 路径占位用 `:name`,由 useApi 的 fillPathParam 依据 param 替换。
 * 注意:POST 会同时转发 query params + body;PUT/DELETE 只发 body,故路径参数化的 PUT/DELETE 必须把 id 放进 :占位。
 */
export const APIS = {

    // ===== 查询 =====
    GET_ROOT_FOLDER: {
        url: '/knowledge-file-center/folder/root',
        method: 'GET',
        name: 'Get Root Folder'
    } as API,
    GET_CHILDREN: {
        url: '/knowledge-file-center/folder/children',
        method: 'GET',
        name: 'Get Children'
    } as API,
    GET_CHILDREN_PAGE: {
        url: '/knowledge-file-center/folder/children/page',
        method: 'GET',
        name: 'Get Children Paged'
    } as API,
    GET_BY_ID: {
        url: '/knowledge-file-center/file/:fileId',
        method: 'GET',
        name: 'Get File By Id'
    } as API,
    SEARCH_FILES: {
        url: '/knowledge-file-center/file/search',
        method: 'GET',
        name: 'Search Files'
    } as API,

    // ===== 创建 / 上传 =====
    CREATE_FILE: {
        url: '/knowledge-file-center/file',
        method: 'POST',
        name: 'Create File/Folder'
    } as API,
    // 别名:创建文件夹仍走 CREATE_FILE(type=FOLDER)
    CREATE_FOLDER: {
        url: '/knowledge-file-center/file',
        method: 'POST',
        name: 'Create Folder'
    } as API,
    UPLOAD_FILE: {
        url: '/knowledge-file-center/file/upload',
        method: 'POST',
        name: 'Upload File'
    } as API,
    BATCH_UPLOAD: {
        url: '/knowledge-file-center/file/batch-upload',
        method: 'POST',
        name: 'Batch Upload Files'
    } as API,

    // ===== 修改 =====
    RENAME_FILE: {
        url: '/knowledge-file-center/file/:fileId/rename',
        method: 'PUT',
        name: 'Rename File/Folder'
    } as API,
    MOVE_FILE: {
        url: '/knowledge-file-center/file/move',
        method: 'PUT',
        name: 'Move File/Folder'
    } as API,
    COPY_FILE: {
        url: '/knowledge-file-center/file/:fileId/copy',
        method: 'POST',
        name: 'Copy File/Folder'
    } as API,

    // ===== 下载 =====
    DOWNLOAD_FILE: {
        url: '/knowledge-file-center/file/:fileId/download',
        method: 'GET',
        name: 'Download File'
    } as API,

    // ===== 删除 / 回收站 =====
    DELETE_FILE: {
        url: '/knowledge-file-center/file/:fileId',
        method: 'DELETE',
        name: 'Delete File (to trash)'
    } as API,
    BATCH_DELETE: {
        url: '/knowledge-file-center/file/batch',
        method: 'DELETE',
        name: 'Batch Delete Files'
    } as API,
    TRASH_FILE: {
        url: '/knowledge-file-center/file/:fileId/trash',
        method: 'PUT',
        name: 'Move To Trash'
    } as API,
    RESTORE_FILE: {
        url: '/knowledge-file-center/file/:fileId/restore',
        method: 'PUT',
        name: 'Restore From Trash'
    } as API,
    LIST_TRASH: {
        url: '/knowledge-file-center/trash',
        method: 'GET',
        name: 'List Trash'
    } as API,
    PURGE_FILE: {
        url: '/knowledge-file-center/file/:fileId/purge',
        method: 'DELETE',
        name: 'Permanently Delete File'
    } as API,
    EMPTY_TRASH: {
        url: '/knowledge-file-center/trash',
        method: 'DELETE',
        name: 'Empty Trash'
    } as API,

    // ===== 收藏 / 最近 =====
    TOGGLE_FAVORITE: {
        url: '/knowledge-file-center/file/:fileId/favorite',
        method: 'POST',
        name: 'Toggle Favorite'
    } as API,
    LIST_FAVORITES: {
        url: '/knowledge-file-center/favorites',
        method: 'GET',
        name: 'List Favorites'
    } as API,
    LIST_RECENT: {
        url: '/knowledge-file-center/recent',
        method: 'GET',
        name: 'List Recent'
    } as API,

}
