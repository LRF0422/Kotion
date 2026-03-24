// lib/knowledge-provider.ts
import type {
    LanguageModelV2,
    LanguageModelV2StreamPart,
    LanguageModelV2FinishReason,
    LanguageModelV2FunctionTool,
    LanguageModelV2Content,
    LanguageModelV2CallOptions,
    LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import { getBearerHeader } from '../../utils/auth';

/**
 * Fetch with retry logic and exponential backoff.
 * Retries on 429 (rate limit), 502, 503 (server errors), and network errors.
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3
): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);

            // Retry on rate limiting or temporary server errors
            if (res.status === 429 || res.status === 502 || res.status === 503) {
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
            }

            return res;
        } catch (e: any) {
            lastError = e;

            // Don't retry on abort
            if (e.name === 'AbortError') throw e;

            if (attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
        }
    }

    throw lastError || new Error('Request failed after retries');
}

/**
 * Convert AI SDK V2 tool definitions to OpenAI-compatible tool format.
 */
function convertToolsToOpenAI(tools?: LanguageModelV2CallOptions['tools']) {
    if (!tools || tools.length === 0) return undefined;
    return tools
        .filter((t): t is LanguageModelV2FunctionTool => t.type === 'function')
        .map(t => ({
            type: 'function' as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
            },
        }));
}

/**
 * Convert AI SDK V2 prompt format to OpenAI-compatible messages format.
 * 
 * This function properly handles:
 * - System messages (string content)
 * - User messages (content parts array with text/image)
 * - Assistant messages (content parts array with text/tool-call)
 * - Tool messages (content parts array with tool-result)
 */
function convertPromptToMessages(prompt: LanguageModelV2Prompt): any[] {
    const messages: any[] = [];

    for (const msg of prompt) {
        switch (msg.role) {
            case 'system': {
                // System messages have string content directly
                const content = typeof msg.content === 'string'
                    ? msg.content
                    : (msg.content as any[])
                        .filter((p: any) => p.type === 'text')
                        .map((p: any) => p.text)
                        .join('');
                messages.push({ role: 'system', content });
                break;
            }

            case 'user': {
                // User messages have content parts array
                const textParts = (msg.content as any[])
                    .filter((p: any) => p.type === 'text')
                    .map((p: any) => p.text)
                    .join('');
                messages.push({ role: 'user', content: textParts });
                break;
            }

            case 'assistant': {
                // DeepSeek doesn't support tool_calls in assistant messages
                // Only keep the text content, strip out tool_calls entirely
                const textContent = (msg.content as any[])
                    .filter((p: any) => p.type === 'text')
                    .map((p: any) => p.text)
                    .join('');
                // Only include if there's actual text content
                if (textContent) {
                    messages.push({ role: 'assistant', content: textContent });
                }
                break;
            }

            case 'tool': {
                // Merge tool results into the preceding assistant message
                const resultParts: string[] = [];
                for (const part of msg.content as any[]) {
                    if (part.type === 'tool-result') {
                        let resultStr: string;
                        const output = (part as any).output ?? (part as any).result;
                        if (!output) {
                            resultStr = '(completed)';
                        } else if (typeof output === 'string') {
                            resultStr = output;
                        } else if (output.type === 'text') {
                            resultStr = output.value;
                        } else if (output.type === 'json') {
                            resultStr = JSON.stringify(output.value, null, 2);
                        } else {
                            resultStr = JSON.stringify(output, null, 2);
                        }
                        resultParts.push(`[Tool: ${part.toolName}]\n${resultStr}`);
                    }
                }
                if (resultParts.length > 0) {
                    const toolResultText = `\n\nTool execution results:\n\n${resultParts.join('\n\n')}`;
                    // Find the last assistant message and append
                    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
                    if (lastAssistant) {
                        lastAssistant.content = (lastAssistant.content || '') + toolResultText;
                    } else {
                        // Fallback: if no assistant message exists, add as user message
                        messages.push({ role: 'user', content: toolResultText.trim() });
                    }
                }
                break;
            }
        }
    }

    return messages;
}

/**
 * Create a Knowledge provider model that implements LanguageModelV2.
 * 
 * @param modelId - The model ID to use (default: 'deepseek-chat')
 * @param apiBase - Optional custom API base URL (default: '/api/knowledge-agent/api/v1')
 */
export function createKnowledgeModel(
    modelId: string = 'deepseek-chat',
    apiBase?: string
): LanguageModelV2 {
    const API_BASE = apiBase || '/api/knowledge-agent/api/v1';

    return {
        specificationVersion: 'v2',     // ← Required by AI SDK 5
        modelId,
        provider: 'knowledge',
        supportedUrls: {} as Record<string, RegExp[]>,

        async doGenerate(options) {
            const messages = convertPromptToMessages(options.prompt);

            const res = await fetchWithRetry(`${API_BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getBearerHeader(),
                },
                body: JSON.stringify({
                    model: modelId,
                    messages,
                    stream: false,
                    ...(options.tools?.length ? { tools: convertToolsToOpenAI(options.tools) } : {}),
                    ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
                }),
                signal: options.abortSignal,
            });

            // HTTP error handling
            if (!res.ok) {
                const errorText = await res.text().catch(() => 'Unknown error');
                throw new Error(`Knowledge API error (${res.status}): ${errorText}`);
            }

            const json = await res.json();
            const choice = json.choices?.[0];

            // Build content array: text + tool calls
            const content: LanguageModelV2Content[] = [];
            if (choice?.message?.content) {
                content.push({ type: 'text' as const, text: choice.message.content });
            }
            // Ensure at least one content item
            if (content.length === 0) {
                content.push({ type: 'text' as const, text: '' });
            }

            return {
                content,
                finishReason: (choice?.finish_reason ?? 'stop') as LanguageModelV2FinishReason,
                usage: {
                    inputTokens: json.usage?.prompt_tokens ?? 0,
                    outputTokens: json.usage?.completion_tokens ?? 0,
                    totalTokens: (json.usage?.prompt_tokens ?? 0) + (json.usage?.completion_tokens ?? 0),
                },
                request: { body: options.prompt },
                response: {
                    id: json.id ?? '',
                    timestamp: new Date(),
                    modelId,
                },
                warnings: [],
            };
        },

        async doStream(options) {
            const messages = convertPromptToMessages(options.prompt);

            const res = await fetchWithRetry(`${API_BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getBearerHeader(),
                },
                body: JSON.stringify({
                    model: modelId,
                    messages,
                    stream: true,
                    streamProtocol: 'data',
                    ...(options.tools?.length ? { tools: convertToolsToOpenAI(options.tools) } : {}),
                    ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
                }),
                signal: options.abortSignal,
            });

            // HTTP error handling
            if (!res.ok) {
                const errorText = await res.text().catch(() => 'Unknown error');
                throw new Error(`Knowledge API error (${res.status}): ${errorText}`);
            }

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();

            const stream = new ReadableStream<LanguageModelV2StreamPart>({
                async pull(controller) {
                    let buffer = '';
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            controller.close();
                            return;
                        }
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop()!;

                        for (const line of lines) {
                            if (!line || line.length < 2) continue;
                            const code = line[0];
                            const payload = line.substring(2);
                            try {
                                switch (code) {
                                    case '0': {
                                        // Text delta
                                        controller.enqueue({
                                            type: 'text-delta',
                                            id: crypto.randomUUID(),
                                            delta: JSON.parse(payload),
                                        });
                                        break;
                                    }

                                    case 'b': {
                                        // Tool call delta (incremental streaming)
                                        const delta = JSON.parse(payload);
                                        controller.enqueue({
                                            type: 'tool-input-delta' as LanguageModelV2StreamPart['type'],
                                            id: delta.toolCallId || crypto.randomUUID(),
                                            delta: typeof delta.argsTextDelta === 'string' ? delta.argsTextDelta : JSON.stringify(delta.argsTextDelta),
                                        });
                                        break;
                                    }

                                    case '9': {
                                        // Complete tool call
                                        const tc = JSON.parse(payload);
                                        controller.enqueue({
                                            type: 'tool-call',
                                            toolCallId: tc.toolCallId,
                                            toolName: tc.toolName,
                                            input: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
                                        });
                                        break;
                                    }

                                    case 'e': {
                                        // Finish event
                                        const f = JSON.parse(payload);
                                        controller.enqueue({
                                            type: 'finish',
                                            finishReason: f.finishReason ?? 'stop',
                                            usage: {
                                                inputTokens: f.usage?.promptTokens ?? 0,
                                                outputTokens: f.usage?.completionTokens ?? 0,
                                                totalTokens: (f.usage?.promptTokens ?? 0) + (f.usage?.completionTokens ?? 0),
                                            },
                                        });
                                        break;
                                    }

                                    case 'd': {
                                        // Error event
                                        const e = JSON.parse(payload);
                                        controller.enqueue({ type: 'error', error: new Error(e.error) });
                                        break;
                                    }
                                }
                            } catch (parseError) {
                                console.warn('[KnowledgeProvider] Failed to parse stream line:', line, parseError);
                            }
                        }
                    }
                },
            });

            return {
                stream,
                request: { body: options.prompt },
                response: { headers: {} },
            };
        },
    };
}

// Usage with streamText:
// import { streamText } from 'ai';
// const result = await streamText({ model: createKnowledgeModel('deepseek-chat'), prompt: 'Hello' });
