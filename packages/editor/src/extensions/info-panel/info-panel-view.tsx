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
		return extension.options.type[attrs.type] || extension.options.type['default']
	}, [extension.options.type, attrs.type])

	// Check if should show icon (has type icon or custom emoji)
	const hasIcon = useMemo(() => {
		return attrs.customEmoji || (typeInfo.icon && attrs.type !== 'default')
	}, [attrs.customEmoji, typeInfo.icon, attrs.type])

	// Memoize background color
	const backgroundColor = useMemo(() => {
		// Use custom colors if set for current theme
		if (theme === "light" && attrs.customBgColorLight) {
			return attrs.customBgColorLight
		}
		if (theme === "dark" && attrs.customBgColorDark) {
			return attrs.customBgColorDark
		}
		// If custom color is set for opposite theme only, still use it as fallback
		if (attrs.customBgColorLight || attrs.customBgColorDark) {
			return attrs.customBgColorLight || attrs.customBgColorDark
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

	// Memoize border color
	const borderColor = useMemo(() => {
		// For default type without icon, use a subtle gray border
		if (attrs.type === 'default' && !attrs.customEmoji) {
			return theme === "light" ? '#e5e5e5' : '#404040'
		}
		// For types with icons, use icon color with opacity
		return theme === "light"
			? `${iconColor}25`
			: `${iconColor}40`
	}, [theme, iconColor, attrs.type, attrs.customEmoji])

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
					"rounded-md transition-all duration-200 px-2 py-1.5",
					theme === "light" ? "text-gray-900" : "text-gray-100"
				)}
				role="alert"
				aria-live="polite"
			>
				<div className="flex items-start gap-3">
					{/* Icon/Emoji - only show if hasIcon */}
					{hasIcon && (
						<div
							className="flex-shrink-0 mt-0.5"
							style={iconStyle}
						>
							{attrs.customEmoji ? (
								<span className="text-xl leading-none flex items-center justify-center w-5 h-5">
									{attrs.customEmoji}
								</span>
							) : (
								typeInfo.icon && <typeInfo.icon className="h-5 w-5" />
							)}
						</div>
					)}

					{/* Content */}
					<div className="flex-1 min-w-0">
						<div className="text-sm leading-relaxed">
							<NodeViewContent className="w-full prose-p:my-1 prose-p:leading-relaxed" />
						</div>
					</div>
				</div>
			</div>
		</NodeViewWrapper>
	)
})
