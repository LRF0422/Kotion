import { AppContext } from "@kn/common"
import { Editor, TextSelection } from "@kn/editor"
import { z } from "@kn/ui"
import { ToolLoopAgent } from "ai"
import { useContext, useMemo } from "react"
import { deepseek } from "./ai-utils"



export const useEditorAgent = (editor: Editor) => {

    const { pluginManager } = useContext(AppContext)
    const tools = useMemo(() => pluginManager?.resloveTools(), [pluginManager?.plugins])
    let posOffset: any[] = []
    const agent = new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        instructions: "你是一个助手，你需要根据用户输入的指令，完成用户所请求的任务。执行任务前，应该调用readRange方法，查看全文，然后根据用户所请求的任务，调用其他方法。",
        tools: {
            readRange: {
                description: '查看所给位置到文档结束处的内容',
                inputSchema: z.object({
                    range: z.object({
                        from: z.number()
                    })
                }),
                execute: async (range: { from: number }) => {
                    console.log('params', editor.$pos(range.from));
                    const result: any[] = []
                    editor.state.doc.nodesBetween(range.from, editor.state.doc.nodeSize, (node, pos) => {
                        const textPos = []
                        if (node.textContent) {
                            for (let i = 0; i < node.textContent.length; i++) {
                                textPos.push(
                                    node.textContent[i] + ":" + (pos + i + 1))
                            }
                        }
                        result.push({
                            from: pos,
                            to: pos + node.nodeSize,
                            position: pos,
                            type: node.type.name,
                            attrs: node.attrs,
                            // content: node.content.toJSON(),
                            // text: node.textContent,
                            textPos: textPos
                        })
                    })
                    return result
                }
            },
            readDocument: {
                description: '阅读全文',
                inputSchema: z.object({}),
                execute: async () => {
                    const result: any[] = []
                    editor.state.doc.descendants((node, pos) => {
                        const textPos = []
                        if (node.textContent) {
                            for (let i = 0; i < node.textContent.length; i++) {
                                textPos.push(
                                    node.textContent[i] + ":" + (pos + i + 1))
                            }
                        }
                        result.push({
                            from: pos,
                            to: pos + node.nodeSize,
                            position: pos,
                            type: node.type.name,
                            attrs: node.attrs,
                            // content: node.content.toJSON(),
                            // text: node.textContent,
                            textPos: textPos
                        })
                    })
                    console.log('result', result);
                    return result
                }
            },
            write: {
                description: '插入内容',
                inputSchema: z.object({
                    text: z.string(),
                    pos: z.number()
                }),
                execute: async (params: { text: string, pos: number }) => {
                    const { text, pos } = params
                    const offset = posOffset.filter(it => it.current < pos).reduce((pre, nex) => {
                        return pre.length + nex.length
                    }, 0)
                    console.log('posOffset', posOffset);
                    editor.commands.insertContentAt(offset === 0 ? pos : offset, text)
                    posOffset.push({
                        current: pos,
                        direct: 'right',
                        length: text.length
                    })
                }
            },
            replace: {
                description: '替换内容',
                inputSchema: z.object({
                    text: z.string(),
                    from: z.number(),
                    to: z.number(),
                }),
                execute: async (params: { text: string, from: number, to: number }) => {
                    const { text, from, to } = params
                    editor.chain().deleteRange({ from, to }).insertContentAt(from, text).run()
                    const length = to - from
                    if (text.length > length) {
                        posOffset.push({
                            current: from,
                            direct: 'right',
                            length: text.length - length
                        })
                    } else {
                        posOffset.push({
                            current: from,
                            direct: 'left',
                            length: -length - text.length
                        })
                    }
                }
            },
            deleteRange: {
                description: '删除内容',
                inputSchema: z.object({
                    range: z.object({
                        from: z.number(),
                        to: z.number(),
                    })
                }),
                execute: async (range: { from: number, to: number }) => {
                    editor.commands.deleteRange(range)
                    posOffset.push({
                        current: range.from,
                        direct: 'left',
                        length: -(range.to - range.from)
                    })
                }

            },
            highlight: {
                description: '高亮标记',
                inputSchema: z.object({
                    from: z.number(),
                    to: z.number(),
                }),
                execute: async (range: { from: number, to: number }) => {
                    editor.chain().setTextSelection(range).setHighlight().run()
                }
            }
        },
        onFinish: () => {
            posOffset = []
        },
    })

    return agent


}