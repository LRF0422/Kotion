import { AgentClient } from '@kn/common'
import type { AgentChatSession, AgentSessionGroup } from '@kn/common'

import type { Message } from './chat-types'
import type { ChatSessionGroup, ChatSessionMeta, ChatTargetPage } from './chat-sessions'

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
/**
 * Group endpoints are tracked separately: an older backend that predates
 * `/session-groups` must not disable the session sync that still works.
 */
let groupsAvailable = true

export const isSessionApiAvailable = (): boolean => available

export const markSessionApiUnavailable = (): void => {
    available = false
}

export const isSessionGroupApiAvailable = (): boolean => groupsAvailable

export const markSessionGroupApiUnavailable = (): void => {
    groupsAvailable = false
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
        groupId: typeof session.groupId === 'string' && session.groupId ? session.groupId : undefined,
    }
}

function toGroup(group: AgentSessionGroup): ChatSessionGroup {
    return {
        id: group.groupId,
        name: group.name,
        sortIndex: typeof group.sortIndex === 'number' ? group.sortIndex : 0,
        createdAt: group.createdAt || 0,
        updatedAt: group.updatedAt || 0,
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
        // `null` (not `undefined`) is what ungroups the session on the backend:
        // the server maps an explicit null to a NULL group_id column.
        groupId: meta.groupId ?? null,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
    })
    available = true
}

/** The caller's conversation groups, in display order. */
export async function listRemoteSessionGroups(limit = 200): Promise<ChatSessionGroup[]> {
    const rows = await client.listSessionGroups(limit)
    groupsAvailable = true
    return rows.map(toGroup)
}

/** Create / rename / reposition one group. `sortIndex` is always sent. */
export async function upsertRemoteSessionGroup(group: ChatSessionGroup): Promise<void> {
    await client.saveSessionGroup(group.id, { name: group.name, sortIndex: group.sortIndex })
    groupsAvailable = true
}

/** Delete one group; its sessions become ungrouped on the backend too. */
export async function deleteRemoteSessionGroup(groupId: string): Promise<void> {
    await client.deleteSessionGroup(groupId)
    groupsAvailable = true
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
