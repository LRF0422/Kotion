import { getDb } from '../db'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

// Store for current user session (in-memory for desktop app)
let currentUserId: string | null = null
let currentUserToken: string | null = null

export interface LoginData {
    account: string
    password: string
}

export interface RegisterData {
    username: string
    password: string
    email?: string
}

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
 * Login user and return access token
 */
export const login = async (data: LoginData): Promise<{ accessToken: string; user: User }> => {
    const db = getDb()

    const user = db.prepare(`
    SELECT id, username, password_hash, email, avatar, nickname, created_at, updated_at
    FROM users
    WHERE username = ?
  `).get(data.account) as any

    if (!user) {
        throw new Error('User not found')
    }

    const isPasswordValid = bcrypt.compareSync(data.password, user.password_hash)

    if (!isPasswordValid) {
        throw new Error('Invalid password')
    }

    // Generate a simple token (in a real app, use JWT)
    const token = `desktop_${uuidv4()}_${Date.now()}`

    // Store current session
    currentUserId = user.id
    currentUserToken = token

    return {
        accessToken: token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            nickname: user.nickname,
            created_at: user.created_at,
            updated_at: user.updated_at
        }
    }
}

/**
 * Register a new user
 */
export const register = async (data: RegisterData): Promise<User> => {
    const db = getDb()

    // Check if username already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(data.username)

    if (existingUser) {
        throw new Error('Username already exists')
    }

    const userId = uuidv4()
    const passwordHash = bcrypt.hashSync(data.password, 10)

    db.prepare(`
    INSERT INTO users (id, username, password_hash, email, nickname)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, data.username, passwordHash, data.email || null, data.username)

    // Create personal space for new user
    const spaceId = uuidv4()
    db.prepare(`
    INSERT INTO spaces (id, name, description, owner_id, is_personal)
    VALUES (?, ?, ?, ?, ?)
  `).run(spaceId, 'Personal Space', 'Your personal workspace', userId, 1)

    // Add user as space member
    db.prepare(`
    INSERT INTO space_members (id, space_id, user_id, role)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), spaceId, userId, 'owner')

    // Create welcome page
    const pageId = uuidv4()
    db.prepare(`
    INSERT INTO pages (id, space_id, title, content, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(pageId, spaceId, 'Welcome', JSON.stringify({
        type: 'doc',
        content: [
            {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Welcome!' }]
            },
            {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Start creating your knowledge base.' }]
            }
        ]
    }), userId)

    // Update space with home page
    db.prepare(`UPDATE spaces SET home_page_id = ? WHERE id = ?`).run(pageId, spaceId)

    const user = db.prepare(`
    SELECT id, username, email, avatar, nickname, created_at, updated_at
    FROM users WHERE id = ?
  `).get(userId) as User

    return user
}

/**
 * Get current user ID
 */
export const getCurrentUserId = (): string | null => {
    return currentUserId
}

/**
 * Set current user ID (for testing/debugging)
 */
export const setCurrentUserId = (userId: string | null) => {
    currentUserId = userId
}

/**
 * Check if user is logged in
 */
export const isLoggedIn = (): boolean => {
    return currentUserId !== null
}

/**
 * Logout current user
 */
export const logout = () => {
    currentUserId = null
    currentUserToken = null
}
