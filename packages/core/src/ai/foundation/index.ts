/**
 * AI Foundation Module
 *
 * Provides a global AI foundation for the application.
 * This module exports all types, classes, and hooks for AI capabilities.
 */

// Types
export type {
    AIModelConfig,
    AIFoundationConfig,
    AIContextType,
    AIContext,
    EditorContextData,
    ToolRegistryOptions,
    ToolRegistry,
    SkillRegistryFoundation,
    AgentOptions,
    StreamOptions,
    StreamResult,
    AIAgent,
    AIEventType,
    AIEvent,
    AIEventListener,
    AIFoundation,
    AIFoundationProviderProps
} from './types'

// Configuration
export {
    getAIConfigManager,
    createAIConfigManager,
    type AIConfigManager
} from './ai-config'

// Tool Registry
export {
    getGlobalToolRegistry,
    createGlobalToolRegistry,
    GlobalToolRegistryImpl,
    type GlobalToolRegistryOptions
} from './registry/tool-registry'

// Editor Context
export {
    getEditorContextManager,
    createEditorContextManager,
    EditorContextManager
} from './context-providers/editor-context'

// Agent Service
export {
    AgentService,
    AIAgentImpl
} from './agent/agent-service'

// AI Foundation
export {
    getAIFoundation,
    createAIFoundation,
    initializeAIFoundation,
    resetAIFoundation,
    AIFoundationImpl
} from './ai-foundation'

// Hooks
export {
    useAIFoundation,
    useAIFoundationReady,
    useAIFoundationEvents
} from './hooks/use-ai-foundation'

export {
    useAgent,
    useDefaultAgent,
    type UseAgentOptions,
    type UseAgentResult
} from './hooks/use-agent'

export {
    useStreaming,
    useStreamProcessor,
    useMultiStreaming,
    type UseStreamingResult
} from './hooks/use-streaming'
