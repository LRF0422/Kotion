import { KPlugin, PluginConfig } from "@kn/common";
import { StickyNoteExtension } from "./editor-extension/sticky-note";

interface StickyNotePluginConfig extends PluginConfig { }

class StickyNotePlugin extends KPlugin<StickyNotePluginConfig> { }

export const stickyNote = new StickyNotePlugin({
    status: "",
    name: "StickyNote",
    editorExtension: [StickyNoteExtension],
    locales: {
        en: {
            translation: {
                stickyNote: {
                    title: "Sticky Note",
                    description: "A Post-it style note for highlights and reminders",
                    placeholder: "Write a note…",
                    add: "Add sticky note",
                    remove: "Remove sticky note",
                    bold: "Bold",
                    italic: "Italic",
                    code: "Code",
                    bulletList: "Bullet list",
                    orderedList: "Ordered list",
                    color: "Color",
                    delete: "Delete sticky note",
                    deleteConfirm: "Click again to delete",
                    sheetTitle: "Sticky Note"
                }
            }
        },
        zh: {
            translation: {
                stickyNote: {
                    title: "便签",
                    description: "类似便利贴的便签块，支持富文本",
                    placeholder: "写便签…",
                    add: "添加便签",
                    remove: "移除便签",
                    bold: "加粗",
                    italic: "斜体",
                    code: "代码",
                    bulletList: "无序列表",
                    orderedList: "有序列表",
                    color: "颜色",
                    delete: "删除便签",
                    deleteConfirm: "再次点击以删除",
                    sheetTitle: "便签"
                }
            }
        }
    }
});
