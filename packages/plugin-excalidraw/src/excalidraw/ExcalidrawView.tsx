import { NodeViewProps } from "@kn/editor";
import { NodeViewWrapper } from "@kn/editor";
import React, { useEffect, useState } from "react";
import { Excalidraw, WelcomeScreen } from "@excalidraw/excalidraw";
import { useTheme } from "@kn/ui";
import "@excalidraw/excalidraw/index.css"

export const ExcalidrawView: React.FC<NodeViewProps> = (props) => {

    const { theme } = useTheme()
    const [shouldRender, setShouldRender] = useState(false)
    
    useEffect(() => {
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            setShouldRender(true)
        }, 500);
    }, [])


    return shouldRender && <NodeViewWrapper className="rounded-md shadow-md" style={{
        height: '800px',
        // with: '100%'
    }}>
        {<Excalidraw
            theme={theme === 'light' ? 'light' : 'dark'}
            isCollaborating={false}
            initialData={{
                elements: props.node.attrs.elements,
                appState: { ...props.node.attrs.appState, viewModeEnabled: !props.editor.isEditable, collaborators: new Map() },
                files: props.node.attrs.files,
                libraryItems: props.node.attrs.libraryItems,
            }}
            onChange={(elements, appState, files) => {
                // console.log('appState', appState);
                
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
        </Excalidraw>}
    </NodeViewWrapper>
}