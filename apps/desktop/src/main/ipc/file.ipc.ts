import { ipcMain, shell } from 'electron'
import { createResponse, createErrorResponse } from './index'
import * as fileService from '../services/file.service'

export const registerFileIpcHandlers = () => {
    // Upload file
    ipcMain.handle('file:upload', async (_event, data: { name: string; buffer: ArrayBuffer; mimeType: string }) => {
        try {
            const result = await fileService.uploadFile(data)
            return createResponse(result)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get root folder
    ipcMain.handle('file:getRootFolder', async () => {
        try {
            const files = await fileService.getRootFolder()
            return createResponse(files)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get folder children
    ipcMain.handle('file:getChildren', async (_event, parentId: string) => {
        try {
            const files = await fileService.getChildren(parentId)
            return createResponse(files)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Create folder
    ipcMain.handle('file:createFolder', async (_event, data: fileService.CreateFolderData) => {
        try {
            const folder = await fileService.createFolder(data)
            return createResponse(folder)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Delete file
    ipcMain.handle('file:delete', async (_event, id: string) => {
        try {
            await fileService.deleteFile(id)
            return createResponse(null, true, 'File deleted')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Download file (open in system)
    ipcMain.handle('file:download', async (_event, id: string) => {
        try {
            const result = await fileService.downloadFile(id)
            // Open the file with the default system application
            shell.openPath(result.path)
            return createResponse(result)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Rename file
    ipcMain.handle('file:rename', async (_event, { id, newName }: { id: string; newName: string }) => {
        try {
            const file = await fileService.renameFile(id, newName)
            return createResponse(file)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get file URL
    ipcMain.handle('file:getUrl', async (_event, fileName: string) => {
        try {
            const url = fileService.getFileUrl(fileName)
            return createResponse({ url })
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })
}
