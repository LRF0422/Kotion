import { ExtensionWrapper } from "@kn/common";
import Mention from '@tiptap/extension-mention'
import emoji_suggestion from "./emoji-suggestions"

export const EmojiExtension: ExtensionWrapper = {
    name: 'emoji',
    extendsion: Mention.configure({
        renderHTML({ options, node }) {
            return [
                "span",
                this.HTMLAttributes,
                `${node.attrs.label ?? node.attrs.id}`,
            ];
        },
        HTMLAttributes: {
            class: "mention",
        },
        suggestion: emoji_suggestion,
    })
}