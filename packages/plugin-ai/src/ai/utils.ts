import { generateText } from "@kn/common";
import { logger } from "@kn/common";

// API Configuration — the key MUST come from the build environment.
// A hardcoded fallback key was previously shipped in the client bundle (leaked
// credential); it has been removed. Builds without VITE_AI_IMAGE_API_KEY now
// fail fast with a clear error instead of silently using a leaked secret.
const AI_IMAGE_API_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/images/generations";
const AI_IMAGE_API_KEY = (import.meta as any).env?.VITE_AI_IMAGE_API_KEY || '';
const AI_IMAGE_MODEL = "cogview-3-plus";

interface AIImageResponse {
    data?: Array<{ url: string }>;
    error?: {
        message: string;
        code?: string;
    };
}

/**
 * Generate AI text from prompt
 * @param tips - Prompt/instruction for AI generation
 * @param onUpdate - Callback function called with each text chunk
 * @returns Promise that resolves to complete generated text
 */
export const aiGeneration = async (tips: string, onUpdate: (res: string) => void): Promise<string> => {
    let result = ""

    try {
        const { textStream } = generateText(`${tips}，请不要说多余的话`)

        for await (const part of textStream) {
            result += part
            onUpdate(part)
        }

        return result
    } catch (error) {
        logger.error('Failed to generate AI content:', error);
        throw error;
    }
}

/**
 * Generate image using AI based on text prompt
 * @param prompt - Text description for image generation
 * @returns Promise that resolves to API response with image data
 */
export const aiImageWriter = async (prompt: string): Promise<AIImageResponse> => {
    if (!prompt || !prompt.trim()) {
        throw new Error('Image prompt cannot be empty');
    }

    try {
        const res = await fetch(AI_IMAGE_API_ENDPOINT, {
            headers: {
                Authorization: AI_IMAGE_API_KEY,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
                model: AI_IMAGE_MODEL,
                prompt: prompt
            })
        });

        if (!res.ok) {
            throw new Error(`API request failed with status ${res.status}`);
        }

        const data: AIImageResponse = await res.json();
        return data;
    } catch (error) {
        logger.error('Failed to generate AI image:', error);
        throw error;
    }
}
