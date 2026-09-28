import { KPlugin, PluginConfig, liftLegacyTools } from "@kn/common";
import { StickyNoteExtension, addStickyNoteTool } from "./editor-extension/sticky-note";

interface StickyNotePluginConfig extends PluginConfig { }

class StickyNotePlugin extends KPlugin<StickyNotePluginConfig> { }

export const stickyNote = new StickyNotePlugin({
    status: "",
    name: "StickyNote",
    editorExtension: [StickyNoteExtension],
    agent: {
        agents: [
            {
                id: "sticky-note-ops",
                name: "便签助手",
                description:
                    "为当前打开的文档添加便签/注释：按精确文本定位内容并贴上便签。当用户要求在文档某段文字上贴便签、做标记或写提醒时委派给它。",
                scope: "page",
                systemPrompt: [
                    "你是当前文档的便签助手，只能操作当前打开的这一篇页面，不要改动其他页面，也不要顺带修改正文内容。",
                    "用 addStickyNote 工具贴便签：searchText 必须是文档中原文的精确片段（不要改写、注意标点），note 写要贴在旁边的提醒内容，简洁明确。",
                    "定位失败时换一段更短、更独特的原文片段重试；仍失败就如实说明未找到，不要凭空添加。",
                    "完成后用中文汇报：在哪些文字上加了便签、每张便签的内容是什么。",
                ].join("\n"),
                tools: liftLegacyTools([addStickyNoteTool], { scope: "page" }),
            },
        ],
    },
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
                    cancel: "Cancel",
                    open: "Open sticky note",
                    sheetTitle: "Sticky Note",
                    colors: {
                        yellow: "Yellow",
                        pink: "Pink",
                        blue: "Blue",
                        green: "Green",
                        purple: "Purple",
                        orange: "Orange"
                    }
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
                    cancel: "取消",
                    open: "打开便签",
                    sheetTitle: "便签",
                    colors: {
                        yellow: "黄色",
                        pink: "粉色",
                        blue: "蓝色",
                        green: "绿色",
                        purple: "紫色",
                        orange: "橙色"
                    }
                }
            }
        }
    }
});
