import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import React, { useEffect, useRef, useState } from "react"
import mermaid from 'mermaid'
import { useAsyncEffect, useDebounce } from "@kn/core"
import { EmptyState, IconButton, useTheme } from "@kn/ui"
import Editor, { Monaco } from '@monaco-editor/react';
import { AiOutlineQuestionCircle, BoxIcon } from "@kn/icon"
import { unescape } from "lodash"

function utf8ToBase64(str: string) {
    const bytes = new TextEncoder().encode(str);
    const bin = String.fromCharCode(...bytes);
    return btoa(bin);
}
export const MermaidView: React.FC<NodeViewProps> = (props) => {

    const [error, setError] = useState<any>()
    const [code, setCode] = useState<string | undefined>(props.node.attrs.data || "")
    const value = useDebounce(code, { wait: 500 })
    const editorRef = useRef<Monaco>();
    const { theme } = useTheme()
    const [needFresh, setNeedFresh] = useState(0)
    const container = useRef<HTMLDivElement>(null)

    useEffect(() => {
        mermaid.initialize({ startOnLoad: true, theme: theme === "dark" ? "dark" : "default", suppressErrorRendering: true })
        mermaid.parseError = (err) => {
            console.log('error', err)
            setError(err)
        }
        setNeedFresh(needFresh + 1)
    }, [theme])

    useAsyncEffect(async () => {
        props.updateAttributes({
            ...props.node.attrs,
            data: value
        })
        if (value && value.trim() && container.current) {
            if (await mermaid.parse(value)) {
                const res = await mermaid.render("preview111", value)
                // setSvg(btoa(utf8ToBase64(res.svg)))
                container.current.innerHTML = ""
                container.current.innerHTML = res.svg
                container.current.firstElementChild?.setAttribute("style", `width: ${props.editor.isEditable ? '300px' : '500px'}`)
            }
        }
    }, [value, theme, needFresh])

    return <NodeViewWrapper className="h-auto">
        <div className="flex gap-1 p-1">
            {props.editor.isEditable && <Editor
                defaultValue={code}
                width="400px"
                theme={theme === "dark" ? "vs-dark" : "light"}
                // height="300px"
                className="rounded-sm min-h-[300px]"
                options={{
                    minimap: { enabled: false }
                }}
                onMount={(editor, monaco) => {
                    editorRef.current = monaco
                }}
                onChange={(value) => {
                    console.log('changed');
                    setCode(value)
                }}
            />}
            <div className="flex-1 flex border rounded-sm items-center justify-center p-1 relative">
                {
                    code ? <>
                        {/* {svg && <img src={`data:image/svg+xml;base64,${svg}`} width={props.editor.isEditable ? 300 : 500} />} */}
                        {
                            error ? <div className="text-red-500">{unescape(error.message)}</div> : <div ref={container} ></div>
                        }
                        <IconButton icon={<AiOutlineQuestionCircle className="h-5 w-5" />} className=" absolute bottom-1 right-1" />
                    </> : <EmptyState
                        className="h-full w-full hover:bg-background border-none max-w-none"
                        title="Mermaid"
                        description="No code provided"
                        icons={[BoxIcon]}
                        action={{
                            label: "How to create mermaid ? ",
                            onClick: () => {
                                window.open("https://mermaid.js.org/intro/", "_blank")
                            }
                        }}
                    />
                }
            </div>
        </div>
    </NodeViewWrapper>
}