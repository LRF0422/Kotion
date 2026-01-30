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
