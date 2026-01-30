import { ipcMain } from 'electron'
import { createResponse, createErrorResponse } from './index'
import * as pageService from '../services/page.service'

export const registerPageIpcHandlers = () => {
    // Get page tree
    ipcMain.handle('page:getTree', async (_event, { spaceId, searchValue }: { spaceId: string; searchValue?: string }) => {
        try {
            const tree = await pageService.getPageTree(spaceId, searchValue)
            return createResponse(tree)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get page content
    ipcMain.handle('page:getContent', async (_event, id: string) => {
        try {
            const page = await pageService.getPageContent(id)
            return createResponse(page)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Create page
    ipcMain.handle('page:create', async (_event, data: pageService.CreatePageData) => {
        try {
            const page = await pageService.createPage(data)
            return createResponse(page)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Save page
    ipcMain.handle('page:save', async (_event, data: any) => {
        try {
            const page = await pageService.savePage(data)
            return createResponse(page)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Move to trash
    ipcMain.handle('page:moveToTrash', async (_event, id: string) => {
        try {
            await pageService.moveToTrash(id)
            return createResponse(null, true, 'Moved to trash')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Restore from trash
    ipcMain.handle('page:restore', async (_event, id: string) => {
        try {
            await pageService.restorePage(id)
            return createResponse(null, true, 'Page restored')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // List pages
    ipcMain.handle('page:list', async (_event, params: any) => {
        try {
            const result = await pageService.listPages(params)
            return createResponse(result)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get favorites
    ipcMain.handle('page:getFavorites', async (_event, params: any) => {
        try {
            const result = await pageService.getFavoritePages(params)
            return createResponse(result)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get recent pages
    ipcMain.handle('page:getRecent', async () => {
        try {
            const pages = await pageService.getRecentPages()
            return createResponse(pages)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get templates
    ipcMain.handle('page:getTemplates', async () => {
        try {
            const templates = await pageService.getTemplates()
            return createResponse(templates)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Save as template
    ipcMain.handle('page:saveAsTemplate', async (_event, id: string) => {
        try {
            await pageService.saveAsTemplate(id)
            return createResponse(null, true, 'Saved as template')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Add to favorites
    ipcMain.handle('page:addFavorite', async (_event, id: string) => {
        try {
            await pageService.addPageFavorite(id)
            return createResponse(null, true, 'Added to favorites')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Remove from favorites
    ipcMain.handle('page:removeFavorite', async (_event, id: string) => {
        try {
            await pageService.removePageFavorite(id)
            return createResponse(null, true, 'Removed from favorites')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get blocks
    ipcMain.handle('page:getBlocks', async (_event, params: any) => {
        try {
            const blocks = await pageService.queryBlocks(params)
            return createResponse(blocks)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get block info
    ipcMain.handle('page:getBlockInfo', async (_event, id: string) => {
        try {
            const block = await pageService.getBlockInfo(id)
            return createResponse(block)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get collaborators
    ipcMain.handle('page:getCollaborators', async (_event, pageId: string) => {
        try {
            const collaborators = await pageService.getPageCollaborators(pageId)
            return createResponse(collaborators)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })
}
