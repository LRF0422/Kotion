import { cn, useTheme } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import React, { CSSProperties, useMemo, useCallback, memo } from "react";


export const InfoPanelView: React.FC<NodeViewProps> = memo((props) => {

	const { node, extension, updateAttributes } = props
	const { attrs } = node
	const { theme } = useTheme()

	// Memoize type info to avoid recalculating on every render
	const typeInfo = useMemo(() => {
		return extension.options.type[attrs.type]
	}, [extension.options.type, attrs.type])

	// Memoize background color
	const backgroundColor = useMemo(() => {
		// Only use custom colors if explicitly set
		if (attrs.customBgColorLight || attrs.customBgColorDark) {
			if (theme === "light" && attrs.customBgColorLight) {
				return attrs.customBgColorLight
			}
			if (theme === "dark" && attrs.customBgColorDark) {
				return attrs.customBgColorDark
			}
		}
		// Otherwise use type's default color
		return theme === "light" ? typeInfo.color.light : typeInfo.color.dark
	}, [theme, typeInfo.color, attrs.customBgColorLight, attrs.customBgColorDark])

	// Memoize icon color
	const iconColor = useMemo(() => {
		// Only use custom icon color if explicitly set
		if (attrs.customIconColor) {
			return attrs.customIconColor
		}
		return typeInfo.iconColor
	}, [typeInfo.iconColor, attrs.customIconColor])

	// Memoize icon color style
	const iconStyle = useMemo(() => ({
		color: iconColor
	} as CSSProperties), [iconColor])

	// Memoize border color (slightly darker than background)
	const borderColor = useMemo(() => {
		return theme === "light"
			? `${iconColor}20` // 12% opacity
			: `${iconColor}30` // 18% opacity
	}, [theme, iconColor])

	// Get icon component or emoji
	const IconOrEmoji = useMemo(() => {
		// Use custom emoji if set (regardless of type)
		if (attrs.customEmoji) {
			return () => (
				<span className="text-xl leading-none flex items-center justify-center">
					{attrs.customEmoji}
				</span>
			)
		}
		return typeInfo.icon
	}, [typeInfo.icon, attrs.customEmoji])

	// Optimize input change handler
	const handleTipsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		updateAttributes({ tips: e.target.value })
	}, [updateAttributes])

	return (
		<NodeViewWrapper as='div'>
			<div
				style={{
					backgroundColor,
					borderColor,
					borderWidth: '1px',
					borderStyle: 'solid'
				}}
				className={cn(
					"rounded-lg shadow-sm transition-all duration-200 p-4",
					"hover:shadow-md",
					theme === "light" ? "text-gray-900" : "text-gray-100"
				)}
				role="alert"
				aria-live="polite"
			>
				<div className="flex items-start gap-3">
					{/* Icon/Emoji */}
					<div
						className="flex-shrink-0 mt-0.5"
						style={iconStyle}
					>
						{attrs.customEmoji ? (
							<span className="text-xl leading-none flex items-center justify-center w-5 h-5">
								{attrs.customEmoji}
							</span>
						) : (
							<IconOrEmoji className="h-5 w-5" />
						)}
					</div>

					{/* Content */}
					<div className="flex-1 min-w-0">
						<input
							value={attrs.tips}
							className={cn(
								"text-base font-semibold bg-transparent outline-none leading-tight w-full mb-1",
								"placeholder:text-gray-400",
								"focus:outline-none focus:ring-0"
							)}
							style={{ color: iconColor }}
							onChange={handleTipsChange}
							aria-label="Info panel title"
							placeholder="Enter title..."
						/>
						<div className="text-sm leading-relaxed">
							<NodeViewContent className="w-full prose-p:my-1 prose-p:leading-relaxed" />
						</div>
					</div>
				</div>
			</div>
		</NodeViewWrapper>
	)
})
