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

	return <NodeViewWrapper className="flex flex-col gap-4 items-start pt-8 pb-4 w-full">
		{/* Icon/Emoji Section */}
		<div
			className="relative"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<Popover>
				<PopoverTrigger disabled={!props.editor.isEditable}>
					<div
						contentEditable={false}
						className={cn(
							"group relative flex items-center justify-center cursor-pointer",
							"h-20 w-20 rounded-xl transition-all duration-300",
							"bg-gradient-to-br from-slate-50 to-slate-100",
							"dark:from-slate-800 dark:to-slate-900",
							"hover:from-slate-100 hover:to-slate-200",
							"dark:hover:from-slate-700 dark:hover:to-slate-800",
							"border-2 border-slate-200 hover:border-slate-300",
							"dark:border-slate-700 dark:hover:border-slate-600",
							"shadow-sm hover:shadow-md",
							"dark:shadow-slate-900/50",
							props.editor.isEditable && "hover:scale-105"
						)}
					>
						<div className="text-[50px] transition-transform duration-300 group-hover:scale-110" contentEditable={false}>
							{props.node.attrs?.icon?.icon || <Image className="h-12 w-12 text-slate-400 dark:text-slate-500" />}
						</div>
						{props.editor.isEditable && isHovered && (
							<div className="absolute inset-0 bg-black/5 dark:bg-white/5 rounded-xl flex items-center justify-center">
								<Sparkles className="h-5 w-5 text-slate-600 dark:text-slate-400" />
							</div>
						)}
					</div>
				</PopoverTrigger>
				<PopoverContent side="right" align="start" className="p-0 border-none shadow-xl dark:shadow-slate-950/50" >
					<EmojiPicker
						className="h-[380px] rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-lg w-full"
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
		<NodeViewContent className="w-full prose-h1:mb-1 prose-h1:mt-0" />

		{/* Metadata Section */}
		{(!props.editor.isEditable) && (
			<div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 w-full">
				{/* Create Time */}
				<div className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200">
					<Clock className="h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" />
					<div className="flex flex-col">
						<span className="text-xs font-medium text-slate-600 dark:text-slate-400">Created</span>
						<span className="text-xs text-slate-500 dark:text-slate-500">{createTime}</span>
					</div>
				</div>

				<Separator orientation="vertical" className="h-8" />

				{/* Update Time */}
				<div className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200">
					<Clock className="h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" />
					<div className="flex flex-col">
						<span className="text-xs font-medium text-slate-600 dark:text-slate-400">Last Updated</span>
						<span className="text-xs text-slate-500 dark:text-slate-500">{updateTime}</span>
					</div>
				</div>
			</div>
		)}
	</NodeViewWrapper>
}
