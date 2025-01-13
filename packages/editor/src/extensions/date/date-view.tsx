import { DateTimePicker } from "@repo/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { zhCN } from "date-fns/locale";
import React, { useState } from "react";

export const DateView: React.FC<NodeViewProps> = (props) => {

	return <NodeViewWrapper as="span">
		<DateTimePicker
			locale={zhCN}
			className="h-6"
			disabled={!props.editor.isEditable}
			value={props.node.attrs.date && new Date(props.node.attrs.date)}
			onChange={(value => {
				console.log('date', value);
				props.updateAttributes({
					date: value?.toString()
				});
			})} weekStartsOn={undefined} showWeekNumber={undefined} showOutsideDays={undefined} />
	</NodeViewWrapper>
}