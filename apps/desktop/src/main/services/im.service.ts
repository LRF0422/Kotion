import { getDb } from '../db'
import { getCurrentUserId } from './auth.service'
import { v4 as uuidv4 } from 'uuid'

export type MessageContentType = 'TEXT' | 'IMAGE' | 'FILE' | 'LINK'
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ'

export interface Message {
    id: string
    sender_id: string
    receiver_id: string
    content: string
    content_type: MessageContentType
    status: MessageStatus
    sent_time: string
    read_time: string | null
}

export interface Conversation {
    conversationId: string
    userId: string
    userName: string
    userAvatar: string | null
    lastMessageContent: string
    lastMessageContentType: MessageContentType
    lastMessageTime: string
    unreadCount: number
}

export interface SendMessageData {
    receiverId: string
    content: string
    contentType?: MessageContentType
}

/**
 * Send a message
 */
export const sendMessage = async (data: SendMessageData): Promise<Message> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const messageId = uuidv4()

    db.prepare(`
    INSERT INTO messages (id, sender_id, receiver_id, content, content_type, status)
    VALUES (?, ?, ?, ?, ?, 'SENT')
  `).run(
        messageId,
        userId,
        data.receiverId,
        data.content,
        data.contentType || 'TEXT'
    )

    return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(messageId) as Message
}

/**
 * Get conversation with a specific user
 */
export const getConversation = async (otherUserId: string): Promise<Message[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY sent_time ASC
  `).all(userId, otherUserId, otherUserId, userId) as Message[]

    return messages
}

/**
 * Get all conversations
 */
export const getConversations = async (): Promise<Conversation[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    // Get unique conversation partners
    const conversations = db.prepare(`
    SELECT DISTINCT
      CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as partner_id
    FROM messages
    WHERE sender_id = ? OR receiver_id = ?
  `).all(userId, userId, userId) as { partner_id: string }[]

    const result: Conversation[] = []

    for (const conv of conversations) {
        // Get partner info
        const partner = db.prepare(`
      SELECT id, username, avatar, nickname FROM users WHERE id = ?
    `).get(conv.partner_id) as any

        if (!partner) continue

        // Get last message
        const lastMessage = db.prepare(`
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY sent_time DESC
      LIMIT 1
    `).get(userId, conv.partner_id, conv.partner_id, userId) as Message | undefined

        // Get unread count
        const unread = db.prepare(`
      SELECT COUNT(*) as count FROM messages 
      WHERE sender_id = ? AND receiver_id = ? AND status != 'READ'
    `).get(conv.partner_id, userId) as { count: number }

        result.push({
            conversationId: `${userId}_${conv.partner_id}`,
            userId: partner.id,
            userName: partner.nickname || partner.username,
            userAvatar: partner.avatar,
            lastMessageContent: lastMessage?.content || '',
            lastMessageContentType: lastMessage?.content_type || 'TEXT',
            lastMessageTime: lastMessage?.sent_time || '',
            unreadCount: unread.count
        })
    }

    // Sort by last message time
    result.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime())

    return result
}

/**
 * Get unread message count
 */
export const getUnreadCount = async (): Promise<number> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const result = db.prepare(`
    SELECT COUNT(*) as count FROM messages 
    WHERE receiver_id = ? AND status != 'READ'
  `).get(userId) as { count: number }

    return result.count
}

/**
 * Get unread messages
 */
export const getUnreadMessages = async (): Promise<Message[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE receiver_id = ? AND status != 'READ'
    ORDER BY sent_time DESC
  `).all(userId) as Message[]

    return messages
}

/**
 * Mark messages as read
 */
export const markRead = async (messageIds: string[]): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    for (const id of messageIds) {
        db.prepare(`
      UPDATE messages 
      SET status = 'READ', read_time = datetime('now')
      WHERE id = ? AND receiver_id = ?
    `).run(id, userId)
    }
}

/**
 * Mark all messages as read
 */
export const markAllRead = async (): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    db.prepare(`
    UPDATE messages 
    SET status = 'READ', read_time = datetime('now')
    WHERE receiver_id = ? AND status != 'READ'
  `).run(userId)
}

/**
 * Delete a message
 */
export const deleteMessage = async (messageId: string): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    db.prepare(`
    DELETE FROM messages WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
  `).run(messageId, userId, userId)
}

/**
 * Clear conversation history with a user
 */
export const clearConversation = async (otherUserId: string): Promise<void> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()
    db.prepare(`
    DELETE FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
  `).run(userId, otherUserId, otherUserId, userId)
}

/**
 * Get online users (simplified for offline mode - returns all users)
 */
export const getOnlineUsers = async (): Promise<any[]> => {
    const userId = getCurrentUserId()
    if (!userId) throw new Error('Not logged in')

    const db = getDb()

    // In offline desktop mode, just return all users except current user
    const users = db.prepare(`
    SELECT id, username, email, avatar, nickname FROM users WHERE id != ?
  `).all(userId)

    return users.map((u: any) => ({
        ...u,
        isOnline: true // In desktop mode, consider all users as "online"
    }))
}

/**
 * Check if user is online (always true in desktop mode)
 */
export const checkUserOnline = async (targetUserId: string): Promise<boolean> => {
    return true // In desktop mode, all users are considered "online"
}

/**
 * Get online user count
 */
export const getOnlineCount = async (): Promise<number> => {
    const users = await getOnlineUsers()
    return users.length
}
