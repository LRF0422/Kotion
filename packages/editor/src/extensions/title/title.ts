import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TitleView } from "./title-view";
import { uniqueId } from "lodash";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { getNodeAtPos, isInTitle } from "@editor/utilities";

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

	addProseMirrorPlugins() {
		return [new Plugin({
			key: new PluginKey('title'),
			props: {
				handleKeyDown(view, evt) {
					const { state, dispatch } = view;

					// closeSelectTitleNode();

					if (isInTitle(view.state) && evt.code === 'Enter') {
						evt.preventDefault();

						const paragraph = state.schema.nodes.paragraph;

						if (!paragraph) {
							return true;
						}

						const $head = state.selection.$head;
						const titleNode = $head.node($head.depth);
						if (!titleNode.firstChild) {
							return true;
						}
						const endPos = ((titleNode && titleNode.nodeSize) || 0) + 1;

						// const nextNode = getNodeAtPos(state, endPos + 2);

						//   if (!nextNode) {
						dispatch(state.tr.insert(endPos, paragraph.create()));
						//   }

						const newState = view.state;
						const next = new TextSelection(newState.doc.resolve(endPos + 2));
						dispatch(newState.tr.setSelection(next));

						return true;
					}
				},
			}
		})]
	}

})