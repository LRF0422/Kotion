/**
 * Knowledge Backend Provider
 * 
 * Primary model provider for the backend-driven agent architecture.
 * All chat requests go through /api/v1/chat/completions.
 * 
 * This provider handles:
 * - Backend agent API communication (/api/knowledge-agent/api/v1/chat/completions)
 * - Data Stream Protocol v2 parsing (for backend responses)
 * - SSE streaming with session and annotation handling
 * - Bidirectional tool calling support
 */
import type {
    LanguageModelV2,
    LanguageModelV2StreamPart,
    LanguageModelV2FinishReason,
    LanguageModelV2Content,
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
                // Support bidirectional tool mode: include tool_calls if present
                const textContent = (msg.content as any[])
                    .filter((p: any) => p.type === 'text')
                    .map((p: any) => p.text)
                    .join('');
                const toolCalls = (msg.content as any[])
                    .filter((p: any) => p.type === 'tool-call');

                const assistantMsg: any = { role: 'assistant' };
                if (textContent) {
                    assistantMsg.content = textContent;
                }
                if (toolCalls.length > 0) {
                    assistantMsg.tool_calls = toolCalls.map((tc: any) => ({
                        id: tc.toolCallId,
                        type: 'function',
                        function: {
                            name: tc.toolName,
                            arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input),
                        },
                    }));
                }
                if (textContent || toolCalls.length > 0) {
                    messages.push(assistantMsg);
                }
                break;
            }

            case 'tool': {
                // Support bidirectional tool mode: emit proper tool role messages
                const toolParts: any[] = [];
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
                        // Emit as proper tool role message for bidirectional mode
                        toolParts.push({
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            result: resultStr,
                        });
                    }
                }

                if (toolParts.length > 0) {
                    // Emit as tool role messages (proper OpenAI format for bidirectional mode)
                    for (const tp of toolParts) {
                        messages.push({
                            role: 'tool',
                            tool_call_id: tp.toolCallId,
                            name: tp.toolName,
                            content: tp.result,
                        });
                    }
                }
                break;
            }
        }
    }

    return messages;
}

/**
 * Options for Knowledge model session and callbacks
 */
export interface KnowledgeModelOptions {
    /** Session ID for conversation continuity */
    sessionId?: string
    /** Conversation ID for multi-turn conversations */
    conversationId?: string
    /** Callback for annotation events from Data Stream v2 */
    onAnnotation?: (annotations: any[]) => void
    /** User ID */
    userId?: number
    /** Frontend passthrough metadata */
    data?: Record<string, any>
    /** Frontend tool definitions for bidirectional tool calling */
    tools?: any[]
}

/**
 * Create a Knowledge provider model that implements LanguageModelV2.
 * 
 * @param modelId - The model ID to use (default: 'deepseek-chat')
 * @param apiBase - Optional custom API base URL (default: '/api/knowledge-agent/api/v1')
 * @param options - Optional session configuration and callbacks
 */
export function createKnowledgeModel(
    modelId: string = 'deepseek-chat',
    apiBase?: string,
    modelOptions?: KnowledgeModelOptions
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
                    ...(modelOptions?.sessionId ? { sessionId: modelOptions.sessionId } : {}),
                    ...(modelOptions?.conversationId ? { conversationId: modelOptions.conversationId } : {}),
                    ...(modelOptions?.userId ? { userId: modelOptions.userId } : {}),
                    ...(modelOptions?.data ? { data: modelOptions.data } : {}),
                    ...(modelOptions?.tools ? { tools: modelOptions.tools } : {}),
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
                    ...(modelOptions?.sessionId ? { sessionId: modelOptions.sessionId } : {}),
                    ...(modelOptions?.conversationId ? { conversationId: modelOptions.conversationId } : {}),
                    ...(modelOptions?.userId ? { userId: modelOptions.userId } : {}),
                    ...(modelOptions?.data ? { data: modelOptions.data } : {}),
                    ...(modelOptions?.tools ? { tools: modelOptions.tools } : {}),
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
                                            type: 'tool-input-delta',
                                            id: delta.toolCallId || crypto.randomUUID(),
                                            delta: typeof delta.argsTextDelta === 'string' ? delta.argsTextDelta : JSON.stringify(delta.argsTextDelta),
                                        } as any);
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

                                    case 'c': {
                                        // Tool call streaming start (tool-call-streaming)
                                        const tcStream = JSON.parse(payload);
                                        controller.enqueue({
                                            type: 'tool-call-streaming',
                                            toolCallId: tcStream.toolCallId,
                                            toolName: tcStream.toolName,
                                        } as any);
                                        break;
                                    }

                                    case '8': {
                                        // Annotation event (Data Stream v2)
                                        // Note: Don't enqueue as 'annotation' type - AI SDK doesn't recognize it
                                        // and will throw "Unhandled chunk type: annotation"
                                        // Instead, call the onAnnotation callback directly
                                        try {
                                            const annotations = JSON.parse(payload);
                                            const annotationArray = Array.isArray(annotations) ? annotations : [annotations];
                                            if (modelOptions?.onAnnotation) {
                                                modelOptions.onAnnotation(annotationArray);
                                            }
                                        } catch (annotationError) {
                                            console.warn('[KnowledgeProvider] Failed to parse annotation:', payload, annotationError);
                                        }
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
