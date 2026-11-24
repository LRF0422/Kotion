/**
 * AgentOperationTarget — what the agent is operating on, as a first-class,
 * KIND-AGNOSTIC concept.
 *
 * The page model (`agent-page-target`) answers "which page, and how do I read or
 * write its document?". That is only one kind of thing an agent can work on:
 * a selected file, a bitable row, a chart, a mind-map node, a selected block, a
 * space… Each plugin knows its own object better than a central switch could.
 *
 * This module owns the generic question:
 *
 *   "what is the object in focus RIGHT NOW, what type is it, and which tools
 *    operate on it?"
 *
 * Providers (core + plugins) answer it for their surface. The agent asks through
 * the `getCurrentTarget` tool; no provider is required for a run to work, and a
 * provider that is not mounted simply contributes nothing.
 *
 * Layering:
 *   provider registration  — who can describe a focused object (this file)
 *   resolution             — merge, dedupe, rank, promise-free (this file)
 *   tool surface           — `tools/target-tools.ts`
 *   page specifics         — `agent-page-target.ts` (built-in provider below)
 *
 * Rules:
 *  - `getTargets` must be cheap and synchronous. It is a snapshot read, not an
 *    I/O hook; fetch metadata ahead of time and return the current shape.
 *  - `kind` is an open string. Use a bare name for core kinds (`page`, `space`,
 *    `file`) and a namespaced one for plugin-specific objects
 *    (`plugin:bitable/table`, `plugin:mindmap/node`).
 *  - `operations` names REAL tool names and optionally pre-fills `args`, so the
 *    model can go from "what is this?" to a valid call without guessing.
 *  - Everything is scoped by the query context (`conversationId`, `owner`):
 *    one conversation's target must never leak into another's answer.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { SessionPageBinding } from './session-page-binding'
import type { AgentArtifact } from './plugin-agent/types'
import { resolveAgentPageTarget } from './agent-page-target'
import { isSamePage } from './document-target'
import { isLiveEditor } from './plugin-agent/live-editor'
import { getAgentEditor } from './agent-editor-registry'

/** A tool that can act on the described object. */
export interface AgentTargetOperation {
    /** Real tool name shown to the model (e.g. `applyEdits`, `readFile`). */
    tool: string
    /** One line: what it does, in the same language as the tool description. */
    description: string
    /** Optional pre-filled arguments (e.g. `{ pageId }`). */
    args?: Record<string, unknown>
    readOnly?: boolean
}

/** A sub-object within the target (a selected block, row, cell, node). */
export interface AgentTargetSelection {
    /** `text` | `block` | `row` | `cell` | `node` | … */
    kind: string
    id?: string
    /** Selected text, clipped by the provider. */
    text?: string
    attributes?: Record<string, unknown>
}

/** One object the agent may act on. */
export interface AgentOperationTarget {
    /** Open type key: `page`, `space`, `file`, `plugin:bitable/table`, … */
    kind: string
    /** Human-readable type label for the model (e.g. 页面 / 多维表格 / 文件). */
    label?: string
    /** Stable identity within `kind`. */
    id: string
    title?: string
    /** Model-facing one-liner: what this object is / what is selected. */
    summary?: string
    spaceId?: string
    /** Whether the object can currently be modified, when known. */
    canEdit?: boolean
    /** Machine-readable capability keys, e.g. `document.write`, `file.read`. */
    capabilities?: string[]
    /** Concrete next actions: real tool names + what they do. */
    operations?: AgentTargetOperation[]
    /** Extra structured facts (small, JSON-safe). */
    attributes?: Record<string, unknown>
    /** Selected sub-object, when the surface has one. */
    selection?: AgentTargetSelection
    /** Diagnostics: which surface/provider described this object. */
    source?: string
    /** Higher wins; used to pick the primary object. Default 50. */
    priority?: number
}

/** Input the resolver hands to every provider. */
export interface AgentOperationTargetContext {
    conversationId?: string | null
    /** Delegated sub-run id, or null for the conversation's own agent. */
    owner?: string | null
    /** The conversation's page binding, when the surface has one. */
    sessionBinding?: SessionPageBinding | null
    /**
     * Whether the ASKING run can call a tool. Used to drop operations this
     * surface/scope cannot execute (e.g. a page tool in a workspace run that
     * has not acquired a document yet), so the model is never pointed at a
     * tool it cannot call.
     */
    isToolAvailable?: (toolName: string) => boolean
}

/** A provider describes the focused object(s) for a surface. */
export interface AgentOperationTargetProvider {
    /** Unique, stable id (e.g. `core.page`, `conversation-artifact:<id>`). */
    id: string
    /** Diagnostics only. */
    label?: string
    priority?: number
    /** Cheap snapshot read. Return null/[] when this surface has no focus. */
    getTargets: (
        context: AgentOperationTargetContext,
    ) => AgentOperationTarget | AgentOperationTarget[] | null | undefined
    /** Optional: notify when the surface's focused object changes. */
    subscribe?: (listener: () => void) => () => void
}

export interface ResolvedAgentOperationTarget extends AgentOperationTarget {
    providerId: string
    priority: number
    /** True for the highest-priority object of this query. */
    primary: boolean
}

const providers = new Map<string, AgentOperationTargetProvider>()
const listeners = new Set<() => void>()

const notify = (): void => {
    for (const listener of [...listeners]) {
        try {
            listener()
        } catch {
            // One broken UI subscriber must not break resolution.
        }
    }
}

const DEFAULT_PRIORITY = 50
const MAX_TARGETS = 12

/** Register a provider. Returns an idempotent unregister. */
export function registerAgentOperationTargetProvider(
    provider: AgentOperationTargetProvider,
): () => void {
    if (!provider?.id || typeof provider.getTargets !== 'function') {
        throw new Error('agent operation target provider needs an id and getTargets()')
    }
    providers.set(provider.id, provider)
    notify()
    return () => unregisterAgentOperationTargetProvider(provider.id)
}

/** Drop a provider by id (stale cleanup is harmless). */
export function unregisterAgentOperationTargetProvider(providerId: string): void {
    if (!providers.delete(providerId)) return
    // Re-add the built-in page provider if a plugin accidentally used its id.
    if (providerId === CORE_PAGE_PROVIDER) ensureCoreProvider()
    notify()
}

/** Subscribe to provider add/remove (UI/diagnostics; the tool reads live). */
export function subscribeAgentOperationTargetProviders(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

/** The registered providers, for diagnostics. */
export function listAgentOperationTargetProviders(): AgentOperationTargetProvider[] {
    return [...providers.values()]
}

/**
 * Test/teardown helper. By default the built-in page provider is restored so a
 * host does not silently lose page context after a clear.
 */
export function resetAgentOperationTargetProviders(includeBuiltins = true): void {
    providers.clear()
    if (includeBuiltins) ensureCoreProvider()
    notify()
}

// ─────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────

const asList = (
    value: AgentOperationTarget | AgentOperationTarget[] | null | undefined,
): AgentOperationTarget[] => {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
}

const normalize = (target: AgentOperationTarget | null | undefined): AgentOperationTarget | null => {
    if (!target) return null
    const kind = typeof target.kind === 'string' ? target.kind.trim() : ''
    const id = target.id === undefined || target.id === null ? '' : String(target.id).trim()
    if (!kind || !id) return null
    return { ...target, kind, id }
}

const mergeStrings = (a?: string[], b?: string[]): string[] | undefined => {
    if (!a && !b) return undefined
    return [...new Set([...(a ?? []), ...(b ?? [])])]
}

const mergeOperations = (
    a?: AgentTargetOperation[],
    b?: AgentTargetOperation[],
): AgentTargetOperation[] | undefined => {
    if (!a && !b) return undefined
    const seen = new Set<string>()
    const merged: AgentTargetOperation[] = []
    for (const operation of [...(a ?? []), ...(b ?? [])]) {
        if (!operation?.tool) continue
        let argsKey = ''
        try { argsKey = JSON.stringify(operation.args ?? {}) } catch { argsKey = '[unserializable]' }
        const key = `${operation.tool}|${argsKey}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(operation)
    }
    return merged
}

/**
 * Resolve every provider's current object for one query, deduped by
 * `kind:id`, ordered by priority, primary first.
 *
 * Provider failures are isolated: a broken plugin cannot make the agent blind
 * to the page it is editing.
 */
export function resolveAgentOperationTargets(
    context: AgentOperationTargetContext = {},
): ResolvedAgentOperationTarget[] {
    ensureCoreProvider()
    const byKey = new Map<string, ResolvedAgentOperationTarget>()

    for (const provider of providers.values()) {
        let raw: ReturnType<AgentOperationTargetProvider['getTargets']>
        try {
            raw = provider.getTargets(context)
        } catch (error) {
            console.warn(`[agent] operation target provider "${provider.id}" failed:`, error)
            continue
        }
        for (const candidate of asList(raw)) {
            const target = normalize(candidate)
            if (!target) continue
            const priority = Number.isFinite(target.priority)
                ? Number(target.priority)
                : provider.priority ?? DEFAULT_PRIORITY
            const key = `${target.kind}:${target.id}`
            const existing = byKey.get(key)
            if (!existing) {
                byKey.set(key, {
                    ...target,
                    providerId: provider.id,
                    priority,
                    primary: false,
                })
                continue
            }
            // Same object described by two sources (a page artifact + the page
            // provider): keep the higher-priority identity, union the actionable
            // parts so the model sees every real tool.
            const winner = priority > existing.priority
                ? { ...target, providerId: provider.id, priority }
                : existing
            const loser = priority > existing.priority ? existing : target
            byKey.set(key, {
                ...winner,
                label: winner.label ?? loser.label,
                title: winner.title ?? loser.title,
                summary: winner.summary ?? loser.summary,
                spaceId: winner.spaceId ?? loser.spaceId,
                canEdit: winner.canEdit ?? loser.canEdit,
                capabilities: mergeStrings(existing.capabilities, target.capabilities),
                operations: mergeOperations(existing.operations, target.operations),
                attributes: { ...(loser.attributes ?? {}), ...(winner.attributes ?? {}) },
                selection: winner.selection ?? loser.selection,
                primary: false,
            })
        }
    }

    const canCall = context.isToolAvailable
    const ordered = [...byKey.values()]
        .sort((a, b) => b.priority - a.priority)
        .slice(0, MAX_TARGETS)
    return ordered.map((target, index) => ({
        ...target,
        // Never point the model at a tool this run cannot execute.
        operations: canCall && target.operations
            ? target.operations.filter(operation => {
                try { return canCall(operation.tool) } catch { return true }
            })
            : target.operations,
        primary: index === 0,
    }))
}

// ─────────────────────────────────────────────────────────────────
// Built-in page provider
// ─────────────────────────────────────────────────────────────────

const CORE_PAGE_PROVIDER = 'core.page'
const VISIBLE_PAGE_PRIORITY = 60
const CONVERSATION_PAGE_PRIORITY = 80

const pageOperations = (
    pageId: string,
    canEdit: boolean,
    isConversationTarget: boolean,
    editorReady: boolean,
): AgentTargetOperation[] => {
    const operations: AgentTargetOperation[] = [
        {
            tool: 'getDocumentStructure',
            description: '读取页面结构（块与位置），编辑前先看它',
            readOnly: true,
        },
        {
            tool: 'readChunk',
            description: '分块读取页面正文',
            readOnly: true,
        },
    ]
    if (canEdit) {
        operations.push(
            {
                tool: 'applyEdits',
                description: '批量修改页面正文（替换/插入/删除块，一次事务）',
            },
            {
                tool: 'write',
                description: '在指定块后插入 Markdown 内容',
            },
        )
    }
    if (!isConversationTarget || !editorReady) {
        operations.push({
            tool: 'editPage',
            description: isConversationTarget
                ? '重新获取这个页面的编辑器（当前编辑器尚未就绪）'
                : '把这个页面设为当前会话的编辑目标，之后文档工具都作用于它',
            args: { pageId },
        })
    }
    return operations
}

const selectionOf = (editor: any): AgentTargetSelection | undefined => {
    if (!isLiveEditor(editor)) return undefined
    try {
        const selection = editor.state?.selection
        if (!selection || selection.empty) return undefined
        const text = String(editor.state.doc.textBetween(selection.from, selection.to, '\n'))
        if (!text.trim()) return undefined
        return {
            kind: 'text',
            text: text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text,
            attributes: { from: selection.from, to: selection.to },
        }
    } catch {
        return undefined
    }
}

const pageTarget = (input: {
    pageId: string
    title?: string
    spaceId?: string
    priority: number
    source: string
    isConversationTarget: boolean
    editor?: any
}): AgentOperationTarget => {
    const resolved = resolveAgentPageTarget(input.pageId)
    const canEdit = resolved ? resolved.canEdit !== false : true
    const selection = selectionOf(input.editor)
    const title = input.title || resolved?.title
    const spaceId = input.spaceId ?? resolved?.spaceId
    return {
        kind: 'page',
        label: '页面',
        id: String(input.pageId),
        title,
        spaceId,
        canEdit,
        priority: input.priority,
        source: input.source,
        summary: [
            `知识库页面${canEdit ? '（可编辑）' : '（只读）'}`,
            selection?.text ? `已选中 ${selection.text.length} 字：${selection.text.slice(0, 80)}` : '',
        ].filter(Boolean).join('；'),
        capabilities: canEdit ? ['document.read', 'document.write'] : ['document.read'],
        operations: pageOperations(
            String(input.pageId),
            canEdit,
            input.isConversationTarget,
            isLiveEditor(input.editor),
        ),
        selection,
        attributes: {
            pageId: String(input.pageId),
            // Distinguishes "target chosen but its editor is still coming" from
            // "target ready": a write now would fail with an actionable error.
            editorReady: isLiveEditor(input.editor),
            ...(input.isConversationTarget ? { isConversationTarget: true } : {}),
        },
    }
}

const buildPageTargets = (context: AgentOperationTargetContext): AgentOperationTarget[] => {
    const binding = context.sessionBinding
    const owner = context.owner ?? null
    const bound = binding?.getPageFor?.(owner) ?? binding?.getBoundPage?.() ?? null
    const visible = resolveAgentPageTarget()
    const ownerEditor = owner ? binding?.getEditorFor?.(owner) : null
    const bindingEditor = isLiveEditor(ownerEditor) ? ownerEditor : binding?.getEditor?.()
    const editorForPage = (pageId: string | undefined): any => {
        if (!pageId) return undefined
        // The app-global claim is the most specific answer ("this editor shows
        // that page"); the binding is the conversation's answer when it matches.
        const claimed = getAgentEditor(pageId)?.editor
        return isLiveEditor(claimed) ? claimed : undefined
    }

    const targets: AgentOperationTarget[] = []
    if (bound?.pageId) {
        targets.push(pageTarget({
            pageId: String(bound.pageId),
            title: bound.title,
            spaceId: bound.spaceId,
            priority: CONVERSATION_PAGE_PRIORITY,
            source: 'conversation',
            isConversationTarget: true,
            editor: editorForPage(String(bound.pageId)) ?? bindingEditor,
        }))
    }
    if (visible?.pageId && !isSamePage(visible.pageId, bound?.pageId)) {
        targets.push(pageTarget({
            pageId: String(visible.pageId),
            title: visible.title,
            spaceId: visible.spaceId === undefined ? undefined : String(visible.spaceId),
            priority: VISIBLE_PAGE_PRIORITY,
            source: 'visible',
            isConversationTarget: false,
            editor: editorForPage(String(visible.pageId)),
        }))
    }
    return targets
}

const corePageProvider: AgentOperationTargetProvider = {
    id: CORE_PAGE_PROVIDER,
    label: '当前页面（可见页 / 会话编辑目标）',
    priority: CONVERSATION_PAGE_PRIORITY,
    getTargets: buildPageTargets,
}

let coreProviderReady = false
const ensureCoreProvider = (): void => {
    if (coreProviderReady && providers.has(CORE_PAGE_PROVIDER)) return
    providers.set(CORE_PAGE_PROVIDER, corePageProvider)
    coreProviderReady = true
}

// ─────────────────────────────────────────────────────────────────
// Artifact provider (kernel pane / side peek)
// ─────────────────────────────────────────────────────────────────

/**
 * Turn a kernel artifact into a generic operation target. The artifact already
 * carries `kind`/`id`/`title`, so a pane can answer "what am I looking at?"
 * for any plugin-defined object without that plugin writing a resolver.
 */
export function operationTargetFromArtifact(
    artifact: AgentArtifact,
    options: { priority?: number; source?: string } = {},
): AgentOperationTarget {
    const isPage = artifact.kind === 'page'
    const page = isPage ? resolveAgentPageTarget(artifact.id) : undefined
    const canEdit = isPage ? page?.canEdit !== false : undefined
    return {
        kind: artifact.kind,
        label: artifact.kind === 'page' ? '页面' : artifact.kind,
        id: String(artifact.id),
        title: artifact.title,
        spaceId: artifact.spaceId,
        summary: artifact.subtitle
            || (isPage
                ? `知识库页面${canEdit ? '（可编辑）' : '（只读）'}`
                : `对话的工作目标（${artifact.kind}）`),
        canEdit,
        priority: options.priority,
        source: options.source ?? 'artifact',
        capabilities: isPage
            ? (canEdit ? ['document.read', 'document.write'] : ['document.read'])
            : ['artifact.preview'],
        operations: isPage
            ? pageOperations(String(artifact.id), canEdit !== false, true, true)
            : [{
            tool: 'focusArtifact',
            description: '把这个产物设为当前工作目标',
            args: { kind: artifact.kind, id: artifact.id },
        }],
        attributes: {
            artifactKind: artifact.kind,
            ...(artifact.spaceId ? { spaceId: artifact.spaceId } : {}),
            ...(artifact.data && typeof artifact.data === 'object' && !Array.isArray(artifact.data)
                ? { data: artifact.data as Record<string, unknown> }
                : {}),
        },
    }
}

// ─────────────────────────────────────────────────────────────────
// Model-facing projection (shared by the agent tool and host UIs)
// ─────────────────────────────────────────────────────────────────

/** JSON-safe, bounded shape handed to a model or across a plugin boundary. */
export interface AgentOperationTargetView {
    kind: string
    label?: string
    id: string
    title?: string
    summary?: string
    spaceId?: string
    canEdit?: boolean
    capabilities?: string[]
    operations?: Array<{
        tool: string
        description: string
        args?: unknown
        readOnly?: boolean
    }>
    selection?: {
        kind: string
        id?: string
        text?: string
        attributes?: Record<string, unknown>
    }
    attributes?: Record<string, unknown>
    source?: string
    primary?: boolean
}

const MAX_TEXT_CHARS = 2_000
const MAX_ATTRIBUTE_STRING = 800
const MAX_ATTRIBUTES = 30
const MAX_ARRAY = 50
const MAX_DEPTH = 4

const clipText = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max)}…` : value

/** Bounded, cycle-safe projection of provider data. */
const sanitizeValue = (value: unknown, depth = 0): unknown => {
    if (value === null || value === undefined) return value
    if (typeof value === 'string') return clipText(value, MAX_ATTRIBUTE_STRING)
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'function' || typeof value === 'symbol') return undefined
    if (depth >= MAX_DEPTH) return '[depth-limit]'
    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY).map(item => sanitizeValue(item, depth + 1))
    }
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {}
        let count = 0
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (count >= MAX_ATTRIBUTES) break
            const projected = sanitizeValue(item, depth + 1)
            if (projected === undefined) continue
            out[key] = projected
            count += 1
        }
        return out
    }
    return String(value)
}

const sanitizeAttributes = (
    value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
    if (!value) return undefined
    const projected = sanitizeValue(value) as Record<string, unknown>
    return projected && Object.keys(projected).length > 0 ? projected : undefined
}

const viewOperation = (operation: AgentTargetOperation): NonNullable<AgentOperationTargetView['operations']>[number] => ({
    tool: operation.tool,
    description: operation.description,
    ...(operation.args ? { args: sanitizeValue(operation.args) } : {}),
    ...(operation.readOnly ? { readOnly: true } : {}),
})

const viewSelection = (selection: AgentTargetSelection | undefined): AgentOperationTargetView['selection'] => {
    if (!selection) return undefined
    return {
        kind: selection.kind,
        ...(selection.id ? { id: selection.id } : {}),
        ...(selection.text ? { text: clipText(selection.text, MAX_TEXT_CHARS) } : {}),
        ...(selection.attributes ? { attributes: sanitizeAttributes(selection.attributes) } : {}),
    }
}

/** Project one resolved target into the wire shape (drops functions/cycles). */
export function serializeAgentOperationTarget(
    target: AgentOperationTarget & { primary?: boolean },
): AgentOperationTargetView {
    return {
        kind: target.kind,
        ...(target.label ? { label: target.label } : {}),
        id: target.id,
        ...(target.title ? { title: target.title } : {}),
        ...(target.summary ? { summary: target.summary } : {}),
        ...(target.spaceId ? { spaceId: target.spaceId } : {}),
        ...(target.canEdit === undefined ? {} : { canEdit: target.canEdit }),
        ...(target.capabilities?.length ? { capabilities: target.capabilities } : {}),
        ...(target.operations?.length ? { operations: target.operations.map(viewOperation) } : {}),
        ...(target.selection ? { selection: viewSelection(target.selection) } : {}),
        ...(target.attributes ? { attributes: sanitizeAttributes(target.attributes) } : {}),
        ...(target.source ? { source: target.source } : {}),
        ...(target.primary ? { primary: true } : {}),
    }
}

/** Project a whole resolution result; what `getCurrentTarget` returns. */
export function serializeAgentOperationTargets(
    targets: AgentOperationTarget[],
): AgentOperationTargetView[] {
    return targets.map(serializeAgentOperationTarget)
}

// ─────────────────────────────────────────────────────────────────
// React binding
// ─────────────────────────────────────────────────────────────────

/**
 * Register a provider from a React surface. The provider's `getTargets` is read
 * through a ref, so changing the focused object does not re-register (and does
 * not notify every other surface) on each render.
 */
export function useAgentOperationTargetProvider(
    provider: AgentOperationTargetProvider | null | undefined,
): void {
    const ref = useRef(provider)
    ref.current = provider
    const id = provider?.id
    const label = provider?.label
    const priority = provider?.priority
    useEffect(() => {
        if (!id) return
        return registerAgentOperationTargetProvider({
            id,
            label,
            priority,
            getTargets: context => ref.current?.getTargets(context) ?? null,
            subscribe: listener => ref.current?.subscribe?.(listener) ?? (() => {}),
        })
    }, [id, label, priority])
}

/**
 * Publish a conversation's artifact target (the kernel pane / dock side peek).
 * `artifact` is the surface's live value; null means "this conversation has no
 * artifact target right now" and contributes nothing.
 */
export function useAgentArtifactTargetProvider(
    conversationId: string,
    artifact: AgentArtifact | null | undefined,
): void {
    const targetRef = useRef<AgentOperationTarget | null>(null)
    targetRef.current = artifact
        ? operationTargetFromArtifact(artifact, { priority: 90, source: 'pane' })
        : null
    const provider = useMemo<AgentOperationTargetProvider>(() => ({
        id: `conversation-artifact:${conversationId}`,
        label: '会话工作目标（分栏产物）',
        priority: 90,
        getTargets: (context) => {
            if (context.conversationId && context.conversationId !== conversationId) return null
            return targetRef.current
        },
    }), [conversationId])
    useAgentOperationTargetProvider(provider)
}