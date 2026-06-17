import { AnyExtension } from "@tiptap/core"
import { useContext, useMemo } from "react"
import { Focus } from "../extensions/focus"
import { TrailingNode } from "../extensions/trailing-node"
import { Text } from '@tiptap/extension-text'
import BubbleMenu from "@tiptap/extension-bubble-menu"
import { isChangeOrigin } from "@tiptap/extension-collaboration"
import { resloveSlash, resolveExtesions } from "./kit"
import { buildInExtension } from "./build-in-extension"
import { AppContext, ExtensionWrapper, usePluginState } from "@kn/common"
import { Paragraph } from "../extensions/paragraph"
import { Placeholder } from "../extensions/placeholder"
import { Perf } from "../extensions/perf"
import { UniqueID } from "../extensions/unique-id"
import { BlockRank } from "../extensions/block-rank"
import { DirtyTracker } from "../extensions/dirty-tracker"
import { Doc } from "../extensions"
import Document from "@tiptap/extension-document";
import { UndoRedo } from '@tiptap/extensions'


export const useEditorExtension = (ext?: string, withTitle?: boolean, externalExtensions?: ExtensionWrapper[]) => {
	const { pluginManager } = useContext(AppContext)
	const { pluginVersion } = usePluginState()

	// Memoize everything to prevent infinite loops.
	// pluginVersion changes whenever plugins are installed, uninstalled, or updated,
	// which causes the editor to be reconfigured with the new extension set.
	return useMemo(() => {
		const runtimeExtension: AnyExtension[] = [
			withTitle ? Doc : Document,
			Paragraph,
			UndoRedo,
			Placeholder.configure({
				placeholder: ({ editor, node, pos }) => {
					// 标题文字（title 内的 heading）始终由 title 扩展自带的 decoration
					// 显示 “Untitled”（不受光标位置限制、合成安全）。通用 Placeholder
					// 在光标位于标题时也会装饰该 heading，这里返回相同文案以避免两个
					// decoration 的 data-placeholder 冲突；正文 heading 占位符保持不变。
					if (node.type.name === 'title') {
						return 'Untitled'
					}
					try {
						if (editor.state.doc.resolve(pos).parent?.type.name === 'title') {
							return 'Untitled'
						}
					} catch {
						// ignore — fall through to default placeholder
					}
					if (node.type.name === 'codeBlock') {
						return ''
					}
					return '\u8F93\u5165`/`\u5524\u51FA\u83DC\u5355'
				},
			}),
			Text,
			TrailingNode,
			Perf,
			BubbleMenu,
		]

		// Use external extensions if provided, otherwise use pluginManager's extensions
		const pluginExtensions = externalExtensions || (pluginManager?.resolveEditorExtensions() as ExtensionWrapper[]) || []
		const full = [...buildInExtension, ...pluginExtensions]
		const reoloved = resolveExtesions(full);
		let editorExtensions = [
			...runtimeExtension,
			...reoloved,
			resloveSlash(full)
		]
		if (ext) {
			editorExtensions = editorExtensions.filter(it => it.name !== ext);
		}
		const idTypes = editorExtensions.filter(it => it.name !== 'text').map(it => it.name)
		editorExtensions.push(UniqueID.configure({
			types: idTypes,
			filterTransaction: t => !isChangeOrigin(t)
		}))
		// Fractional ordering: assign each top-level block a sortable `rank` so
		// inserts/moves only re-rank the changed block, never its siblings.
		editorExtensions.push(BlockRank.configure({
			types: idTypes,
			filterTransaction: t => !isChangeOrigin(t)
		}))
		editorExtensions.push(DirtyTracker.configure({
			// Top-level blocks carry their id in `attrs.id` at runtime; the tracker
			// also falls back to `attrs.blockId` internally for robustness.
			blockIdAttribute: 'id',
			filterTransaction: t => !isChangeOrigin(t)
		}))
		return [editorExtensions, full] as const
	}, [ext, withTitle, pluginManager, externalExtensions, pluginVersion])
}
