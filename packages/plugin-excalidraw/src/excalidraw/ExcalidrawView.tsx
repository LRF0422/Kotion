import { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import React from "react";
import { Excalidraw, WelcomeScreen } from "@excalidraw/excalidraw";
import { useTheme } from "@kn/ui";
import "@excalidraw/excalidraw/index.css"

export const ExcalidrawView: React.FC<NodeViewProps> = (props) => {

    const { theme } = useTheme()

    return <NodeViewWrapper className="w-full rounded-md shadow-md p-2 h-[800px]">
        <Excalidraw
            theme={theme === 'light' ? 'light' : 'dark'}
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
            }}
            onLibraryChange={(library) => {
                props.updateAttributes({
                    ...props.node.attrs,
                    libraryItems: [...library]
                })
            }}
        >
            <WelcomeScreen />
        </Excalidraw>
    </NodeViewWrapper>
}