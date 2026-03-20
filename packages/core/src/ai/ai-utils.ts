import { streamText } from "ai"
import { } from "@ai-sdk/react"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { getEnvVariable, isEnvVarEnabled } from '@kn/common';

export const deepseek = createDeepSeek({
    apiKey: getEnvVariable("DEEPSERACH_API_KEY")
})


const generateText = (prompt: string, tools?: any): any => {
    console.log("generateText", prompt);
    return streamText({
        model: deepseek("deepseek-chat"),
        prompt: prompt,
        tools: tools,
    })
}

export { generateText }


const API_BASE = '/api/knowledge-agent/api/v1'; // or your gateway URL like http://localhost:7780/api/v1

// Custom provider for Knowledge Cloud agent
export function createKnowledgeProvider(): any {
    return {
        // Chat model factory
        chat(modelId: string = 'deepseek-chat') {
            return {
                modelId,
                provider: 'knowledge',
                // This tells AI SDK to use Data Stream Protocol v2
                streamProtocol: 'data' as const,

                async doStream(options: any) {
                    const { messages, tools, abortSignal } = options;

                    const response = await fetch(`${API_BASE}/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: modelId,
                            messages: messages.map((m: any) => ({
                                role: m.role,
                                content: m.content,
                            })),
                            tools: tools,
                            streamProtocol: 'data', // Use Data Stream Protocol v2
                        }),
                        signal: abortSignal,
                    });

                    return {
                        stream: response.body!,
                        rawCall: { rawPrompt: messages, rawSettings: {} },
                    };
                },
            };
        },
    };
}
