import { getDb } from '../db'
import { getCurrentUserId } from './auth.service'
import { v4 as uuidv4 } from 'uuid'

export interface Space {
    id: string
    name: string
    description: string | null
    icon: string | null
    cover: string | null
    home_page_id: string | null
    owner_id: string
    is_personal: number
    created_at: string
    updated_at: string
}

export interface CreateSpaceData {
    name: string
    description?: string
    icon?: string
    cover?: string
}

/**
 * Get all spaces for current user
 */
export const listSpaces = async (): Promise<Space[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    // Get spaces where user is owner or member
    const spaces = db.prepare(`
    SELECT DISTINCT s.* FROM spaces s
    LEFT JOIN space_members sm ON s.id = sm.space_id
    WHERE s.owner_id = ? OR sm.user_id = ?
    ORDER BY s.created_at DESC
  `).all(userId, userId) as Space[]

    return spaces
}

/**
 * Get personal space for current user
 */
export const getPersonalSpace = async (): Promise<Space | null> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const space = db.prepare(`
    SELECT * FROM spaces WHERE owner_id = ? AND is_personal = 1
  `).get(userId) as Space | undefined

    return space || null
}

/**
 * Get space by ID
 */
export const getSpaceDetail = async (id: string): Promise<Space | null> => {
    const db = getDb()
    const space = db.prepare(`
    SELECT * FROM spaces WHERE id = ?
  `).get(id) as Space | undefined

    return space || null
}

/**
 * Create a new space
 */
export const createSpace = async (data: CreateSpaceData): Promise<Space> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const spaceId = uuidv4()

    db.prepare(`
    INSERT INTO spaces (id, name, description, icon, cover, owner_id, is_personal)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(spaceId, data.name, data.description || null, data.icon || null, data.cover || null, userId)

    // Add owner as member
    db.prepare(`
    INSERT INTO space_members (id, space_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `).run(uuidv4(), spaceId, userId)

    const space = db.prepare(`SELECT * FROM spaces WHERE id = ?`).get(spaceId) as Space
    return space
}

/**
 * Update space
 */
export const updateSpace = async (id: string, data: Partial<CreateSpaceData>): Promise<Space | null> => {
    const db = getDb()

    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
        updates.push('name = ?')
        values.push(data.name)
    }
    if (data.description !== undefined) {
        updates.push('description = ?')
        values.push(data.description)
    }
    if (data.icon !== undefined) {
        updates.push('icon = ?')
        values.push(data.icon)
    }
    if (data.cover !== undefined) {
        updates.push('cover = ?')
        values.push(data.cover)
    }

    if (updates.length > 0) {
        updates.push("updated_at = datetime('now')")
        values.push(id)

        db.prepare(`UPDATE spaces SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    return getSpaceDetail(id)
}

/**
 * Delete space
 */
export const deleteSpace = async (id: string): Promise<void> => {
    const db = getDb()

    // Delete all pages in space
    db.prepare(`DELETE FROM pages WHERE space_id = ?`).run(id)

    // Delete space members
    db.prepare(`DELETE FROM space_members WHERE space_id = ?`).run(id)

    // Delete space favorites
    db.prepare(`DELETE FROM favorites WHERE space_id = ?`).run(id)

    // Delete space
    db.prepare(`DELETE FROM spaces WHERE id = ?`).run(id)
}

/**
 * Add space to favorites
 */
export const addSpaceFavorite = async (spaceId: string): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    // Check if already favorited
    const existing = db.prepare(`
    SELECT id FROM favorites WHERE user_id = ? AND space_id = ?
  `).get(userId, spaceId)

    if (!existing) {
        db.prepare(`
      INSERT INTO favorites (id, user_id, space_id)
      VALUES (?, ?, ?)
    `).run(uuidv4(), userId, spaceId)
    }
}

/**
 * Remove space from favorites
 */
export const removeSpaceFavorite = async (spaceId: string): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    db.prepare(`DELETE FROM favorites WHERE user_id = ? AND space_id = ?`).run(userId, spaceId)
}

/**
 * Get space members
 */
export const getSpaceMembers = async (spaceId: string): Promise<any[]> => {
    const db = getDb()

    const members = db.prepare(`
    SELECT u.id, u.username, u.email, u.avatar, u.nickname, sm.role, sm.joined_at
    FROM space_members sm
    JOIN users u ON sm.user_id = u.id
    WHERE sm.space_id = ?
  `).all(spaceId)

    return members
}

/**
 * Save space as template
 */
export const saveSpaceAsTemplate = async (spaceId: string): Promise<void> => {
    const db = getDb()

    // Mark all pages in space as templates
    db.prepare(`UPDATE pages SET is_template = 1 WHERE space_id = ?`).run(spaceId)
}
