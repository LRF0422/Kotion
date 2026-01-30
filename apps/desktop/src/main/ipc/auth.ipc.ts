import { ipcMain } from 'electron'
import { createResponse, createErrorResponse } from './index'
import * as authService from '../services/auth.service'

export const registerAuthIpcHandlers = () => {
    // Login
    ipcMain.handle('auth:login', async (_event, data: authService.LoginData) => {
        try {
            const result = await authService.login(data)
            return createResponse(result)
        } catch (error: any) {
            return createErrorResponse(error.message, 401)
        }
    })

    // Register
    ipcMain.handle('auth:register', async (_event, data: authService.RegisterData) => {
        try {
            const user = await authService.register(data)
            return createResponse(user)
        } catch (error: any) {
            return createErrorResponse(error.message, 400)
        }
    })

    // Logout
    ipcMain.handle('auth:logout', async () => {
        authService.logout()
        return createResponse(null, true, 'Logged out successfully')
    })
}
