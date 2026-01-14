import { Editor, findParentNode, isNodeActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useMemo, memo } from "react";
import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { InfoPanel } from "../info-panel";
import { copyNode, deleteNodeInner } from "../../../utilities";
import { Copy, Trash2 } from "@kn/icon";
import { Node } from "@tiptap/pm/model";
import { Separator } from "@kn/ui";
import { Toggle } from "@kn/ui";
import { getCurrentNode } from "@editor/utilities/node";


export const InfoPanelBubbleMenu: React.FC<{ editor: Editor }> = memo(({ editor }) => {

	const types = InfoPanel.options.type;
	const node = getCurrentNode(editor.state);

	const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
		({ editor }) => {
			return isNodeActive(editor.state, InfoPanel.name)
		},
		[]
	);

	const handleClick = useCallback((type: string) => {
		editor.chain().updateAttributes(InfoPanel.name, { type: type }).run()
	}, [editor])

	const deleteMe = useCallback(() => {
		deleteNodeInner(editor, InfoPanel.name)
	}, [editor])

	const copyMe = useCallback(() => {
		copyNode(editor, InfoPanel.name)
	}, [editor])

	// Memoize type buttons rendering
	const typeButtons = useMemo(() => {
		return Object.keys(types).map((it, index) => {
			const color = types[it].iconColor;
			const Icon = types[it].icon;
			const isPressed = node?.attrs?.type === it;

			return (
				<Toggle
					key={it}
					size="sm"
					pressed={isPressed}
					onClick={() => handleClick(it)}
					aria-label={`Set info panel type to ${it}`}
				>
					<Icon className="h-4 w-4" style={{ color: color }} />
				</Toggle>
			)
		})
	}, [types, node?.attrs?.type, handleClick]);

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

	return (
		<BubbleMenu
			forNode
			getReferenceClientRect={getReferenceClientRect}
			editor={editor}
			shouldShow={shouldShow}
			options={{}}
		>
			<div className="flex flex-row gap-1 items-center h-8">
				{typeButtons}
				<Separator orientation="vertical" className="h-6" />
				<Toggle size="sm" pressed={false} onClick={copyMe} aria-label="Copy info panel">
					<Copy className="h-4 w-4" />
				</Toggle>
				<Separator orientation="vertical" className="h-6" />
				<Toggle size="sm" pressed={false} onClick={deleteMe} aria-label="Delete info panel">
					<Trash2 className="h-4 w-4 text-red-500" />
				</Toggle>
			</div>
		</BubbleMenu>
	)
})