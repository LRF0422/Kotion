import { AgentClient } from '@kn/common'
import type { AgentChatSession } from '@kn/common'

import type { Message } from './chat-types'
import type { ChatSessionMeta, ChatTargetPage } from './chat-sessions'

/**
 * Adapter between the chat-session UI model (ChatSessionMeta / Message) and the
 * AgentCore `/api/agent/v1/sessions` contract.
 *
 * Layering (see SessionTranscriptProjector on the backend):
 * - the engine owns the transcript and writes it on run create / terminal;
 * - the client only writes UI metadata (title, @-page bindings) and may clear
 *   or import a transcript explicitly;
 * - if the backend is unreachable the hook falls back to the local cache.
 *
 * `available` flips false after a hard failure so the hook stops retrying on
 * every change; a successful request resets it.
 */
const client = new AgentClient()

let available = true

export const isSessionApiAvailable = (): boolean => available

export const markSessionApiUnavailable = (): void => {
    available = false
}

function asTargetPage(value: unknown): ChatTargetPage | undefined {
    if (!value || typeof value !== 'object') return undefined
    const page = value as Record<string, unknown>
    if (typeof page.pageId !== 'string' || !page.pageId) return undefined
    const out: ChatTargetPage = {
        pageId: page.pageId,
        title: typeof page.title === 'string' ? page.title : '',
    }
    if (typeof page.spaceId === 'string') out.spaceId = page.spaceId
    return out
}

function toMeta(session: AgentChatSession): ChatSessionMeta {
    return {
        id: session.sessionId,
        title: session.title || 'New chat',
        createdAt: session.createdAt || 0,
        updatedAt: session.updatedAt || 0,
        targetPage: asTargetPage(session.targetPage),
        boundPage: asTargetPage(session.boundPage),
    }
}

function toMessages(value: unknown): Message[] {
    return Array.isArray(value) ? (value as Message[]) : []
}

/** Fetch the caller's session index (metadata only), newest first. */
export async function listRemoteSessions(limit = 100): Promise<ChatSessionMeta[]> {
    const rows = await client.listChatSessions(limit)
    available = true
    return rows.map(toMeta)
}

/**
 * Fetch one session's engine-projected transcript. Returns null when the
 * session does not exist; an empty array means it exists with no transcript yet.
 */
export async function getRemoteMessages(sessionId: string): Promise<Message[] | null> {
    const session = await client.getChatSession(sessionId)
    if (!session) return null
    available = true
    return toMessages(session.messages)
}

/** Write client-owned UI metadata only. */
export async function upsertRemoteSession(meta: ChatSessionMeta): Promise<void> {
    await client.saveChatSession(meta.id, {
        title: meta.title,
        targetPage: meta.targetPage ?? null,
        boundPage: meta.boundPage ?? null,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
    })
    available = true
}

/**
 * One-time migration upload accepted only when the engine has no richer
 * transcript. Returns whether the backend actually imported it, so the caller
 * can drop the local migration copy once the engine owns the history.
 */
export async function importRemoteSession(meta: ChatSessionMeta, messages: Message[]): Promise<boolean> {
    const imported = await client.importChatSession(meta.id, {
        title: meta.title,
        targetPage: meta.targetPage ?? null,
        boundPage: meta.boundPage ?? null,
        messages,
        createdAt: meta.createdAt,
    })
    available = true
    return imported
}

/** Explicit user command: reset the engine-owned transcript. */
export async function clearRemoteSession(sessionId: string): Promise<void> {
    await client.clearChatSessionTranscript(sessionId)
    available = true
}

export async function deleteRemoteSession(sessionId: string): Promise<void> {
    await client.deleteChatSession(sessionId)
    available = true
}
