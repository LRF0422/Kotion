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
    type SystemAgentState,
    type SystemAgentContextValue,
    type SystemAgentProviderProps,
    type ExecutionStep,
    type StreamPromptOptions
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

// UI Components
export {
    AIAssistantPanel,
    AIAssistantTrigger,
    useAIAssistantShortcut,
    type AIAssistantPanelProps,
    type AIAssistantTriggerProps
} from './AIAssistantPanel'

// Page Component - exported from pages directory
export { AIAssistantPage } from '../../pages/AIAssistantPage'
