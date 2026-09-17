import { Editor } from "@tiptap/core";
import React from "react";
import { useActive } from "../../../hooks";
import {BulletList} from "@tiptap/extension-list";
import { List } from "@kn/icon";
import { Toggle } from "@kn/ui";
import { convertListType } from "../../../utilities/node";

export const BulletListStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
	const isActive = useActive(editor, BulletList.name);
	const toggleBulletList = () => {
		// Converts a task/ordered list back to bullets instead of silently
		// failing when the item nodes differ (Tiptap's toggleList limitation).
		convertListType(editor, 'bulletList');
	}
	return <Toggle
		pressed={isActive}
		onClick={toggleBulletList}
		size="sm"
	>
		<List className="h-4 w-4" />
	</Toggle>
}