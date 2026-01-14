import React, { useCallback, memo } from "react";
import { Editor } from "@tiptap/core";
import { Toggle } from "@kn/ui";
import { CircleAlert } from "@kn/icon";


export const InfoPanelStaticMenu: React.FC<{ editor: Editor }> = memo(({ editor }) => {

	const isActive = editor.isActive("infoPanel")

	const handleClick = useCallback(() => {
		editor.chain().focus().insertInfoPanel({ type: 'info' }).run()
	}, [editor])

	return (
		<Toggle
			pressed={isActive}
			size="sm"
			onClick={handleClick}
			aria-label="Insert info panel"
			title="Info Panel"
		>
			<CircleAlert className="h-4 w-4" />
		</Toggle>
	)
})