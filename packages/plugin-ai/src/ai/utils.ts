import { generateText } from "@kn/core";
import { Editor } from "@kn/editor";
import { TextSelection } from "@kn/editor";

export const comp = async (editor: Editor, tips: string) => {
    const selection = editor.state.selection;
    if (selection instanceof TextSelection) {
        let from = editor.state.selection.from
        let text = editor.state.doc.textBetween(selection.from, selection.to)
        editor.commands.deleteSelection()

        const { textStream } = generateText(`${tips}，内容如下：${text}}`)

        for await (const part of textStream) {
            console.log('Answer:', part);
            editor.commands.insertContentAt(from, part)
            from += part.length
        }
    }
}


export const aiGeneration = async (tips: string, onUpdate: (res: string) => void) => {
    let result = ""
    const { textStream } = generateText(`${tips}`)

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
