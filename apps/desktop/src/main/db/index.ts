import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

let db: Database.Database | null = null

// Get the user data path for storing the database
const getDbPath = () => {
    const userDataPath = app.getPath('userData')
    const dbDir = join(userDataPath, 'data')

    // Ensure the directory exists
    if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true })
    }

    return join(dbDir, 'knowledge.db')
}

// Initialize the database
export const initDatabase = async (): Promise<Database.Database> => {
    if (db) return db

    const dbPath = getDbPath()
    console.log('Initializing database at:', dbPath)

    db = new Database(dbPath)

    // Enable foreign keys
    db.pragma('foreign_keys = ON')

    // Create tables
    createTables(db)

    // Insert default data
    insertDefaultData(db)

    return db
}

// Get the database instance
export const getDb = (): Database.Database => {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase first.')
    }
    return db
}

// Create all tables
const createTables = (database: Database.Database) => {
    // Users table
    database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      avatar TEXT,
      nickname TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

    // Spaces table
    database.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      cover TEXT,
      home_page_id TEXT,
      owner_id TEXT NOT NULL,
      is_personal INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `)

    // Pages table
    database.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT,
      icon TEXT,
      cover TEXT,
      status TEXT DEFAULT 'active',
      is_template INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      FOREIGN KEY (parent_id) REFERENCES pages(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `)

    // Plugins table
    database.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      description TEXT,
      entry_point TEXT,
      icon TEXT,
      author TEXT,
      is_builtin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

    // User installed plugins
    database.exec(`
    CREATE TABLE IF NOT EXISTS user_plugins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      settings TEXT,
      installed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plugin_id) REFERENCES plugins(id),
      UNIQUE(user_id, plugin_id)
    )
  `)

    // Favorites table
    database.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      page_id TEXT,
      space_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (page_id) REFERENCES pages(id),
      FOREIGN KEY (space_id) REFERENCES spaces(id)
    )
  `)

    // Files table
    database.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'FILE',
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      parent_id TEXT,
      repository_key TEXT,
      owner_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES files(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `)

    // Messages table (for instant messaging)
    database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT DEFAULT 'TEXT',
      status TEXT DEFAULT 'SENT',
      sent_time TEXT DEFAULT (datetime('now')),
      read_time TEXT,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `)

    // Recent pages table (for tracking recently viewed pages)
    database.exec(`
    CREATE TABLE IF NOT EXISTS recent_pages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      viewed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (page_id) REFERENCES pages(id),
      UNIQUE(user_id, page_id)
    )
  `)

    // Space members table
    database.exec(`
    CREATE TABLE IF NOT EXISTS space_members (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(space_id, user_id)
    )
  `)

    // Create indexes for better performance
    database.exec(`
    CREATE INDEX IF NOT EXISTS idx_pages_space_id ON pages(space_id);
    CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
    CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
    CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_files_parent_id ON files(parent_id);
    CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files(owner_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_recent_pages_user_id ON recent_pages(user_id);
  `)
}

// Insert default data
const insertDefaultData = (database: Database.Database) => {
    // Check if default user exists
    const existingUser = database.prepare('SELECT id FROM users WHERE username = ?').get('admin')

    if (!existingUser) {
        const bcrypt = require('bcryptjs')
        const { v4: uuidv4 } = require('uuid')

        // Create default admin user
        const userId = uuidv4()
        const passwordHash = bcrypt.hashSync('admin123', 10)

        database.prepare(`
      INSERT INTO users (id, username, password_hash, email, nickname)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, 'admin', passwordHash, 'admin@knowledge.local', 'Administrator')

        // Create default personal space for admin
        const spaceId = uuidv4()
        database.prepare(`
      INSERT INTO spaces (id, name, description, owner_id, is_personal)
      VALUES (?, ?, ?, ?, ?)
    `).run(spaceId, 'Personal Space', 'Your personal workspace', userId, 1)

        // Add admin as space member
        database.prepare(`
      INSERT INTO space_members (id, space_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), spaceId, userId, 'owner')

        // Create welcome page
        const pageId = uuidv4()
        database.prepare(`
      INSERT INTO pages (id, space_id, title, content, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(pageId, spaceId, 'Welcome', JSON.stringify({
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'Welcome to Knowledge Desktop!' }]
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'This is your personal knowledge base. Start creating and organizing your notes.' }]
                }
            ]
        }), userId)

        // Update space with home page
        database.prepare(`
      UPDATE spaces SET home_page_id = ? WHERE id = ?
    `).run(pageId, spaceId)

        // Insert default plugins
        const defaultPlugins = [
            { name: 'Main', description: 'Core functionality plugin', isBuiltin: 1 },
            { name: 'AI Assistant', description: 'AI-powered writing assistant', isBuiltin: 1 },
            { name: 'File Manager', description: 'File management plugin', isBuiltin: 1 },
            { name: 'Mermaid', description: 'Diagram and flowchart plugin', isBuiltin: 1 },
            { name: 'Excalidraw', description: 'Whiteboard and drawing plugin', isBuiltin: 1 }
        ]

        for (const plugin of defaultPlugins) {
            const pluginId = uuidv4()
            database.prepare(`
        INSERT INTO plugins (id, name, description, is_builtin)
        VALUES (?, ?, ?, ?)
      `).run(pluginId, plugin.name, plugin.description, plugin.isBuiltin)

            // Install plugin for admin user
            database.prepare(`
        INSERT INTO user_plugins (id, user_id, plugin_id)
        VALUES (?, ?, ?)
      `).run(uuidv4(), userId, pluginId)
        }

        console.log('Default data initialized successfully')
    }
}

// Close the database
export const closeDatabase = () => {
    if (db) {
        db.close()
        db = null
    }
}

export { Database }
