import { Editor } from "@tiptap/core";
import React from "react";
import { useActive } from "../../../hooks";
import BulletList from "@tiptap/extension-bullet-list";
import { List } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const BulletListStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
	const isActive = useActive(editor, BulletList.name);
	const toggleBulletList = () => {
		editor.chain().focus().toggleBulletList().run();
	}
	return <Toggle
		pressed={isActive}
		onClick={toggleBulletList}
		size="sm"
	>
		<List className="h-4 w-4" />
	</Toggle>
}