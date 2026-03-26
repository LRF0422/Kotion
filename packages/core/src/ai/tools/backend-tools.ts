import { z } from '@kn/ui'
import type { ToolsRecord } from '../types'
import { getBearerHeader } from '../../utils/auth'

const BACKEND_API_BASE = '/api/knowledge-agent/api/v1'

/**
 * Create backend tools that delegate to the backend AI agent for content generation.
 * These tools allow the frontend agent to use backend AI capabilities.
 */
export function createBackendTools(): ToolsRecord {
    return {
        generateContent: {
            description: 'Generate content using the backend AI agent. Use this tool when you need AI-generated text such as summaries, rewrites, translations, explanations, or any creative/analytical text content. Provide a clear instruction describing what to generate, and optionally include relevant document context.',
            inputSchema: z.object({
                instruction: z.string().describe('Clear instruction describing what content to generate'),
                context: z.string().optional().describe('Relevant document context to inform the generation'),
            }),
            execute: async ({ instruction, context }: { instruction: string; context?: string }) => {
                try {
                    const messages: Array<{ role: string; content: string }> = []

                    // System message for content generation
                    messages.push({
                        role: 'system',
                        content: 'You are a content generation assistant. Generate the requested content based on the provided instruction and context. Output only the generated content, no explanations or meta-commentary.'
                    })

                    // User message with instruction and optional context
                    let userContent = instruction
                    if (context) {
                        userContent = `## Context\n${context}\n\n## Instruction\n${instruction}`
                    }
                    messages.push({ role: 'user', content: userContent })

                    console.log('[generateContent] Calling backend API...')

                    const res = await fetch(`${BACKEND_API_BASE}/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...getBearerHeader(),
                        },
                        body: JSON.stringify({
                            model: 'deepseek-chat',
                            messages,
                            stream: false,
                        }),
                    })

                    console.log('[generateContent] Response status:', res.status)

                    if (!res.ok) {
                        const errorText = await res.text().catch(() => 'Unknown error')
                        console.error('[generateContent] Backend error:', res.status, errorText)
                        return { success: false, error: `Backend API error (${res.status}): ${errorText}` }
                    }

                    // Read response as text first to handle both JSON and DSPv2 formats
                    const responseText = await res.text()
                    console.log('[generateContent] Raw response:', responseText.substring(0, 500))

                    let content = ''

                    // Try standard JSON format first (OpenAI-compatible)
                    try {
                        const json = JSON.parse(responseText)
                        content = json.choices?.[0]?.message?.content || ''
                    } catch {
                        // Fallback: parse Data Stream Protocol v2 format
                        // Lines like: 0:"text content"
                        const lines = responseText.split('\n')
                        const textParts: string[] = []
                        for (const line of lines) {
                            if (!line || line.length < 2) continue
                            const code = line[0]
                            const payload = line.substring(2)
                            if (code === '0') {
                                try {
                                    textParts.push(JSON.parse(payload))
                                } catch {
                                    textParts.push(payload)
                                }
                            }
                        }
                        content = textParts.join('')
                    }

                    console.log('[generateContent] Parsed content:', content.substring(0, 200))
                    return { success: true, content }
                } catch (error: any) {
                    console.error('[generateContent] Exception:', error)
                    return { success: false, error: `Failed to generate content: ${error.message}` }
                }
            }
        }
    }
}
