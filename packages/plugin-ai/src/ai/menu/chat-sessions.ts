import type { Message } from './chat-types'

// ─── Storage keys ───────────────────────────────────────────────────
const INDEX_KEY = 'kn-ai-chat-sessions-index'
const ACTIVE_KEY = 'kn-ai-chat-active-session'
const SESSION_MSG_PREFIX = 'kn-ai-chat-session:'

// Legacy keys (single-session era) — migrated on first load.
const LEGACY_MESSAGES_KEY = 'kn-ai-chat-messages'
const LEGACY_SESSION_KEY = 'agent-session-id'
const LEGACY_SESSION_TS_KEY = 'agent-session-timestamp'
const LEGACY_CONVERSATION_KEY = 'agent-conversation-id'

// ─── Limits ────────────────────────────────────────────────────────
const MAX_MESSAGES_PER_SESSION = 100
const MAX_SESSIONS = 50

// ─── Types ─────────────────────────────────────────────────────────
/** A page bound to a chat session via the @-mention picker. */
export interface ChatTargetPage {
    pageId: string
    title: string
    spaceId?: string
}

export interface ChatSessionMeta {
    /** Local UUID identifying this chat session in the UI. */
    id: string
    /** Display title (auto-derived from first user message, or user-renamed). */
    title: string
    createdAt: number
    updatedAt: number
    /** Page this session's agent edits (off-screen) instead of the open document. */
    targetPage?: ChatTargetPage
}

// ─── Helpers ───────────────────────────────────────────────────────
function safeParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback
    try {
        const v = JSON.parse(raw)
        return v as T
    } catch {
        return fallback
    }
}

function safeWrite(key: string, value: string): void {
    try { localStorage.setItem(key, value) } catch { /* quota / unavailable — ignore */ }
}

function safeRemove(key: string): void {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export function generateSessionId(): string {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function deriveTitle(messages: Message[]): string {
    const firstUser = messages.find(m => m.sender === 'user')
    if (!firstUser) return 'New chat'
    const trimmed = firstUser.content.trim().replace(/\s+/g, ' ')
    if (!trimmed) return 'New chat'
    return trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed
}

// ─── Index / active session ────────────────────────────────────────
export function loadIndex(): ChatSessionMeta[] {
    const arr = safeParse<ChatSessionMeta[]>(localStorage.getItem(INDEX_KEY), [])
    if (!Array.isArray(arr)) return []
    // Keep most recently updated first.
    return [...arr].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export function saveIndex(list: ChatSessionMeta[]): void {
    const trimmed = [...list]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, MAX_SESSIONS)
    safeWrite(INDEX_KEY, JSON.stringify(trimmed))
}

export function getActiveId(): string | null {
    try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
}

export function setActiveId(id: string | null): void {
    if (id) safeWrite(ACTIVE_KEY, id)
    else safeRemove(ACTIVE_KEY)
}

// ─── Per-session messages ──────────────────────────────────────────
export function loadSessionMessages(sessionId: string): Message[] {
    if (!sessionId) return []
    const arr = safeParse<Message[]>(
        localStorage.getItem(SESSION_MSG_PREFIX + sessionId),
        [],
    )
    return Array.isArray(arr) ? arr : []
}

export function saveSessionMessages(sessionId: string, messages: Message[]): void {
    if (!sessionId) return
    const toSave = messages.slice(-MAX_MESSAGES_PER_SESSION)
    safeWrite(SESSION_MSG_PREFIX + sessionId, JSON.stringify(toSave))
}

export function deleteSessionMessages(sessionId: string): void {
    if (!sessionId) return
    safeRemove(SESSION_MSG_PREFIX + sessionId)
}

// ─── Legacy migration ──────────────────────────────────────────────
/**
 * One-time migration from the single-session era.
 * If a multi-session index already exists, this is a no-op.
 */
export function migrateLegacy(): void {
    // If the new index is already populated, migration already happened.
    const existing = safeParse<ChatSessionMeta[]>(localStorage.getItem(INDEX_KEY), [])
    if (Array.isArray(existing) && existing.length > 0) return

    const legacyRaw = localStorage.getItem(LEGACY_MESSAGES_KEY)
    if (!legacyRaw) return

    const legacyMsgs = safeParse<Message[]>(legacyRaw, [])

    // Clean legacy keys regardless so we don't re-run migration.
    safeRemove(LEGACY_MESSAGES_KEY)
    safeRemove(LEGACY_SESSION_KEY)
    safeRemove(LEGACY_SESSION_TS_KEY)
    safeRemove(LEGACY_CONVERSATION_KEY)

    if (!Array.isArray(legacyMsgs) || legacyMsgs.length === 0) return

    const id = generateSessionId()
    const now = Date.now()
    const meta: ChatSessionMeta = {
        id,
        title: deriveTitle(legacyMsgs),
        createdAt: now,
        updatedAt: now,
    }
    saveSessionMessages(id, legacyMsgs)
    saveIndex([meta])
    setActiveId(id)
}
