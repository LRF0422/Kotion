import { ipcMain } from 'electron'
import { createResponse, createErrorResponse } from './index'
import * as imService from '../services/im.service'

export const registerImIpcHandlers = () => {
    // Send message
    ipcMain.handle('im:send', async (_event, data: imService.SendMessageData) => {
        try {
            const message = await imService.sendMessage(data)
            return createResponse(message)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get conversation with user
    ipcMain.handle('im:getConversation', async (_event, userId: string) => {
        try {
            const messages = await imService.getConversation(userId)
            return createResponse(messages)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get all conversations
    ipcMain.handle('im:getConversations', async () => {
        try {
            const conversations = await imService.getConversations()
            return createResponse(conversations)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get unread count
    ipcMain.handle('im:getUnreadCount', async () => {
        try {
            const count = await imService.getUnreadCount()
            return createResponse({ count })
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get unread messages
    ipcMain.handle('im:getUnreadMessages', async () => {
        try {
            const messages = await imService.getUnreadMessages()
            return createResponse(messages)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Mark messages as read
    ipcMain.handle('im:markRead', async (_event, messageIds: string[]) => {
        try {
            await imService.markRead(messageIds)
            return createResponse(null, true, 'Messages marked as read')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Mark all as read
    ipcMain.handle('im:markAllRead', async () => {
        try {
            await imService.markAllRead()
            return createResponse(null, true, 'All messages marked as read')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Delete message
    ipcMain.handle('im:deleteMessage', async (_event, messageId: string) => {
        try {
            await imService.deleteMessage(messageId)
            return createResponse(null, true, 'Message deleted')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Clear conversation
    ipcMain.handle('im:clearConversation', async (_event, userId: string) => {
        try {
            await imService.clearConversation(userId)
            return createResponse(null, true, 'Conversation cleared')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get online users
    ipcMain.handle('im:getOnlineUsers', async () => {
        try {
            const users = await imService.getOnlineUsers()
            return createResponse(users)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Check if user is online
    ipcMain.handle('im:checkUserOnline', async (_event, userId: string) => {
        try {
            const isOnline = await imService.checkUserOnline(userId)
            return createResponse({ isOnline })
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get online count
    ipcMain.handle('im:getOnlineCount', async () => {
        try {
            const count = await imService.getOnlineCount()
            return createResponse({ count })
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })
}
