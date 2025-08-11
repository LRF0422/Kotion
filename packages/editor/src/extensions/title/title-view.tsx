import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Clock, Image, UserCircle } from "@kn/icon";
import React from "react";


export const TitleView: React.FC<NodeViewProps> = (props) => {

	return <NodeViewWrapper className=" leading-normal" >
		<div className="flex flex-col items-start pt-[30px]">
			<Popover>
				<PopoverTrigger disabled={!props.editor.isEditable}>
					<div contentEditable={false} className=" flex items-center justify-center cursor-pointer h-[80px] w-[80px] hover:bg-muted bg-muted/70 rounded-md">
						<div className="text-[70px]" contentEditable={false}>
							{props.node.attrs?.icon?.icon || <Image />}
						</div>
					</div>
				</PopoverTrigger>
				<PopoverContent side="right" align="start" className="p-0 border-none" >
					<EmojiPicker
						className="h-[326px] rounded-lg border shadow-md w-full"
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
			<NodeViewContent />
			{
				(!props.editor.isEditable) && <div className="flex flex-row gap-2 text-sm">
					<div className=" text-gray-500 italic flex flex-col gap-1 px-2 py-1 hover:bg-muted transition-all duration-200 rounded-sm">
						<a href="#" className="flex flex-row gap-1 items-center cursor-pointer text-gray-500">
							<UserCircle className="h-4 w-4" />
							Create by Leong
						</a>
						<div className="flex flex-row gap-1 items-center">
							<Clock className="h-4 w-4" />
							At 2024年8月19日
						</div>
					</div>
					<div className=" text-gray-500 italic flex flex-col gap-1 px-2 py-1 hover:bg-muted transition-all duration-200 rounded-sm">
						<a href="#" className="flex flex-row gap-1 items-center cursor-pointer text-gray-500">
							<UserCircle className="h-4 w-4" />
							Last update by Leong
						</a>
						<div className="flex flex-row gap-1 items-center">
							<Clock className="h-4 w-4" />
							At 2024年8月19日
						</div>
					</div>
				</div>
			}
		</div>
	</NodeViewWrapper>
}