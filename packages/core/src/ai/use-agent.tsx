import { AppContext } from "@kn/common"
import { Editor, TextSelection } from "@kn/editor"
import { z } from "@kn/ui"
import { DefaultChatTransport, ToolSet, ToolLoopAgent } from "ai"
import { useContext, useMemo } from "react"
import { deepseek, generateText } from "./ai-utils"
import { text } from "stream/consumers"
import { useChat } from "@ai-sdk/react"



export const useEditorAgent = (editor: Editor) => {

    const baseTools = [
        {
            description: '查看所给范围的内容',
            inputSchema: z.object({
                range: z.object({
                    from: z.number(),
                    to: z.number()
                })
            }),
            execute: async (range: { from: number, to: number }) => {
                const result: any[] = []
                editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
                    console.log(node)
                    result.push({
                        from: pos,
                        to: pos + node.nodeSize,
                        content: node.content.toJSON(),
                        text: node.textContent,
                    })
                })
                return result
            }
        },
        {
            description: '高亮标记',
            inputSchema: z.object({
                from: z.number(),
                to: z.number(),
            }),
            execute: async (range: { from: number, to: number }) => {
                editor.chain().setTextSelection(range).setHighlight().run()
            }
        },
        {
            description: '查找文字位置',
            inputSchema: z.object({
                from: z.number(),
                text: z.string(),
                target: z.string()
            }),
            inputExamples: [
                { from: 0, text: "hello world", target: "world" }
            ],
            execute: async (params: { from: number, text: string, target: string }) => {
                console.log('params', params);
                const { from, text, target } = params
                return {
                    from: from + text.indexOf(target),
                    to: from + text.indexOf(target) + target.length
                }
            }
        }, {
            description: '插入内容',
            inputSchema: z.object({
                text: z.string(),
                pos: z.number()
            }),
            execute: async (params: { text: string, pos: number }) => {
                const { text, pos } = params
                editor.commands.insertContentAt(pos, text)
            }

        }
    ]

    const { pluginManager } = useContext(AppContext)
    const tools = useMemo(() => pluginManager?.resloveTools(), [pluginManager?.plugins])
    const agent = new ToolLoopAgent({
        model: deepseek("deepseek-chat"),
        instructions: "You are a helpful assistant.",
        tools: {
            write: {
                description: '插入内容',
                inputSchema: z.object({
                    text: z.string(),
                    pos: z.number()
                }),
                execute: async (params: { text: string, pos: number }) => {
                    const { text, pos } = params
                    editor.commands.insertContentAt(pos, text)
                }

            }
        }
    })

    return {
        generateText: async (prompt: string) => {
            const selection = editor.state.selection;
            let result = ""
            const context: any = {
                from: 0,
                to: editor.state.doc.nodeSize,
                contentInfo: []
            }
            editor.state.doc.descendants((node, pos) => {
                context.contentInfo.push({
                    from: pos,
                    to: pos + node.nodeSize,
                    content: node.content.toJSON(),
                    text: node.textContent,
                })
            })
            if (selection instanceof TextSelection) {
                let from = editor.state.selection.from
                const { textStream } = await agent.stream({
                    prompt: prompt + "，文章的内容为：" + JSON.stringify(context)
                })
                editor.commands.deleteSelection()
                // @ts-ignore
                editor.commands.toggleLoadingDecoration(from, "")
                for await (const part of textStream) {
                    result += part
                    // @ts-ignore 这里的插件会在调用端安装
                    editor.chain().focus().toggleLoadingDecoration(from, result).run()
                }

                editor.chain().focus()
                    .insertContentAt(from, result, {
                        applyInputRules: false,
                        applyPasteRules: false,
                        parseOptions: {
                            preserveWhitespace: false
                        }
                    }).run();
                // @ts-ignore
                editor.chain().removeLoadingDecoration().run()
            }
        }
    }


}