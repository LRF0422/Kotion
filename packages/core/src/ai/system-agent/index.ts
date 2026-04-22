/**
 * System AI Agent Module (Core - UI only)
 *
 * Logic (context, hooks) is in @kn/common.
 * This module exports only core-specific UI components.
 */

// Core-specific UI Components
export {
    AIAssistantPanel,
    AIAssistantTrigger,
    useAIAssistantShortcut,
    type AIAssistantPanelProps,
    type AIAssistantTriggerProps
} from './AIAssistantPanel'

// Page Component
export { AIAssistantPage } from '../../pages/AIAssistantPage'
