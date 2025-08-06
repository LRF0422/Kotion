import { Editor, findParentNode, isNodeActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback } from "react";
import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { InfoPanel } from "../info-panel";
import { copyNode, deleteNode, getCurrentNode } from "../../../utilities";
import { Copy, Trash2 } from "@kn/icon";
import { Node } from "@tiptap/pm/model";
import { Separator } from "@kn/ui";
import { Toggle } from "@kn/ui";


export const InfoPanelBubbleMenu: React.FC<{ editor: Editor }> = ({ editor }) => {


	const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
		({ editor }) => {
			return isNodeActive(editor.state, InfoPanel.name)
		},
		[editor]
	);

	const handleClick = (type: string) => {
		editor.chain().updateAttributes(InfoPanel.name, { type: type }).run()
	}

	const deleteMe = () => {
		deleteNode(editor, InfoPanel.name)
	}

	const copyMe = () => {
		copyNode(editor, InfoPanel.name)
	}

	const renderMenu = () => {
		const types = InfoPanel.options.type;
		const node = getCurrentNode(editor.state);
		return Object.keys(types).map((it, index) => {
			const color = types[it].color;
			const Icon = types[it].icon;
			return <Toggle key={index} size="sm" pressed={node?.attrs?.type === it} onClick={() => handleClick(it)} >
				<Icon className="h-4 w-4" />
			</Toggle>
		})
	}

	const getReferenceClientRect = useCallback(() => {
		const { selection } = editor.state;
		const predicate = (node: Node) => node.type.name === InfoPanel.name;
		const parent = findParentNode(predicate)(selection);

		if (parent) {
			const dom = editor.view.nodeDOM(parent?.pos) as HTMLElement;
			return dom.getBoundingClientRect();
		}

		return posToDOMRect(editor.view, selection.from, selection.to);
	}, [editor]);

	return <BubbleMenu
		forNode
		getReferenceClientRect={getReferenceClientRect}
		editor={editor}
		shouldShow={shouldShow} options={{}}>
		<div className="flex flex-row gap-1 items-center">
			{renderMenu()}
			<Separator orientation="vertical" />
			<Toggle size="sm" pressed={false} onClick={copyMe} >
				<Copy className="h-4 w-4" />
			</Toggle>
			<Separator orientation="vertical" />
			<Toggle size="sm" pressed={false} onClick={deleteMe} >
				<Trash2 className="h-4 w-4 text-red-500" />
			</Toggle>
		</div>
	</BubbleMenu>
}