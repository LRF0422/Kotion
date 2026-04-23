/**
 * @deprecated This provider calls DeepSeek API directly.
 * In the new backend-driven architecture, all chat goes through
 * /api/v1/chat/completions via createKnowledgeModel() instead.
 * This file is kept as a fallback but should not be used for new code.
 */

// deepseek-direct-provider.ts
// Direct DeepSeek API provider using the official @ai-sdk/deepseek package.
// Calls DeepSeek API directly without going through the backend proxy.
// DEPRECATED: Use createKnowledgeModel() from knowledge-provider.ts instead.

import { createDeepSeek } from '@ai-sdk/deepseek'

/**
 * Get API key from environment variable
 */
function getApiKey(): string {
    const apiKey = (import.meta as any).env?.VITE_DEEPSEEK_API_KEY ||
        (typeof process !== 'undefined' ? process.env?.VITE_DEEPSEEK_API_KEY : undefined);

    if (!apiKey) {
        throw new Error('VITE_DEEPSEEK_API_KEY environment variable is not set');
    }
    return apiKey;
}

/**
 * @deprecated Use createKnowledgeModel() from knowledge-provider.ts instead.
 * This calls DeepSeek API directly; the new architecture routes through the backend.
 *
 * Create a DeepSeek Direct provider model using @ai-sdk/deepseek.
 * This calls the DeepSeek API directly without going through the backend proxy.
 *
 * Tool calling, SSE streaming, and message formatting are handled automatically
 * by the AI SDK's DeepSeek provider.
 *
 * @param modelId - The model ID to use (default: 'deepseek-chat')
 */
export function createDeepSeekDirectModel(modelId: string = 'deepseek-chat') {
    const deepseek = createDeepSeek({
        apiKey: getApiKey(),
    })
    return deepseek(modelId)
}
