import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord } from "@kn/common"

// Document snapshots keyed per editor instance — released with the editor.
const checkpointStore = new WeakMap<Editor, Map<string, { doc: any; createdAt: number; label?: string }>>()

const getCheckpoints = (editor: Editor) => {
    let map = checkpointStore.get(editor)
    if (!map) {
        map = new Map()
        checkpointStore.set(editor, map)
    }
    return map
}

/**
 * Create history (undo/redo/checkpoint) tools for AI agent
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
    },

    createCheckpoint: {
        description: '创建当前文档的检查点快照。在执行大规模修改前调用，之后可用 rollbackToCheckpoint 一键恢复到此状态',
        inputSchema: z.object({
            label: z.string().optional().describe("检查点说明，例如 '重构第二章前'")
        }),
        execute: async ({ label }: { label?: string }) => {
            try {
                const checkpoints = getCheckpoints(editor)
                const id = `cp-${Date.now().toString(36)}-${checkpoints.size + 1}`
                checkpoints.set(id, {
                    doc: editor.getJSON(),
                    createdAt: Date.now(),
                    label
                })

                return {
                    success: true,
                    checkpointId: id,
                    label,
                    docSize: editor.state.doc.content.size,
                    message: `已创建检查点 ${id}${label ? `（${label}）` : ''}，可用 rollbackToCheckpoint 恢复`
                }
            } catch (error) {
                return { error: `创建检查点失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    },

    rollbackToCheckpoint: {
        description: '将文档整体恢复到指定检查点的状态（比多次 undo 更可靠）。恢复本身也可被 undo 撤销',
        inputSchema: z.object({
            checkpointId: z.string().describe("createCheckpoint 返回的检查点 id")
        }),
        execute: async ({ checkpointId }: { checkpointId: string }) => {
            try {
                const checkpoints = getCheckpoints(editor)
                const checkpoint = checkpoints.get(checkpointId)

                if (!checkpoint) {
                    const available = Array.from(checkpoints.keys())
                    return {
                        error: `未找到检查点 "${checkpointId}"`,
                        availableCheckpoints: available
                    }
                }

                const success = editor.commands.setContent(checkpoint.doc, { emitUpdate: true })
                if (!success) {
                    return { error: '恢复检查点失败' }
                }

                return {
                    success: true,
                    checkpointId,
                    label: checkpoint.label,
                    message: `已恢复到检查点 ${checkpointId}${checkpoint.label ? `（${checkpoint.label}）` : ''}`
                }
            } catch (error) {
                return { error: `恢复检查点失败: ${error instanceof Error ? error.message : '未知错误'}` }
            }
        }
    }
})
