import { cn, useTheme } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import React, { useMemo, memo } from "react";


export const InfoPanelView: React.FC<NodeViewProps> = memo((props) => {

	const { node, extension } = props
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
		if (attrs.customIconColor) {
			return attrs.customIconColor
		}
		return typeInfo.iconColor
	}, [typeInfo.iconColor, attrs.customIconColor])

	// Memoize border color - consistent for all types, derived from icon color
	const borderColor = useMemo(() => {
		return theme === "light"
			? `${iconColor}25`
			: `${iconColor}40`
	}, [theme, iconColor])

	// CSS variables for dynamic colors
	const calloutStyle = useMemo(() => ({
		'--callout-bg': backgroundColor,
		'--callout-border': borderColor,
	} as React.CSSProperties), [backgroundColor, borderColor])

	// Memoize icon color style
	const iconStyle = useMemo(() => ({
		color: iconColor
	} as React.CSSProperties), [iconColor])

	return (
		<NodeViewWrapper as='div'>
			<div
				style={calloutStyle}
				className={cn(
					"rounded-md border px-2 py-1.5 transition-colors duration-150 hover:shadow-sm",
					"bg-[var(--callout-bg)] border-[var(--callout-border)]",
					theme === "light" ? "text-gray-900" : "text-gray-100"
				)}
			>
				<div className="flex items-start gap-3">
					{/* Icon/Emoji - only show if hasIcon */}
					{hasIcon && (
						<div
							className="flex-shrink-0 mt-0.5"
							style={iconStyle}
						>
							{attrs.customEmoji ? (
								<span className="text-lg leading-none w-5 h-5 flex items-center justify-center">
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
