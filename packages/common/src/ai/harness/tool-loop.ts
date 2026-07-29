/**
 * Agent Harness — tool-loop helpers
 *
 * Shared helpers for the server-driven runtime. Only the pieces the V2
 * runtime still needs survive here — the V1 frontend loop (SSE inactivity
 * guard, streaming tool-call accumulation, local dispatch) was removed with
 * the V1 chat path.
 */

/**
 * Parse tool-call argument JSON, recovering from malformed output the LLM
 * sometimes emits by extracting the first balanced-looking JSON object.
 */
export function parseToolArgs(argsStr: string, toolName: string): Record<string, unknown> {
    const raw = argsStr || '{}'
    try {
        return JSON.parse(raw)
    } catch {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
            try {
                console.warn(`[Harness] Recovered malformed tool arguments for ${toolName}`, raw)
                return JSON.parse(match[0])
            } catch {
                return {}
            }
        }
        console.warn(`[Harness] Unparseable tool arguments for ${toolName}`, raw)
        return {}
    }
}
