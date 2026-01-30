import { getDb } from '../db'
import { getCurrentUserId } from './auth.service'
import { v4 as uuidv4 } from 'uuid'

export interface Plugin {
    id: string
    name: string
    version: string
    description: string | null
    entry_point: string | null
    icon: string | null
    author: string | null
    is_builtin: number
    created_at: string
    updated_at: string
}

export interface UserPlugin {
    id: string
    user_id: string
    plugin_id: string
    is_enabled: number
    settings: string | null
    installed_at: string
}

export interface CreatePluginData {
    name: string
    version?: string
    description?: string
    entryPoint?: string
    icon?: string
    author?: string
}

/**
 * Get all available plugins
 */
export const listPlugins = async (): Promise<Plugin[]> => {
    const db = getDb()
    const plugins = db.prepare(`
    SELECT * FROM plugins ORDER BY is_builtin DESC, name ASC
  `).all() as Plugin[]

    return plugins
}

/**
 * Get plugin by ID
 */
export const getPlugin = async (id: string): Promise<Plugin | null> => {
    const db = getDb()
    const plugin = db.prepare(`SELECT * FROM plugins WHERE id = ?`).get(id) as Plugin | undefined
    return plugin || null
}

/**
 * Create a new plugin
 */
export const createPlugin = async (data: CreatePluginData): Promise<Plugin> => {
    const db = getDb()
    const pluginId = uuidv4()

    db.prepare(`
    INSERT INTO plugins (id, name, version, description, entry_point, icon, author, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
        pluginId,
        data.name,
        data.version || '1.0.0',
        data.description || null,
        data.entryPoint || null,
        data.icon || null,
        data.author || null
    )

    return db.prepare(`SELECT * FROM plugins WHERE id = ?`).get(pluginId) as Plugin
}

/**
 * Install a plugin for current user
 */
export const installPlugin = async (pluginId: string): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    // Check if already installed
    const existing = db.prepare(`
    SELECT id FROM user_plugins WHERE user_id = ? AND plugin_id = ?
  `).get(userId, pluginId)

    if (existing) {
        throw new Error('Plugin already installed')
    }

    db.prepare(`
    INSERT INTO user_plugins (id, user_id, plugin_id)
    VALUES (?, ?, ?)
  `).run(uuidv4(), userId, pluginId)
}

/**
 * Uninstall a plugin for current user
 */
export const uninstallPlugin = async (pluginId: string): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    // Check if it's a builtin plugin
    const plugin = db.prepare(`SELECT is_builtin FROM plugins WHERE id = ?`).get(pluginId) as any
    if (plugin?.is_builtin) {
        throw new Error('Cannot uninstall builtin plugins')
    }

    db.prepare(`
    DELETE FROM user_plugins WHERE user_id = ? AND plugin_id = ?
  `).run(userId, pluginId)
}

/**
 * Get installed plugins for current user
 */
export const getInstalledPlugins = async (): Promise<Plugin[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    const plugins = db.prepare(`
    SELECT p.* FROM plugins p
    JOIN user_plugins up ON p.id = up.plugin_id
    WHERE up.user_id = ? AND up.is_enabled = 1
    ORDER BY p.is_builtin DESC, p.name ASC
  `).all(userId) as Plugin[]

    return plugins
}

/**
 * Update plugin
 */
export const updatePlugin = async (data: { id: string } & Partial<CreatePluginData>): Promise<Plugin | null> => {
    const db = getDb()

    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
        updates.push('name = ?')
        values.push(data.name)
    }
    if (data.version !== undefined) {
        updates.push('version = ?')
        values.push(data.version)
    }
    if (data.description !== undefined) {
        updates.push('description = ?')
        values.push(data.description)
    }
    if (data.entryPoint !== undefined) {
        updates.push('entry_point = ?')
        values.push(data.entryPoint)
    }
    if (data.icon !== undefined) {
        updates.push('icon = ?')
        values.push(data.icon)
    }
    if (data.author !== undefined) {
        updates.push('author = ?')
        values.push(data.author)
    }

    if (updates.length > 0) {
        updates.push("updated_at = datetime('now')")
        values.push(data.id)

        db.prepare(`UPDATE plugins SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    return getPlugin(data.id)
}

/**
 * Enable/disable plugin for current user
 */
export const togglePlugin = async (pluginId: string, enabled: boolean): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    db.prepare(`
    UPDATE user_plugins SET is_enabled = ? WHERE user_id = ? AND plugin_id = ?
  `).run(enabled ? 1 : 0, userId, pluginId)
}

/**
 * Update plugin settings for current user
 */
export const updatePluginSettings = async (pluginId: string, settings: any): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    db.prepare(`
    UPDATE user_plugins SET settings = ? WHERE user_id = ? AND plugin_id = ?
  `).run(JSON.stringify(settings), userId, pluginId)
}
