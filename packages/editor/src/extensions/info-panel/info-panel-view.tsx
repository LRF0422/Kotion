import { Alert, AlertDescription, AlertTitle, cn, useTheme } from "@kn/ui";
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

	// Memoize icon color style
	const iconStyle = useMemo(() => ({
		color: typeInfo.iconColor
	} as CSSProperties), [typeInfo.iconColor])

	// Memoize background color
	const backgroundColor = useMemo(() => {
		return theme === "light" ? typeInfo.color.light : typeInfo.color.dark
	}, [theme, typeInfo.color])

	// Optimize input change handler
	const handleTipsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		updateAttributes({ tips: e.target.value })
	}, [updateAttributes])

	const Icon = typeInfo.icon;

	return (
		<NodeViewWrapper as='div'>
			<Alert
				style={{ backgroundColor }}
				className={cn("rounded-md border-0 text-popover-foreground")}
				role="alert"
				aria-live="polite"
			>
				<Icon style={iconStyle} className="h-5 w-5" aria-hidden="true" />
				<AlertTitle className="mt-1">
					<input
						value={attrs.tips}
						className="text-[16px] bg-transparent outline-none leading-none w-full"
						onChange={handleTipsChange}
						aria-label="Info panel title"
					/>
				</AlertTitle>
				<AlertDescription>
					<NodeViewContent className="w-full prose-p:mt-0" />
				</AlertDescription>
			</Alert>
		</NodeViewWrapper>
	)
})
