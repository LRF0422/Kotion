import React, { useCallback, memo } from "react";
import { Editor } from "@tiptap/core";
import { Toggle } from "@kn/ui";
import { Square } from "@kn/icon";


export const InfoPanelStaticMenu: React.FC<{ editor: Editor }> = memo(({ editor }) => {

	const isActive = editor.isActive("infoPanel")

	const handleClick = useCallback(() => {
		editor.chain().focus().insertInfoPanel({ type: 'default' }).run()
	}, [editor])

	return (
		<Toggle
			pressed={isActive}
			size="sm"
			onClick={handleClick}
			aria-label="Insert callout"
			title="Callout"
		>
			<Square className="h-4 w-4" />
		</Toggle>
	)
})