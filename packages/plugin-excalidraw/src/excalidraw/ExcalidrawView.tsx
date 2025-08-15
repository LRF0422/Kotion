import { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import React, { useEffect, useState } from "react";
import { Excalidraw, WelcomeScreen } from "@excalidraw/excalidraw";
import { useTheme } from "@kn/ui";
import "@excalidraw/excalidraw/index.css"
import { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { event } from "@kn/common";
import { set } from "lodash";

export const ExcalidrawView: React.FC<NodeViewProps> = (props) => {

    const { theme } = useTheme()
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    // const [data, setData] = useState<any>()

    // useEffect(() => {
    //     event.on('excalidraw-update', (value: any) => {
    //         setData(value)
    //     })
    // },[])

    return <NodeViewWrapper className="rounded-md shadow-md p-2 h-[800px]">
        <Excalidraw
            theme={theme === 'light' ? 'light' : 'dark'}
            excalidrawAPI={(api)=> setExcalidrawAPI(api)}
            isCollaborating={false}
            initialData={{
                elements: props.node.attrs.elements,
                appState: { ...props.node.attrs.appState, viewModeEnabled: !props.editor.isEditable, collaborators: new Map() },
                files: props.node.attrs.files,
                libraryItems: props.node.attrs.libraryItems,
            }}
            onChange={(elements, appState, files) => {
                props.updateAttributes({
                    elements: [...elements],
                    appState,
                    files: { ...files }
                })
            //   setTimeout(() => {
            //       setData(() => ({ elements, appState, files }))
                //   }, 0);
                // event.emit('excalidraw-update', { elements, appState, files })
            }}
            onLibraryChange={(library) => {
                // props.updateAttributes({
                //     ...props.node.attrs,
                //     libraryItems: [...library]
                // })
            }}
        >
            <WelcomeScreen />
        </Excalidraw>
    </NodeViewWrapper>
}