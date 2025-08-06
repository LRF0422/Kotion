import { Alert, AlertDescription, AlertTitle, cn, useTheme } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import React, { CSSProperties } from "react";


export const InfoPanelView: React.FC<NodeViewProps> = (props) => {

	const { node, extension, updateAttributes } = props
	const { attrs } = node
	const { theme } = useTheme()

	const renderContent = () => {
		const type = attrs.type
		const typeInfo = extension.options.type[type]
		const Icon = typeInfo.icon;

		return <Alert
			style={{
				backgroundColor: theme === "light" ? `${typeInfo.color.light}` : `${typeInfo.color.dark}`
			}}
			className={cn(
				"rounded-md border-0 text-popover-foreground",
			)}>
			<Icon style={{ color: typeInfo.iconColor } as CSSProperties} className="h-5 w-5" />
			<AlertTitle className="mt-1">
				<input value={node.attrs.tips} className="text-[16px] bg-transparent outline-none leading-none" onChange={(e) => {
					updateAttributes({ tips: e.target.value })
				}} />
			</AlertTitle>
			<AlertDescription>
				<NodeViewContent className="w-full prose-p:mt-0" />
			</AlertDescription>
		</Alert>
	}

	return <NodeViewWrapper as='div'>
		{renderContent()}
	</NodeViewWrapper>
}
