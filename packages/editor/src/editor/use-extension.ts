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
				placeholder: ({ node }) => {
					if (node.type.name === 'title') {
						return 'What\'s the title?'
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
		editorExtensions.push(UniqueID.configure({
			types: editorExtensions.filter(it => it.name !== 'text').map(it => it.name),
			filterTransaction: t => !isChangeOrigin(t)
		}))
		editorExtensions.push(DirtyTracker.configure({
			// Canonical block identity is `blockId` (assigned by UniqueID above);
			// keep this in sync with that attributeName or the diff tracks nothing.
			blockIdAttribute: 'blockId',
			filterTransaction: t => !isChangeOrigin(t)
		}))
		return [editorExtensions, full] as const
	}, [ext, withTitle, pluginManager, externalExtensions, pluginVersion])
}
