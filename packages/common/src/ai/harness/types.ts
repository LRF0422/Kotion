/**
 * Agent Harness Types
 *
 * The unified, UI-agnostic agent runtime core. The harness owns the
 * backend-driven bidirectional tool loop and exposes its progress as a typed
 * `AsyncGenerator<HarnessEvent>`. React adapters (the editor hook and the
 * system-agent provider) build the capability catalog and consume the event
 * stream, mapping events onto their own callbacks/state.
 */

import type { ChatMessage } from '../chat-client/types'
import type { CapabilityCatalog } from '../capabilities'
import type { OnToolExecution, ToolDefinition } from '../types'

// ============ Harness Events ============

/**
 * Typed event emitted by {@link AgentHarness.run}. One union covers the whole
 * loop lifecycle so adapters can switch on `type` instead of parsing raw SSE.
 */
export type HarnessEvent =
    | { type: 'text-delta'; content: string }
    | { type: 'reasoning-delta'; content: string }
    | { type: 'tool-call-start'; id: string; toolName: string; args: Record<string, unknown> }
    | {
          type: 'tool-call-end'
          id: string
          toolName: string
          result?: unknown
          error?: string
          durationMs: number
      }
    | { type: 'annotation'; annotations: any[] }
    | { type: 'session'; sessionId?: string; conversationId?: string }
    | {
          type: 'finish'
          finishReason?: string
          usage?: { promptTokens: number; completionTokens: number }
      }
    | { type: 'error'; error: string }

// ============ Run Input ============

export interface HarnessRunInput {
    /** Full message list including the system message. Adapters pre-build this. */
    messages: ChatMessage[]
    /** Model id (e.g. 'deepseek-chat'); falls back to the chat client default. */
    model?: string
    /** Immutable capability snapshot built by the adapter via collectCapabilityCatalog. */
    catalog: CapabilityCatalog
    /** Resolve a tool executor by name for tool calls the backend dispatches. */
    resolveTool: (name: string) => ToolDefinition | undefined
    /** Session id for conversation continuity. */
    sessionId?: string
    /** Conversation id for multi-turn conversations. */
    conversationId?: string
    /** Abort signal — the harness does NOT own an AbortController. */
    signal: AbortSignal
    /** Max tool-loop iterations (default DEFAULT_MAX_STEPS). */
    maxSteps?: number
    /** Run mode: 'plan' (read-only research → plan → approval) or 'execute' (default). */
    mode?: 'plan' | 'execute'
    /** Per-yield SSE inactivity timeout in ms (default 10 minutes). */
    inactivityTimeoutMs?: number
    /**
     * API version to use: 'v1' (OpenAI-compatible SSE) or 'v2' (semantic events).
     * Defaults to 'v1' for backward compatibility. When set to 'v2', the harness
     * uses V2ChatClient which parses the V2 semantic SSE protocol.
     */
    apiVersion?: 'v1' | 'v2'
    /** Sampling temperature; when undefined the backend default is used. */
    temperature?: number
    /** Max response tokens; when undefined the backend default is used. */
    maxTokens?: number
    /**
     * Notification callback used only for the "tool not available on frontend"
     * path. Frontend tool execution tracking is handled by wrapping tools with
     * {@link wrapToolsWithCallback} before they reach `resolveTool`.
     */
    onToolExecution?: OnToolExecution
}

// ============ Harness Interface ============

export interface AgentHarness {
    /** Run the agent loop, yielding typed events until finish/error/abort. */
    run(input: HarnessRunInput): AsyncGenerator<HarnessEvent>
}

// ============ Execution Step (shared UI shape) ============

/**
 * A single tool execution as surfaced to the UI. Re-homed here so both the
 * system-agent provider and the harness share one canonical definition.
 */
export interface ExecutionStep {
    id: string
    toolName: string
    args: any
    result?: any
    error?: string
    status: 'running' | 'success' | 'error'
    timestamp: number
    duration?: number
}
