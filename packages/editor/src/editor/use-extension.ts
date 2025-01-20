import { AnyExtension } from "@tiptap/core"
import { useContext, useState } from "react"
import { Focus } from "../extensions/focus"
import { TrailingNode } from "../extensions/trailing-node"
import { Text } from '@tiptap/extension-text'
import BubbleMenu from "@tiptap/extension-bubble-menu"
import { isChangeOrigin } from "@tiptap/extension-collaboration"
import { resloveSlash, resolveExtesions } from "./kit"
import { buildInExtension } from "./build-in-extension"
import { AppContext, ExtensionWrapper } from "@repo/common"
import { Paragraph } from "../extensions/paragraph"
import { Placeholder } from "../extensions/placeholder"
import { Perf } from "../extensions/perf"
import { UniqueID } from "../extensions/unique-id"
import { Doc } from "../extensions"
import TextLoadingDecorationExtension from "../extensions/ai/text-loading"


export const runtimeExtension: AnyExtension[] = [
	Doc,
	Paragraph,
	Placeholder.configure({
		placeholder: ({ node }) => {
			if (node.type.name === 'heading') {
				return 'What’s the title?'
			}
			if (node.type.name === 'codeBlock') {
				return ''
			}
			return '输入`/`唤出菜单'
		},
	}),
	Text,
	Focus.configure({
		mode: 'shallowest'
	}),
	TrailingNode,
	Perf,
	BubbleMenu,
	TextLoadingDecorationExtension,
	UniqueID.configure({
		filterTransaction: t => !isChangeOrigin(t)
	}),
]

export const useEditorExtension = (ext?: string) => {

	const { pluginManager } = useContext(AppContext)
	const full = [...buildInExtension, ...(pluginManager?.resloveEditorExtension() as ExtensionWrapper[])]
	let editorExtensions = [
		...runtimeExtension,
		...resolveExtesions(full),
		resloveSlash(full)
	]
	const [extensionWrappers, setWrappers] = useState<ExtensionWrapper[]>(full)
	if (ext) {
		editorExtensions = editorExtensions.filter(it => it.name !== ext);
	}
	return [editorExtensions, extensionWrappers]
}