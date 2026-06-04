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
                    description: "A Post-it style note for highlights and reminders"
                }
            }
        },
        zh: {
            translation: {
                stickyNote: {
                    title: "便签",
                    description: "类似便利贴的便签块，支持富文本"
                }
            }
        }
    }
});
