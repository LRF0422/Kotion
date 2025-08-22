import { streamText } from "ai"
import { } from "@ai-sdk/react"
import { createDeepSeek } from "@ai-sdk/deepseek"

const deepseek = createDeepSeek({
    apiKey: "sk-e5dfbf20ed44484eaafe04a0a42d0223"
})


const generateText = (prompt: string) => {
    return streamText({
        model: deepseek("deepseek-chat"),
        prompt: prompt,
    })
}

export { generateText }
