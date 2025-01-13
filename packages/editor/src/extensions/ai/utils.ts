import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

const decoder = new TextDecoder('utf-8');

export const comp = async (editor: Editor, tips: string) => {
    let result = ""
    const selection = editor.state.selection;
    if (selection instanceof TextSelection) {
        let from = editor.state.selection.from
        let text = editor.state.doc.textBetween(selection.from, selection.to)
        editor.commands.deleteSelection()
        const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            headers: {
                Authorization: '400719e8d18a04f9f92702e84b2d36bd.Olz5beCB8EV8mrrG',
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
                model: 'glm-4-flash',
                messages: [{
                    role: 'user',
                    content: `${tips}，内容如下：${text}`
                }],
                'top_p': '0.7',
                temperature: 0.95,
                'max_tokens': 1024,
                stream: true,
            })
        })
        const stream = res.body as ReadableStream<Uint8Array>
        const reader = stream.getReader();

        for await (const chunk of readChunks(reader)) {
            const text = decoder.decode(chunk);
            const data = JSON.parse(text.split('data:')[1] as string)
            const content = data.choices[0].delta.content
            if (content) {
                result += content
                editor.commands.toggleLoadingDecoration(from, result)
            }
        }
        editor.commands.insertContentAt(from, result, {
            applyInputRules: false,
            applyPasteRules: false,
            parseOptions: {
                preserveWhitespace: false
            }
        })
        editor.chain().removeLoadingDecoration().run()
    }
}

function readChunks(reader: ReadableStreamDefaultReader) {
    return {
        async *[Symbol.asyncIterator]() {
            let readResult = await reader.read();
            while (!readResult.done) {
                yield readResult.value;
                readResult = await reader.read();
            }
        }
    };
}


export const aiGeneration = async (tips: string, onUpdate: (res: string) => void) => {
    let result = ""
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        headers: {
            Authorization: '400719e8d18a04f9f92702e84b2d36bd.Olz5beCB8EV8mrrG',
            'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({
            model: 'glm-4-alltools',
            messages: [{
                role: 'user',
                content: tips
            }],
            tools: [
                {
                    "type": "web_browser",
                    "web_browser": {
                        "browser": "auto"
                    }
                }
            ],
            'top_p': '0.9',
            temperature: 0.95,
            'max_tokens': 1024,
            stream: true,
        })
    })
    const stream = res.body as ReadableStream<Uint8Array>
    const reader = stream.getReader();

    for await (const chunk of readChunks(reader)) {
        const text = decoder.decode(chunk);
        const data = JSON.parse(text.split('data:')[1] as string)
        const content = data.choices[0].delta.content
        if (content) {
            result += content
            onUpdate(content)
        }
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
