import { Editor, findParentNode, isNodeActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useMemo, memo } from "react";
import { BubbleMenu, BubbleMenuProps } from "../../../components";
import { InfoPanel } from "../info-panel";
import { copyNode, deleteNodeInner } from "../../../utilities";
import { Copy, Trash2, Smile, Palette, Square } from "@kn/icon";
import { Node } from "@tiptap/pm/model";
import { Separator, Popover, PopoverContent, PopoverTrigger, EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter, useTheme, cn } from "@kn/ui";
import { Toggle } from "@kn/ui";
import { getCurrentNode } from "@editor/utilities/node";
import { PRESET_COLORS, INFO_PANEL_TYPES, InfoPanelType } from "../constants";


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
		editor.chain().updateAttributes(InfoPanel.name, {
			type: type,
			customEmoji: null,
			customBgColorLight: null,
			customBgColorDark: null,
			customIconColor: null
		}).run()
	}, [editor])

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

	// Check which preset color is active (if any)
	const activePresetIndex = useMemo(() => {
		const currentLight = node?.attrs?.customBgColorLight;
		if (!currentLight) return -1;
		return PRESET_COLORS.findIndex(p => p.light === currentLight);
	}, [node?.attrs?.customBgColorLight]);

	// Render type buttons (including default with Square icon)
	const typeButtons = useMemo(() => {
		return (Object.entries(types) as [InfoPanelType, typeof types[InfoPanelType]][])
			.map(([key, config]) => {
				const Icon = config.icon || Square;
				const isPressed = node?.attrs?.type === key && !node?.attrs?.customEmoji
					&& !node?.attrs?.customBgColorLight && !node?.attrs?.customBgColorDark;

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
	}, [types, node?.attrs?.type, node?.attrs?.customEmoji, node?.attrs?.customBgColorLight, node?.attrs?.customBgColorDark, handleTypeClick]);

	// Render preset color buttons with active state
	const presetColorButtons = useMemo(() => {
		return PRESET_COLORS.map((preset, index) => {
			const isActive = index === activePresetIndex;
			return (
				<button
					key={preset.name}
					className={cn(
						"w-6 h-6 rounded border transition-transform hover:scale-110",
						isActive
							? "ring-2 ring-blue-500 ring-offset-1 border-blue-400"
							: "border-gray-200 dark:border-gray-600"
					)}
					style={{ backgroundColor: theme === 'dark' ? preset.dark : preset.light }}
					onClick={() => handlePresetColorClick(preset)}
					title={preset.name}
				/>
			)
		})
	}, [handlePresetColorClick, theme, activePresetIndex]);

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
				{/* Section 1: Type icons (including default) */}
				{typeButtons}

				<Separator orientation="vertical" className="h-6" />

				{/* Section 2: Background colors */}
				<Popover>
					<PopoverTrigger asChild>
						<Toggle
							size="sm"
							pressed={activePresetIndex >= 0}
							aria-label="Choose background color"
							title="Background Color"
						>
							<Palette className="h-4 w-4" />
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

				{/* Section 3: Custom Emoji Selector */}
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

				{/* Section 4: Copy / Delete */}
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
