import { generateText } from "@kn/core";
import { Editor } from "@kn/editor";
import { TextSelection } from "@kn/editor";
import { logger } from "@kn/common";

// API Configuration - should be moved to environment variables
const AI_IMAGE_API_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/images/generations";
const AI_IMAGE_API_KEY = process.env.VITE_AI_IMAGE_API_KEY || '400719e8d18a04f9f92702e84b2d36bd.Olz5beCB8EV8mrrG';
const AI_IMAGE_MODEL = "cogview-3-plus";

interface AIImageResponse {
    data?: Array<{ url: string }>;
    error?: {
        message: string;
        code?: string;
    };
}

/**
 * Generate AI text based on editor selection
 * @param editor - The editor instance
 * @param tips - Prompt/instruction for AI generation
 */

export const aiText = async (editor: Editor, tips: string): Promise<void> => {
    const selection = editor.state.selection;
    let result = ""

    if (!(selection instanceof TextSelection)) {
        logger.warn('AI text generation requires text selection');
        return;
    }

    try {
        let from = editor.state.selection.from
        let text = editor.state.doc.textBetween(selection.from, selection.to)

        if (!text.trim()) {
            logger.warn('Cannot generate AI text from empty selection');
            return;
        }

        const { textStream } = generateText(`${tips}，内容如下：${text}，请不要说多余的话`)
        editor.commands.deleteSelection()
        editor.commands.toggleLoadingDecoration(from, "")

        for await (const part of textStream) {
            result += part
            editor.chain().focus().toggleLoadingDecoration(from, result).run()
        }

        editor.chain().focus()
            .insertContentAt(from, result, {
                applyInputRules: false,
                applyPasteRules: false,
                parseOptions: {
                    preserveWhitespace: false
                }
            }).run();
        editor.chain().removeLoadingDecoration().run()
    } catch (error) {
        logger.error('Failed to generate AI text:', error);
        editor.chain().removeLoadingDecoration().run();
        throw error;
    }
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
