import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React, { useRef } from "react";
import { Button, Excalidraw, Footer, WelcomeScreen } from "@excalidraw/excalidraw";
import { useFullscreen } from "ahooks";
import { Fullscreen } from "@repo/icon";
import { useTheme } from "@repo/ui";

export const ExcalidrawView: React.FC<NodeViewProps> = (props) => {

    const ref = useRef<any>()
    const [_, { toggleFullscreen }] = useFullscreen(ref)
    const { theme } = useTheme()

    return <NodeViewWrapper contentEditable={false} className="w-full h-[800px] rounded-md shadow-md p-2">
        <div className="h-full w-full" ref={ref}>
            <Excalidraw
                theme={theme === 'light' ? 'light' : 'dark'}
                initialData={{
                    elements: props.node.attrs.elements,
                    appState: { ...props.node.attrs.appState, viewModeEnabled: !props.editor.isEditable, collaborators: new Map() },
                    files: props.node.attrs.files
                }}
                onChange={(elements, appState, files) => {
                    props.updateAttributes({
                        elements: [...elements],
                        appState,
                        files: { ...files }
                    })
                }}
            >
                <WelcomeScreen />
                <Footer>
                    <Button style={{
                        marginLeft: "0.5rem",
                        height: '36px',
                        width: '36px'
                    }} onSelect={toggleFullscreen}><Fullscreen /></Button>
                </Footer>
            </Excalidraw>
        </div>
    </NodeViewWrapper>
}