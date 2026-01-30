import { Editor, findParentNode, isNodeActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useMemo, memo } from "react";
import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { InfoPanel } from "../info-panel";
import { copyNode, deleteNodeInner } from "../../../utilities";
import { Copy, Trash2, Smile } from "@kn/icon";
import { Node } from "@tiptap/pm/model";
import { Separator, Popover, PopoverContent, PopoverTrigger, EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter, useTheme } from "@kn/ui";
import { Toggle } from "@kn/ui";
import { getCurrentNode } from "@editor/utilities/node";
import { PRESET_COLORS, INFO_PANEL_TYPES } from "../constants";


export const InfoPanelBubbleMenu: React.FC<{ editor: Editor }> = memo(({ editor }) => {

	const types = INFO_PANEL_TYPES;
	const node = getCurrentNode(editor.state);
	const { theme } = useTheme();

	const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(
		({ editor }) => {
			return isNodeActive(editor.state, InfoPanel.name)
		},
		[]
	);

	const handleTypeClick = useCallback((type: string) => {
		const typeInfo = types[type as keyof typeof types];
		editor.chain().updateAttributes(InfoPanel.name, { 
			type: type,
			customEmoji: null,
			customBgColorLight: null,
			customBgColorDark: null,
			customIconColor: null
		}).run()
	}, [editor, types])

	const handlePresetColorClick = useCallback((preset: typeof PRESET_COLORS[0]) => {
		editor.chain().updateAttributes(InfoPanel.name, {
			type: 'default',
			customBgColorLight: preset.light,
			customBgColorDark: preset.dark,
			customEmoji: null,
			customIconColor: null
		}).run()
	}, [editor])

	const deleteMe = useCallback(() => {
		deleteNodeInner(editor, InfoPanel.name)
	}, [editor])

	const copyMe = useCallback(() => {
		copyNode(editor, InfoPanel.name)
	}, [editor])

	const handleEmojiSelect = useCallback((emoji: any) => {
		editor.chain().updateAttributes(InfoPanel.name, {
			customEmoji: emoji.emoji
		}).run()
	}, [editor])

	// Render type buttons (only types with icons)
	const typeButtons = useMemo(() => {
		return Object.entries(types)
			.filter(([key, config]) => config.icon !== null)
			.map(([key, config]) => {
				const Icon = config.icon!;
				const isPressed = node?.attrs?.type === key;

				return (
					<Toggle
						key={key}
						size="sm"
						pressed={isPressed}
						onClick={() => handleTypeClick(key)}
						aria-label={`Set to ${config.label}`}
						title={config.label}
					>
						<Icon className="h-4 w-4" style={{ color: config.iconColor }} />
					</Toggle>
				)
			})
	}, [types, node?.attrs?.type, handleTypeClick]);

	// Render preset color buttons
	const presetColorButtons = useMemo(() => {
		return PRESET_COLORS.map((preset) => (
			<button
				key={preset.name}
				className="w-6 h-6 rounded border border-gray-200 dark:border-gray-600 hover:scale-110 transition-transform"
				style={{ backgroundColor: theme === 'dark' ? preset.dark : preset.light }}
				onClick={() => handlePresetColorClick(preset)}
				title={preset.name}
			/>
		))
	}, [handlePresetColorClick, theme]);

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
				{/* Type buttons with icons */}
				{typeButtons}
				
				<Separator orientation="vertical" className="h-6" />

				{/* Preset Colors */}
				<Popover>
					<PopoverTrigger asChild>
						<Toggle
							size="sm"
							pressed={node?.attrs?.type === 'default' && !node?.attrs?.customEmoji}
							aria-label="Choose background color"
							title="Background Color"
						>
							<div className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600" 
								style={{ 
									background: 'linear-gradient(135deg, #f5f5f5 25%, #eff6ff 25%, #eff6ff 50%, #f0fdf4 50%, #f0fdf4 75%, #faf5ff 75%)' 
								}} 
							/>
						</Toggle>
					</PopoverTrigger>
					<PopoverContent className="w-fit p-3" align="start">
						<div className="space-y-2">
							<p className="text-xs text-muted-foreground">Background Color</p>
							<div className="flex gap-1 flex-wrap max-w-[180px]">
								{presetColorButtons}
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
							aria-label="Add emoji"
							title="Add Emoji"
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
				<Toggle size="sm" pressed={false} onClick={copyMe} aria-label="Copy" title="Copy">
					<Copy className="h-4 w-4" />
				</Toggle>
				<Separator orientation="vertical" className="h-6" />
				<Toggle size="sm" pressed={false} onClick={deleteMe} aria-label="Delete" title="Delete">
					<Trash2 className="h-4 w-4 text-red-500" />
				</Toggle>
			</div>
		</BubbleMenu>
	)
})