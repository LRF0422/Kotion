import { AnyExtension } from "@tiptap/core"
import { useContext, useMemo } from "react"
import { Focus } from "../extensions/focus"
import { TrailingNode } from "../extensions/trailing-node"
import { Text } from '@tiptap/extension-text'
import BubbleMenu from "@tiptap/extension-bubble-menu"
import { isChangeOrigin } from "@tiptap/extension-collaboration"
import { resloveSlash, resolveExtesions } from "./kit"
import { buildInExtension } from "./build-in-extension"
import { AppContext, ExtensionWrapper } from "@kn/common"
import { Paragraph } from "../extensions/paragraph"
import { Placeholder } from "../extensions/placeholder"
import { Perf } from "../extensions/perf"
import { UniqueID } from "../extensions/unique-id"
import { Doc } from "../extensions"
import Document from "@tiptap/extension-document";
import { UndoRedo } from '@tiptap/extensions'


export const useEditorExtension = (ext?: string, withTitle?: boolean) => {
	const { pluginManager } = useContext(AppContext)

	// Memoize everything to prevent infinite loops
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
					return '输入`/`唤出菜单'
				},
			}),
			Text,
			TrailingNode,
			Perf,
			BubbleMenu,
		]

		const full = [...buildInExtension, ...(pluginManager?.resloveEditorExtension() as ExtensionWrapper[])]
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
		return [editorExtensions, full] as const
	}, [ext, withTitle, pluginManager])
}