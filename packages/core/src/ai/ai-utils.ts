import { ToolSet, streamText } from "ai"
import { } from "@ai-sdk/react"
import { createDeepSeek } from "@ai-sdk/deepseek"

export const deepseek = createDeepSeek({
    apiKey: "sk-e5dfbf20ed44484eaafe04a0a42d0223"
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
