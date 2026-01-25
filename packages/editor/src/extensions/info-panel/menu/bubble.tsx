import { Editor, findParentNode, isNodeActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useMemo, memo } from "react";
import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { InfoPanel } from "../info-panel";
import { copyNode, deleteNodeInner } from "../../../utilities";
import { Copy, Trash2, Palette, Smile } from "@kn/icon";
import { Node } from "@tiptap/pm/model";
import { Separator, ColorPicker, Popover, PopoverContent, PopoverTrigger, Label, EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter } from "@kn/ui";
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

	const handleIconColorChange = useCallback((color: string) => {
		editor.chain().updateAttributes(InfoPanel.name, {
			customIconColor: color
		}).run()
	}, [editor])

	const handleBgColorLightChange = useCallback((color: string) => {
		editor.chain().updateAttributes(InfoPanel.name, {
			customBgColorLight: color
		}).run()
	}, [editor])

	const handleBgColorDarkChange = useCallback((color: string) => {
		editor.chain().updateAttributes(InfoPanel.name, {
			customBgColorDark: color
		}).run()
	}, [editor])

	const handleEmojiSelect = useCallback((emoji: any) => {
		// Only update emoji, don't change type or colors
		editor.chain().updateAttributes(InfoPanel.name, {
			customEmoji: emoji.emoji
		}).run()
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

				{/* Custom Color Picker */}
				<Popover>
					<PopoverTrigger asChild>
						<Toggle
							size="sm"
							pressed={!!(node?.attrs?.customIconColor || node?.attrs?.customBgColorLight || node?.attrs?.customBgColorDark)}
							aria-label="Customize colors"
						>
							<Palette className="h-4 w-4" />
						</Toggle>
					</PopoverTrigger>
					<PopoverContent className="w-80" align="start">
						<div className="space-y-4">
							<div className="space-y-2">
								<h4 className="font-medium text-sm">Custom Colors</h4>
								<p className="text-xs text-muted-foreground">
									Customize icon and background colors
								</p>
							</div>

							<div className="space-y-3">
								<div className="space-y-1.5">
									<Label className="text-xs">Icon Color</Label>
									<ColorPicker
										simple
										background={node?.attrs?.customIconColor || "#6b7280"}
										setBackground={handleIconColorChange}
									/>
								</div>

								<div className="space-y-1.5">
									<Label className="text-xs">Background (Light)</Label>
									<ColorPicker
										simple
										background={node?.attrs?.customBgColorLight || "#f3f4f6"}
										setBackground={handleBgColorLightChange}
									/>
								</div>

								<div className="space-y-1.5">
									<Label className="text-xs">Background (Dark)</Label>
									<ColorPicker
										simple
										background={node?.attrs?.customBgColorDark || "#374151"}
										setBackground={handleBgColorDarkChange}
									/>
								</div>
							</div>
						</div>
					</PopoverContent>
				</Popover>

				{/* Custom Emoji Selector */}
				<Popover>
					<PopoverTrigger asChild>
						<Toggle
							size="sm"
							pressed={!!node?.attrs?.customEmoji}
							aria-label="Customize emoji"
						>
							{node?.attrs?.customEmoji ? (
								<span className="text-base">{node.attrs.customEmoji}</span>
							) : (
								<Smile className="h-4 w-4" />
							)}
						</Toggle>
					</PopoverTrigger>
					<PopoverContent className="w-fit p-0" align="start">
						<EmojiPicker
							className="w-[320px] h-[400px]"
							onEmojiSelect={handleEmojiSelect}
						>
							<EmojiPickerSearch placeholder="Search emoji..." />
							<EmojiPickerContent />
							<EmojiPickerFooter />
						</EmojiPicker>
					</PopoverContent>
				</Popover>

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