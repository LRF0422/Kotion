import { getDb } from '../db'
import { getCurrentUserId } from './auth.service'

export interface User {
    id: string
    username: string
    email: string | null
    avatar: string | null
    nickname: string | null
    created_at: string
    updated_at: string
}

/**
 * Get current user info
 */
export const getUserInfo = async (): Promise<User | null> => {
    const userId = getCurrentUserId()

    if (!userId) {
        return null
    }

    const db = getDb()
    const user = db.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users WHERE id = ?
  `).get(userId) as User | undefined

    return user || null
}

/**
 * Get user by ID
 */
export const getUserById = async (id: string): Promise<User | null> => {
    const db = getDb()
    const user = db.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users WHERE id = ?
  `).get(id) as User | undefined

    return user || null
}

/**
 * Search users by username or email
 */
export const searchUsers = async (query: string): Promise<User[]> => {
    const db = getDb()
    const searchPattern = `%${query}%`

    const users = db.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users
    WHERE username LIKE ? OR email LIKE ? OR nickname LIKE ?
    LIMIT 20
  `).all(searchPattern, searchPattern, searchPattern) as User[]

    return users
}

/**
 * Update user profile
 */
export const updateProfile = async (data: {
    nickname?: string
    email?: string
    avatar?: string
}): Promise<User | null> => {
    const userId = getCurrentUserId()

    if (!userId) {
        throw new Error('Not logged in')
    }

    const db = getDb()

    const updates: string[] = []
    const values: any[] = []

    if (data.nickname !== undefined) {
        updates.push('nickname = ?')
        values.push(data.nickname)
    }
    if (data.email !== undefined) {
        updates.push('email = ?')
        values.push(data.email)
    }
    if (data.avatar !== undefined) {
        updates.push('avatar = ?')
        values.push(data.avatar)
    }

    if (updates.length > 0) {
        updates.push("updated_at = datetime('now')")
        values.push(userId)

        db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).run(...values)
    }

    return getUserInfo()
}

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (): Promise<User[]> => {
    const db = getDb()
    const users = db.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
  `).all() as User[]

    return users
}
