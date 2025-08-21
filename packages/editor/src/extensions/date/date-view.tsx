import { DateTimePicker } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { zhCN } from "date-fns/locale";
import React, { useState } from "react";

export const DateView: React.FC<NodeViewProps> = (props) => {

	return <NodeViewWrapper as="span">
		<DateTimePicker
			className="w-[200px] h-6"
			locale={zhCN}
			disabled={!props.editor.isEditable}
			value={props.node.attrs.date && new Date(props.node.attrs.date)}
			onChange={(value => {
				console.log('date', value);
				props.updateAttributes({
					date: value?.toString()
				});
			})} weekStartsOn={1} showWeekNumber={true} showOutsideDays={true} />
	</NodeViewWrapper>
}