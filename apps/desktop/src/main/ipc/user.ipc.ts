import { ipcMain } from 'electron'
import { createResponse, createErrorResponse } from './index'
import * as userService from '../services/user.service'

export const registerUserIpcHandlers = () => {
    // Get current user info
    ipcMain.handle('user:getInfo', async () => {
        try {
            const user = await userService.getUserInfo()
            if (!user) {
                return createErrorResponse('Not logged in', 401)
            }
            return createResponse(user)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Search users
    ipcMain.handle('user:search', async (_event, query: string) => {
        try {
            const users = await userService.searchUsers(query)
            return createResponse(users)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Update user profile
    ipcMain.handle('user:updateProfile', async (_event, data: any) => {
        try {
            const user = await userService.updateProfile(data)
            return createResponse(user)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get user by ID
    ipcMain.handle('user:getById', async (_event, id: string) => {
        try {
            const user = await userService.getUserById(id)
            return createResponse(user)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })
}
