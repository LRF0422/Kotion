import { getDb } from '../db'
import { getCurrentUserId } from './auth.service'
import { v4 as uuidv4 } from 'uuid'

export interface Page {
    id: string
    space_id: string
    parent_id: string | null
    title: string
    content: string | null
    icon: string | null
    cover: string | null
    status: string
    is_template: number
    sort_order: number
    created_by: string
    created_at: string
    updated_at: string
}

export interface CreatePageData {
    spaceId: string
    parentId?: string
    title?: string
    content?: string
    icon?: string
    cover?: string
}

export interface PageTreeNode extends Page {
    children?: PageTreeNode[]
}

/**
 * Get page tree for a space
 */
export const getPageTree = async (spaceId: string, searchValue?: string): Promise<PageTreeNode[]> => {
    const db = getDb()

    let query = `
    SELECT * FROM pages 
    WHERE space_id = ? AND status = 'active'
  `
    const params: any[] = [spaceId]

    if (searchValue) {
        query += ` AND title LIKE ?`
        params.push(`%${searchValue}%`)
    }

    query += ` ORDER BY sort_order ASC, created_at ASC`

    const pages = db.prepare(query).all(...params) as Page[]

    // Build tree structure
    const buildTree = (parentId: string | null): PageTreeNode[] => {
        return pages
            .filter(p => p.parent_id === parentId)
            .map(page => ({
                ...page,
                children: buildTree(page.id)
            }))
    }

    return buildTree(null)
}

/**
 * Get page content by ID
 */
export const getPageContent = async (id: string): Promise<Page | null> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const page = db.prepare(`SELECT * FROM pages WHERE id = ?`).get(id) as Page | undefined

    if (page) {
        // Record as recent page
        const existing = db.prepare(`
      SELECT id FROM recent_pages WHERE user_id = ? AND page_id = ?
    `).get(userId, id)

        if (existing) {
            db.prepare(`
        UPDATE recent_pages SET viewed_at = datetime('now') WHERE user_id = ? AND page_id = ?
      `).run(userId, id)
        } else {
            db.prepare(`
        INSERT INTO recent_pages (id, user_id, page_id) VALUES (?, ?, ?)
      `).run(uuidv4(), userId, id)
        }
    }

    return page || null
}

/**
 * Create a new page
 */
export const createPage = async (data: CreatePageData): Promise<Page> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const pageId = uuidv4()

    db.prepare(`
    INSERT INTO pages (id, space_id, parent_id, title, content, icon, cover, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        pageId,
        data.spaceId,
        data.parentId || null,
        data.title || 'Untitled',
        data.content || null,
        data.icon || null,
        data.cover || null,
        userId
    )

    const page = db.prepare(`SELECT * FROM pages WHERE id = ?`).get(pageId) as Page
    return page
}

/**
 * Save/update page
 */
export const savePage = async (data: { id?: string } & CreatePageData): Promise<Page> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    if (data.id) {
        // Update existing page
        const updates: string[] = []
        const values: any[] = []

        if (data.title !== undefined) {
            updates.push('title = ?')
            values.push(data.title)
        }
        if (data.content !== undefined) {
            updates.push('content = ?')
            values.push(data.content)
        }
        if (data.icon !== undefined) {
            updates.push('icon = ?')
            values.push(data.icon)
        }
        if (data.cover !== undefined) {
            updates.push('cover = ?')
            values.push(data.cover)
        }
        if (data.parentId !== undefined) {
            updates.push('parent_id = ?')
            values.push(data.parentId || null)
        }

        if (updates.length > 0) {
            updates.push("updated_at = datetime('now')")
            values.push(data.id)

            db.prepare(`UPDATE pages SET ${updates.join(', ')} WHERE id = ?`).run(...values)
        }

        return db.prepare(`SELECT * FROM pages WHERE id = ?`).get(data.id) as Page
    } else {
        // Create new page
        return createPage(data)
    }
}

/**
 * Move page to trash
 */
export const moveToTrash = async (id: string): Promise<void> => {
    const db = getDb()
    db.prepare(`UPDATE pages SET status = 'trash', updated_at = datetime('now') WHERE id = ?`).run(id)
}

/**
 * Restore page from trash
 */
export const restorePage = async (id: string): Promise<void> => {
    const db = getDb()
    db.prepare(`UPDATE pages SET status = 'active', updated_at = datetime('now') WHERE id = ?`).run(id)
}

/**
 * Permanently delete page
 */
export const deletePage = async (id: string): Promise<void> => {
    const db = getDb()

    // Delete child pages recursively
    const children = db.prepare(`SELECT id FROM pages WHERE parent_id = ?`).all(id) as { id: string }[]
    for (const child of children) {
        await deletePage(child.id)
    }

    // Delete favorites
    db.prepare(`DELETE FROM favorites WHERE page_id = ?`).run(id)

    // Delete recent records
    db.prepare(`DELETE FROM recent_pages WHERE page_id = ?`).run(id)

    // Delete page
    db.prepare(`DELETE FROM pages WHERE id = ?`).run(id)
}

/**
 * List pages with optional filters
 */
export const listPages = async (params: { spaceId?: string; status?: string }): Promise<{ records: Page[]; total: number }> => {
    const db = getDb()

    let query = `SELECT * FROM pages WHERE 1=1`
    const queryParams: any[] = []

    if (params.spaceId) {
        query += ` AND space_id = ?`
        queryParams.push(params.spaceId)
    }
    if (params.status) {
        query += ` AND status = ?`
        queryParams.push(params.status)
    }

    query += ` ORDER BY updated_at DESC`

    const pages = db.prepare(query).all(...queryParams) as Page[]

    return { records: pages, total: pages.length }
}

/**
 * Get favorite pages
 */
export const getFavoritePages = async (params: { scope?: string; pageSize?: number }): Promise<{ records: any[]; total: number }> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    let query = `
    SELECT p.*, f.created_at as favorited_at
    FROM favorites f
    JOIN pages p ON f.page_id = p.id
    WHERE f.user_id = ? AND f.page_id IS NOT NULL
  `
    const queryParams: any[] = [userId]

    if (params.scope) {
        query += ` AND p.space_id = ?`
        queryParams.push(params.scope)
    }

    query += ` ORDER BY f.created_at DESC`

    if (params.pageSize) {
        query += ` LIMIT ?`
        queryParams.push(params.pageSize)
    }

    const favorites = db.prepare(query).all(...queryParams)

    return { records: favorites, total: favorites.length }
}

/**
 * Get recent pages
 */
export const getRecentPages = async (): Promise<Page[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    const pages = db.prepare(`
    SELECT p.* FROM recent_pages rp
    JOIN pages p ON rp.page_id = p.id
    WHERE rp.user_id = ? AND p.status = 'active'
    ORDER BY rp.viewed_at DESC
    LIMIT 20
  `).all(userId) as Page[]

    return pages
}

/**
 * Get template pages
 */
export const getTemplates = async (): Promise<Page[]> => {
    const db = getDb()

    const templates = db.prepare(`
    SELECT * FROM pages WHERE is_template = 1
    ORDER BY created_at DESC
  `).all() as Page[]

    return templates
}

/**
 * Save page as template
 */
export const saveAsTemplate = async (id: string): Promise<void> => {
    const db = getDb()
    db.prepare(`UPDATE pages SET is_template = 1 WHERE id = ?`).run(id)
}

/**
 * Add page to favorites
 */
export const addPageFavorite = async (pageId: string): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    const existing = db.prepare(`
    SELECT id FROM favorites WHERE user_id = ? AND page_id = ?
  `).get(userId, pageId)

    if (!existing) {
        db.prepare(`
      INSERT INTO favorites (id, user_id, page_id) VALUES (?, ?, ?)
    `).run(uuidv4(), userId, pageId)
    }
}

/**
 * Remove page from favorites
 */
export const removePageFavorite = async (favoriteId: string): Promise<void> => {
    const db = getDb()
    db.prepare(`DELETE FROM favorites WHERE id = ?`).run(favoriteId)
}

/**
 * Query blocks (simplified - returns pages)
 */
export const queryBlocks = async (params: { pageId?: string; pageTitle?: string; spaceId?: string }): Promise<any[]> => {
    const db = getDb()

    let query = `SELECT * FROM pages WHERE status = 'active'`
    const queryParams: any[] = []

    if (params.pageId) {
        query += ` AND id = ?`
        queryParams.push(params.pageId)
    }
    if (params.pageTitle) {
        query += ` AND title LIKE ?`
        queryParams.push(`%${params.pageTitle}%`)
    }
    if (params.spaceId) {
        query += ` AND space_id = ?`
        queryParams.push(params.spaceId)
    }

    return db.prepare(query).all(...queryParams)
}

/**
 * Get block info (returns page info)
 */
export const getBlockInfo = async (id: string): Promise<Page | null> => {
    const db = getDb()
    const page = db.prepare(`SELECT * FROM pages WHERE id = ?`).get(id) as Page | undefined
    return page || null
}

/**
 * Get page collaborators (simplified for offline mode)
 */
export const getPageCollaborators = async (pageId: string): Promise<any[]> => {
    const db = getDb()

    // Get the page owner as the only collaborator in offline mode
    const page = db.prepare(`
    SELECT p.created_by, u.username, u.email, u.avatar, u.nickname
    FROM pages p
    JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(pageId) as any

    if (page) {
        return [{
            userId: page.created_by,
            username: page.username,
            email: page.email,
            avatar: page.avatar,
            nickname: page.nickname,
            permission: 'owner'
        }]
    }

    return []
}
