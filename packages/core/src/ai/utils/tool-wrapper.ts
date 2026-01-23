import type { OnToolExecution, ToolDefinition } from "../types"

/**
 * Wrap a tool with execution tracking
 */
export const wrapToolWithCallback = (
    toolName: string,
    tool: ToolDefinition,
    onToolExecution?: OnToolExecution
): ToolDefinition => {
    if (!onToolExecution) return tool as ToolDefinition

    return {
        ...tool,
        execute: async (args: any) => {
            const startTime = Date.now()

            onToolExecution({
                toolName,
                args,
                status: 'start',
                timestamp: startTime
            })

            try {
                const result = await tool.execute(args)

                onToolExecution({
                    toolName,
                    args,
                    status: 'success',
                    result,
                    timestamp: startTime,
                    duration: Date.now() - startTime
                })

                return result
            } catch (error) {
                onToolExecution({
                    toolName,
                    args,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: startTime,
                    duration: Date.now() - startTime
                })
                throw error
            }
        }
    }
}

/**
 * Wrap multiple tools with execution tracking
 */
export const wrapToolsWithCallback = (
    tools: Record<string, ToolDefinition>,
    onToolExecution?: OnToolExecution
): Record<string, ToolDefinition> => {
    const wrapped: Record<string, ToolDefinition> = {}

    for (const [name, tool] of Object.entries(tools)) {
        wrapped[name] = wrapToolWithCallback(name, tool, onToolExecution)
    }

    return wrapped
}
