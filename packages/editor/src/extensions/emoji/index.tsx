import { ExtensionWrapper } from "@kn/common";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import emojiSuggestion from "./emoji-suggestions";
import { EmojiRenderExtension } from "./emoji-render-plugin";

/**
 * 历史兼容节点：旧版 emoji 以 mention 原子节点存入文档
 * （{ type: "mention", attrs: { id: unicode } }）。现改为插入纯文本 unicode，
 * 但该节点需保留，保证存量文档可正常解析、渲染与复制。
 */
const LegacyEmojiMention = Node.create({
    name: "mention",
    group: "inline",
    inline: true,
    atom: true,
    selectable: false,

    addAttributes() {
        return {
            id: { default: null },
            label: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: "span.mention" }];
    },

    renderHTML({ node, HTMLAttributes }) {
        return [
            "span",
            mergeAttributes(HTMLAttributes, { class: "mention" }),
            `${node.attrs.label ?? node.attrs.id ?? ""}`,
        ];
    },
});

/**
 * 输入 ":" 触发 emoji 联想，选中后插入纯文本 unicode（Notion 风格），
 * 不再产生原子节点，复制/搜索/导出与正文天然一致。
 */
const EmojiSuggestion = Extension.create({
    name: "emojiSuggestion",

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                pluginKey: new PluginKey("emojiSuggestion"),
                ...emojiSuggestion,
            }),
        ];
    },
});

export const EmojiExtension: ExtensionWrapper = {
    name: "emoji",
    // LegacyEmojiMention：存量文档兼容；EmojiSuggestion：":" 联想插入纯文本；
    // EmojiRenderExtension：视图层将文本中的 emoji 渲染为扁平 Twemoji
    extendsion: [LegacyEmojiMention, EmojiSuggestion, EmojiRenderExtension],
};
