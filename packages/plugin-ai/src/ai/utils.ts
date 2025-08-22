import { generateText } from "@kn/core";
import { Editor } from "@kn/editor";
import { TextSelection } from "@kn/editor";

export const aiText = async (editor: Editor, tips: string) => {
    const selection = editor.state.selection;
    let result = ""
    if (selection instanceof TextSelection) {
        let from = editor.state.selection.from
        let text = editor.state.doc.textBetween(selection.from, selection.to)
        editor.commands.deleteSelection()
        const { textStream } = generateText(`${tips}，内容如下：${text}}，请不要说多余的话`)
        for await (const part of textStream) {
            result += part
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
        editor.chain().removeLoadingDecoration().run()
    }
}

export const aiGeneration = async (tips: string, onUpdate: (res: string) => void) => {
    let result = ""
    const { textStream } = generateText(`${tips}，请不要说多余的话`)
    for await (const part of textStream) {
        console.log('Answer:', part);
        result += part
        onUpdate(part)
    }
    return result
}

export const aiImageWriter = async (prompt: string) => {
    const res = await fetch("https://open.bigmodel.cn/api/paas/v4/images/generations", {
        headers: {
            Authorization: '400719e8d18a04f9f92702e84b2d36bd.Olz5beCB8EV8mrrG',
            'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
            model: "cogview-3-plus",
            prompt: prompt
        })
    })

    return res.json()
}
