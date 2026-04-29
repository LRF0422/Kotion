import { z } from "zod"
import type { OnToolExecution, ToolDefinition } from "../types"

/**
 * Resolve input schema: convert Zod schema to JSON Schema if needed.
 * Uses Zod v4's built-in z.toJSONSchema() for reliable conversion.
 *
 * Exported so the CapabilityCatalog collector can serialize tool parameters
 * using the same strategy as the OpenAI-format conversion.
 */
export function resolveInputSchema(schema: any): any {
    if (!schema) return { type: 'object', properties: {} }

    // Detect Zod schema: Zod v4 uses _zod, Zod v3 uses _def.typeName
    const isZodSchema = schema._zod || (schema._def && typeof schema._def === 'object')

    if (isZodSchema && typeof z.toJSONSchema === 'function') {
        try {
            const jsonSchema = z.toJSONSchema(schema)
            // Strip $schema key — not needed for OpenAI function-calling format
            const { $schema, ...rest } = jsonSchema as Record<string, any>
            return rest
        } catch {
            // If conversion fails, return a safe default
            return schema
        }
    }

    // Already a plain JSON Schema object
    return schema
}

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
