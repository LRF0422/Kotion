import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { useTheme } from "@kn/ui"
import React, { useCallback, useState } from "react"
import { useUniver } from "./useUniver"

export const SpreadsheetView: React.FC<NodeViewProps> = (props) => {
    const { node, updateAttributes, editor } = props
    const { workbookData, height } = node.attrs
    const { theme } = useTheme()
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

    const containerRef = useCallback((el: HTMLDivElement | null) => {
        if (el) {
            setContainerEl(el)
        }
    }, [])

    const handleSave = useCallback(
        (data: Record<string, any>) => {
            updateAttributes({ workbookData: data })
        },
        [updateAttributes],
    )

    useUniver({
        container: containerEl,
        workbookData,
        readOnly: !editor.isEditable,
        darkMode: theme === 'dark',
        onSave: handleSave,
    })

    return (
        <NodeViewWrapper className="relative my-2 rounded-md border shadow-sm">
            <div
                ref={containerRef}
                style={{ height }}
            />
        </NodeViewWrapper>
    )
}
