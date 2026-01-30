import { getDb } from '../db'
import { getCurrentUserId } from './auth.service'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'fs'

export interface FileRecord {
    id: string
    name: string
    path: string
    type: string
    mime_type: string | null
    size: number
    parent_id: string | null
    repository_key: string | null
    owner_id: string
    created_at: string
    updated_at: string
}

export interface CreateFolderData {
    name: string
    parentId?: string
    repositoryKey?: string
    type?: string
    path?: string
}

// Get the uploads directory
const getUploadsDir = () => {
    const userDataPath = app.getPath('userData')
    const uploadsDir = join(userDataPath, 'uploads')

    if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true })
    }

    return uploadsDir
}

/**
 * Upload a file
 */
export const uploadFile = async (data: {
    name: string
    buffer: ArrayBuffer
    mimeType: string
}): Promise<{ name: string; originalName: string; link: string }> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const uploadsDir = getUploadsDir()
    const fileId = uuidv4()
    const ext = data.name.split('.').pop() || ''
    const fileName = `${fileId}.${ext}`
    const filePath = join(uploadsDir, fileName)

    // Write file to disk
    writeFileSync(filePath, Buffer.from(data.buffer))

    // Create database record
    const db = getDb()
    db.prepare(`
    INSERT INTO files (id, name, path, type, mime_type, size, owner_id)
    VALUES (?, ?, ?, 'FILE', ?, ?, ?)
  `).run(
        fileId,
        data.name,
        fileName,
        data.mimeType,
        data.buffer.byteLength,
        userId
    )

    return {
        name: fileName,
        originalName: data.name,
        link: `file://${filePath}`
    }
}

/**
 * Get root folder
 */
export const getRootFolder = async (): Promise<FileRecord[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const files = db.prepare(`
    SELECT * FROM files 
    WHERE owner_id = ? AND parent_id IS NULL
    ORDER BY type DESC, name ASC
  `).all(userId) as FileRecord[]

    return files
}

/**
 * Get folder children
 */
export const getChildren = async (parentId: string): Promise<FileRecord[]> => {
    const db = getDb()
    const files = db.prepare(`
    SELECT * FROM files 
    WHERE parent_id = ?
    ORDER BY type DESC, name ASC
  `).all(parentId) as FileRecord[]

    return files
}

/**
 * Create folder
 */
export const createFolder = async (data: CreateFolderData): Promise<FileRecord> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const folderId = uuidv4()

    db.prepare(`
    INSERT INTO files (id, name, path, type, parent_id, repository_key, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
        folderId,
        data.name,
        data.path || folderId,
        data.type || 'FOLDER',
        data.parentId || null,
        data.repositoryKey || null,
        userId
    )

    return db.prepare(`SELECT * FROM files WHERE id = ?`).get(folderId) as FileRecord
}

/**
 * Delete file or folder
 */
export const deleteFile = async (id: string): Promise<void> => {
    const db = getDb()

    const file = db.prepare(`SELECT * FROM files WHERE id = ?`).get(id) as FileRecord | undefined

    if (!file) {
        throw new Error('File not found')
    }

    // If it's a folder, delete all children first
    if (file.type === 'FOLDER') {
        const children = db.prepare(`SELECT id FROM files WHERE parent_id = ?`).all(id) as { id: string }[]
        for (const child of children) {
            await deleteFile(child.id)
        }
    }

    // Delete actual file from disk if it exists
    if (file.type === 'FILE') {
        const uploadsDir = getUploadsDir()
        const filePath = join(uploadsDir, file.path)
        if (existsSync(filePath)) {
            unlinkSync(filePath)
        }
    }

    // Delete database record
    db.prepare(`DELETE FROM files WHERE id = ?`).run(id)
}

/**
 * Download file (return file path)
 */
export const downloadFile = async (id: string): Promise<{ path: string; name: string; mimeType: string }> => {
    const db = getDb()
    const file = db.prepare(`SELECT * FROM files WHERE id = ?`).get(id) as FileRecord | undefined

    if (!file || file.type !== 'FILE') {
        throw new Error('File not found')
    }

    const uploadsDir = getUploadsDir()
    const filePath = join(uploadsDir, file.path)

    if (!existsSync(filePath)) {
        throw new Error('File not found on disk')
    }

    return {
        path: filePath,
        name: file.name,
        mimeType: file.mime_type || 'application/octet-stream'
    }
}

/**
 * Rename file or folder
 */
export const renameFile = async (id: string, newName: string): Promise<FileRecord | null> => {
    const db = getDb()

    db.prepare(`
    UPDATE files SET name = ?, updated_at = datetime('now') WHERE id = ?
  `).run(newName, id)

    return db.prepare(`SELECT * FROM files WHERE id = ?`).get(id) as FileRecord | undefined || null
}

/**
 * Get file by ID
 */
export const getFile = async (id: string): Promise<FileRecord | null> => {
    const db = getDb()
    const file = db.prepare(`SELECT * FROM files WHERE id = ?`).get(id) as FileRecord | undefined
    return file || null
}

/**
 * Get file URL for display
 */
export const getFileUrl = (fileName: string): string => {
    const uploadsDir = getUploadsDir()
    return `file://${join(uploadsDir, fileName)}`
}
