import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"

/**
 * Create history (undo/redo) tools for AI agent
 */
export const createHistoryTools = (editor: Editor): ToolsRecord => ({
    undo: {
        description: '撤销最近的编辑操作。默认撤销1步，可指定撤销多步',
        inputSchema: z.object({
            steps: z.number().optional().describe("撤销步数，默认1")
        }),
        execute: async ({ steps = 1 }: { steps?: number }) => {
            try {
                if (steps < 1) {
                    return { error: '撤销步数必须大于0' }
                }

                let undone = 0
                for (let i = 0; i < steps; i++) {
                    const success = editor.chain().focus().undo().run()
                    if (!success) {
                        break
                    }
                    undone++
                }

                if (undone === 0) {
                    return { error: '没有可撤销的操作' }
                }

                return {
                    success: true,
                    stepsUndone: undone,
                    stepsRequested: steps,
                    message: `已撤销 ${undone} 步操作${undone < steps ? `（请求 ${steps} 步，但只有 ${undone} 步可撤销）` : ''}`
                }
            } catch (error) {
                return { error: `撤销失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
