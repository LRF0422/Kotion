import type { Editor } from "@kn/editor"
import { z } from "@kn/ui"
import type { ToolsRecord, UserChoiceOption, OnUserChoiceRequest } from "@kn/common"
import { validateRange } from "@kn/common"

/**
 * Create user interaction tools
 */
export const createUserChoiceTool = (onUserChoiceRequest?: OnUserChoiceRequest): ToolsRecord => ({
    askUserChoice: {
        description: '【必须优先使用】向用户询问选择。在执行任何修改操作前，必须先调用此工具征求用户确认',
        inputSchema: z.object({
            question: z.string().describe("向用户提问的问题"),
            options: z.array(z.object({
                id: z.string().describe("选项的唯一标识"),
                label: z.string().describe("选项的显示文本"),
                description: z.string().optional().describe("选项的详细描述")
            })).describe("可选项列表,至少提供2个选项"),
            allowCustomInput: z.boolean().optional().describe("是否允许用户输入自定义回复")
        }),
        execute: async ({ question, options, allowCustomInput = false }: {
            question: string
            options: UserChoiceOption[]
            allowCustomInput?: boolean
        }) => {
            if (!question || question.trim().length === 0) {
                return { error: 'Question cannot be empty' }
            }

            if (!options || options.length < 2) {
                return { error: 'At least 2 options are required' }
            }

            if (!onUserChoiceRequest) {
                // Never pick an option on the user's behalf: the previous
                // fallback silently returned options[0], which turned "ask
                // where the content should go" into "create a page". There is
                // no choice UI on this surface, so the model has to ask in
                // plain text and end the turn.
                return {
                    error: '当前界面没有可用的交互式选项通道（askUserChoice 无法弹出选择卡）。'
                        + '请直接在回复里向用户提出这个问题，并结束本回合等待回答；'
                        + '不要替用户选择任何选项，也不要改用默认动作继续执行。'
                }
            }

            const requestId = `choice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

            try {
                const selectedOptionId = await onUserChoiceRequest({
                    id: requestId,
                    question,
                    options,
                    allowCustomInput,
                    timestamp: Date.now()
                })

                const selectedOption = options.find(opt => opt.id === selectedOptionId)

                if (selectedOption) {
                    return {
                        success: true,
                        selectedOption: selectedOption.id,
                        selectedLabel: selectedOption.label,
                        selectedDescription: selectedOption.description,
                        isCustomInput: false
                    }
                } else {
                    return {
                        success: true,
                        selectedOption: 'custom',
                        selectedLabel: selectedOptionId,
                        isCustomInput: true
                    }
                }
            } catch (error) {
                return {
                    error: `User choice request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    question
                }
            }
        }
    }
})

/**
 * Create highlighting tools
 */
export const createHighlightTools = (editor: Editor): ToolsRecord => ({
    highlight: {
        description: '高亮标记指定范围的文本',
        inputSchema: z.object({
            from: z.number().describe("起始位置"),
            to: z.number().describe("结束位置"),
        }),
        execute: async ({ from, to }: { from: number; to: number }) => {
            const docSize = editor.state.doc.nodeSize
            const validation = validateRange(from, to, docSize)

            if (!validation.valid) {
                return { error: validation.error }
            }

            const success = editor.chain()
                .focus()
                .setTextSelection({ from, to })
                .setHighlight()
                .scrollIntoView()
                .run()

            if (!success) {
                return { error: `高亮失败，范围: ${from}-${to}` }
            }

            return { success: true, from, to, highlightedRange: to - from }
        }
    }
})

/**
 * Create all misc tools
 */
export const createMiscTools = (
    editor: Editor,
    onUserChoiceRequest?: OnUserChoiceRequest
): ToolsRecord => ({
    ...createUserChoiceTool(onUserChoiceRequest),
    ...createHighlightTools(editor),
})
