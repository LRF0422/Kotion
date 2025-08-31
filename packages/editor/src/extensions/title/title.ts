import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TitleView } from "./title-view";
import { uniqueId } from "lodash";

export const Title = Node.create({
	name: 'title',
	content: 'heading',
	group: 'block',


	addAttributes() {

		return {
			uuid: {
				default: null,
				parseHTML: () => {
					return uniqueId()
				},
				rendered: false
			},
			icon: {
				default: null
			},
			cover: {
				default: null
			},
		}
	},

	renderHTML({ HTMLAttributes }) {
		return ['h1', HTMLAttributes]
	},

	parseHTML() {
		return [
			{
				tag: 'h1',
			},
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(TitleView)
	},

})