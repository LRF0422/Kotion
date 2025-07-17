import React from "react";
import { Editor } from "@tiptap/core";
import { Toggle } from "@kn/ui";
import { CircleAlert } from "@kn/icon";


export const InfoPanelStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

	const isActive = editor.isActive("infoPanel")
	const handleClick = () => {
		editor.chain().focus().insertInfoPanel({ type: 'info' }).run()
	}

	return <Toggle pressed={isActive} size="sm" onClick={handleClick} >
		<CircleAlert className="h-4 w-4" />
	</Toggle>
}