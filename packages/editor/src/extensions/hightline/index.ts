import { ExtensionWrapper } from '@kn/common'
import { Mark } from '@tiptap/core'
import { Highlight } from '@tiptap/extension-highlight'
import "./style.css"



export const HighlightExtension: ExtensionWrapper = {
    name: Highlight.name,
    extendsion: Highlight.configure({
        HTMLAttributes: {
            class: 'highlight'
        }
    })
}