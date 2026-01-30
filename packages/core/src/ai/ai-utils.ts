import { streamText } from "ai"
import { } from "@ai-sdk/react"
import { createDeepSeek } from "@ai-sdk/deepseek"

export const deepseek = createDeepSeek({
    apiKey: process.env.VITE_DEEPSERACH_API_KEY
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
