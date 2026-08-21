import { mergeAttributes, Node } from "@tiptap/core";
import { uniqueId } from "lodash";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { isInTitle } from "@editor/utilities";

export const Title = Node.create({
	name: 'title',
	content: 'heading',


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
			// 宽窄模式：true = 全宽（铺满编辑区），null/false = 默认阅读宽度（900px）。
			// 与 icon/cover 一样存在 title 节点 attrs 上，随 op-save 同步链
			// 入库，并通过 Yjs 在协作端同步。
			fullWidth: {
				default: null
			},
			// 页面标签（string[]）：与 icon/cover/fullWidth 同样持久化在 title
			// attrs 上，随既有同步链入库并通过 Yjs 协作同步。
			tags: {
				default: null
			},
		}
	},

	// Render as a plain wrapper <div>, NOT <h1>. The inner heading already
	// renders as <h1>; wrapping it in another <h1> produced nested headings.
	// The cover/icon/placeholder are now rendered outside the editor (PageHeader),
	// so the title node is just a thin container around the native heading text.
	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { class: 'page-title' }), 0]
	},

	parseHTML() {
		return [
			{ tag: 'div.page-title' },
			// Backward-compat: legacy exports wrapped the title in <h1>.
			{ tag: 'h1' },
		];
	},

	addProseMirrorPlugins() {
		// Capture the Tiptap editor so the decorations callback can check the
		// live composition state (a raw ProseMirror plugin has no `this.editor`).
		const editor = this.editor;

		// Keeps the last computed placeholder decorations so we can return them
		// unchanged while an IME composition is in progress (never recompute /
		// mutate decorations mid-composition — that is exactly what broke Safari).
		let lastDecorations: DecorationSet = DecorationSet.empty;
		let lastDoc: unknown = null;

		return [new Plugin({
			key: new PluginKey('title'),
			props: {
				handleKeyDown(view, evt) {
					// IME 合成期间不处理回车（防御性：避免确认候选词时误触发跳转）。
					if (evt.isComposing || evt.keyCode === 229 || view.composing) {
						return false;
					}

					const { state, dispatch } = view;

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

						dispatch(state.tr.insert(endPos, paragraph.create()));

						const newState = view.state;
						const next = new TextSelection(newState.doc.resolve(endPos + 2));
						dispatch(newState.tr.setSelection(next));

						return true;
					}
				},

				// Always-on placeholder for the (empty) title heading. Implemented as
				// a node decoration — it only toggles a class + data-attr on the
				// existing heading DOM, never inserts/removes DOM — so it is safe
				// during IME composition (unlike a React element or :has() CSS).
				decorations: (state) => {
					// During composition, do not recompute: return the previous set
					// untouched to guarantee zero changes around the editable region.
					if (editor?.view?.composing && lastDoc === state.doc) {
						return lastDecorations;
					}

					const titleNode = state.doc.firstChild;
					let decorations: Decoration[] = [];

					if (titleNode && titleNode.type.name === 'title') {
						const heading = titleNode.firstChild;
						// title 节点起始 pos = 0；内部 heading 起始 pos = 1。
						const headingPos = 1;
						if (heading && heading.textContent.length === 0) {
							decorations = [
								Decoration.node(headingPos, headingPos + heading.nodeSize, {
									class: 'is-empty',
									'data-placeholder': 'Untitled',
								}),
							];
						}
					}

					lastDecorations = DecorationSet.create(state.doc, decorations);
					lastDoc = state.doc;
					return lastDecorations;
				},
			}
		})]
	}

})
