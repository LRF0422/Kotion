import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch, MotionComponent, Badge, Separator, cn } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Clock, Image, UserCircle, Sparkles } from "@kn/icon";
import React, { useContext, useState } from "react";
import { PageContext } from "@editor/editor/context";


export const TitleView: React.FC<NodeViewProps> = (props) => {

	const { createTime, updateTime } = useContext(PageContext)
	const [isHovered, setIsHovered] = useState(false)

	return <NodeViewWrapper className="flex flex-col gap-6 items-start pt-12 pb-6 w-full">
		{/* Icon/Emoji Section */}
		<div
			className="relative group"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<Popover>
				<PopoverTrigger disabled={!props.editor.isEditable}>
					<div
						contentEditable={false}
						className={cn(
							"relative flex items-center justify-center cursor-pointer",
							"h-24 w-24 rounded-2xl transition-all duration-300",
							"bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5",
							"hover:from-primary/10 hover:via-primary/15 hover:to-primary/10",
							"border border-border/50 hover:border-primary/30",
							"shadow-sm hover:shadow-lg hover:shadow-primary/5",
							props.editor.isEditable && "hover:scale-[1.02] active:scale-[0.98]"
						)}
					>
						<div className="text-[56px] transition-transform duration-300 group-hover:scale-105" contentEditable={false}>
							{props.node.attrs?.icon?.icon || <Image className="h-14 w-14 text-muted-foreground/40" />}
						</div>
						{props.editor.isEditable && isHovered && (
							<div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl flex items-center justify-center backdrop-blur-[1px]">
								<Sparkles className="h-5 w-5 text-primary/60" />
							</div>
						)}
					</div>
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

		{/* Title Content */}
		<NodeViewContent className="w-full prose-h1:mb-2 prose-h1:mt-0 prose-h1:font-bold" />

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
