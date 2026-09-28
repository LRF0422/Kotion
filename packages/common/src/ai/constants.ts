/**
 * Agent constants.
 *
 * No prompt text lives here. The backend runs the agent, so its prompt is the
 * backend's — and deliberately domain-blind: it knows how to use tools, not what
 * this editor's documents are. Everything domain-specific is declared by the
 * side that provides the tools, as capability data (tool descriptions + skills);
 * see `skills/built-in/document-editing.ts` and `kernel/surface-skills.ts`.
 */

// ============ Agent Configuration ============

/** Default maximum steps for tool loop agent */
export const DEFAULT_MAX_STEPS = 100

/** Default model name */
export const DEFAULT_MODEL = 'deepseek-chat'

/** Default model provider */
export const DEFAULT_PROVIDER = 'deepseek'

