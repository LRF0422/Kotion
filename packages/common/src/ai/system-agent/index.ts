/**
 * System AI Agent Module
 *
 * Provides a global AI agent that can be used anywhere in the application.
 */

// Context and Provider
export {
    SystemAgentProvider,
    useSystemAgent,
    useSystemAgentAvailable,
    applySubAgentAnnotations,
    type SystemAgentState,
    type SystemAgentContextValue,
    type SystemAgentProviderProps,
    type ExecutionStep,
    type StreamPromptOptions,
    type SubAgentNode
} from './context'

// Hooks
export {
    useSystemAgentStream,
    useSystemAgentEditor,
    useSystemAgentSkills,
    useQuickAction,
    type UseSystemAgentStreamOptions,
    type UseSystemAgentStreamResult,
    type QuickActionOptions
} from './hooks'

// Note: UI Components (AIAssistantPanel, AiInlineMenu, AIAssistantPage)
// are exported from @kn/core, not @kn/common
