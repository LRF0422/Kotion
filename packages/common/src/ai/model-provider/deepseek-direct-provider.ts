// deepseek-direct-provider.ts
// Direct DeepSeek API provider using the official @ai-sdk/deepseek package.
// Calls DeepSeek API directly without going through the backend proxy.
// The backend is only used for content generation via the generateContent tool.

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
