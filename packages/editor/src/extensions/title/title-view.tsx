import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch, MotionComponent, Badge, Separator, cn } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Clock, Image, UserCircle, Sparkles, Plus, X } from "@kn/icon";
import React, { useContext, useState, useMemo } from "react";
import { PageContext } from "@editor/editor/context";


export const TitleView: React.FC<NodeViewProps> = (props) => {

	const { createTime, updateTime } = useContext(PageContext)
	const [isHovered, setIsHovered] = useState(false)

	// Check if icon is configured
	const hasIcon = !!props.node.attrs?.icon?.icon

	// Check if title is empty
	const isTitleEmpty = useMemo(() => {
		const titleNode = props.node.firstChild
		if (!titleNode) return true
		return titleNode.textContent?.trim() === ''
	}, [props.node])

	return <NodeViewWrapper className="flex flex-col gap-4 items-start pt-12 pb-6 w-full">
		{/* Icon/Emoji Section - Only show when icon exists or in edit mode */}
		{(hasIcon || props.editor.isEditable) && (
			<div
				className="relative group"
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<Popover>
					<PopoverTrigger disabled={!props.editor.isEditable}>
						{hasIcon ? (
							<div
								contentEditable={false}
								className={cn(
									"relative flex items-center justify-center cursor-pointer",
									"h-20 w-20 rounded-xl transition-all duration-300",
									"hover:bg-muted/50",
									props.editor.isEditable && "hover:scale-[1.02] active:scale-[0.98]"
								)}
							>
								<div className="text-[56px] transition-transform duration-300 group-hover:scale-105" contentEditable={false}>
									{props.node.attrs?.icon?.icon}
								</div>
								{/* Remove icon button */}
								{props.editor.isEditable && (
									<button
										type="button"
										className={cn(
											"absolute -top-1 -right-1 p-1 rounded-full",
											"bg-muted hover:bg-destructive/90 hover:text-destructive-foreground",
											"opacity-0 group-hover:opacity-100 transition-all duration-200",
											"shadow-sm hover:shadow-md"
										)}
										onClick={(e) => {
											e.stopPropagation()
											e.preventDefault()
											props.updateAttributes({
												...props.node.attrs,
												icon: null
											})
										}}
									>
										<X className="h-3 w-3" />
									</button>
								)}
							</div>
						) : (
							// Show add icon button only in edit mode when no icon
							<div
								contentEditable={false}
								className={cn(
									"flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer",
									"text-muted-foreground hover:text-foreground",
									"hover:bg-muted/50 transition-all duration-200",
									"opacity-0 group-hover:opacity-100"
								)}
							>
								<Plus className="h-4 w-4" />
								<span className="text-sm">Add icon</span>
							</div>
						)}
					</PopoverTrigger>
					<PopoverContent side="right" align="start" className="p-0 border-none shadow-2xl" >
						<EmojiPicker
							className="h-[380px] rounded-xl border shadow-xl w-full"
							onEmojiSelect={({ emoji }) => {
								props.updateAttributes({
									...props.node.attrs,
									icon: {
										type: 'EMOJI',
										icon: emoji
									}
								})
							}} >
							<EmojiPickerSearch />
							<EmojiPickerContent />
						</EmojiPicker>
					</PopoverContent>
				</Popover>
			</div>
		)}

		{/* Title Content */}
		<div className="w-full relative">
			<NodeViewContent className="w-full prose-h1:mb-2 prose-h1:mt-0 prose-h1:font-bold" />
			{/* Placeholder when title is empty */}
			{isTitleEmpty && props.editor.isEditable && (
				<div
					className="absolute top-0 left-0 pointer-events-none text-muted-foreground/50 text-4xl font-bold"
					contentEditable={false}
				>
					Untitled
				</div>
			)}
		</div>

		{/* Metadata Section */}
		{(!props.editor.isEditable) && (
			<div className="flex flex-wrap items-center gap-2 mt-2 w-full">
				{/* Create Time */}
				<div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-border/50">
					<Clock className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
					<div className="flex items-center gap-1.5">
						<span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Created</span>
						<span className="text-xs text-muted-foreground/80">{createTime}</span>
					</div>
				</div>

				<Separator orientation="vertical" className="h-5" />

				{/* Update Time */}
				<div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-border/50">
					<Clock className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
					<div className="flex items-center gap-1.5">
						<span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Updated</span>
						<span className="text-xs text-muted-foreground/80">{updateTime}</span>
					</div>
				</div>
			</div>
		)}
	</NodeViewWrapper>
}
