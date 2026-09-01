import { ExtensionWrapper } from "@kn/common";
import { z } from "@kn/ui";
import type { Editor } from "@kn/editor";
import StickyNoteMark from "./sticky-note";
import { StickyNoteStaticMenu } from "./menu/static";
import { StickyNoteMarginPanel } from "./menu/StickyNoteMarginPanel";

export const StickyNoteExtension: ExtensionWrapper = {
    name: StickyNoteMark.name,
    extendsion: [StickyNoteMark],
    flotMenuConfig: [StickyNoteStaticMenu],
    floatingUI: StickyNoteMarginPanel,
    tools: [
        {
            name: "addStickyNote",
            description: "为文档中指定的文本添加便签/注释。通过搜索文本定位目标内容，然后在该文本上添加便签标记。",
            inputSchema: z.object({
                searchText: z.string().describe("要添加便签的目标文本（精确匹配文档中的一段文字）"),
                note: z.string().describe("便签内容"),
            }),
            execute: (editor: Editor) => async (params: { searchText: string; note: string }) => {
                const { searchText, note } = params;

                if (!searchText?.trim()) {
                    return { error: "搜索文本不能为空" };
                }

                try {
                    const doc = editor.state.doc;
                    let from: number | null = null;
                    let to: number | null = null;

                    // Search within individual text nodes first.
                    doc.descendants((node, pos) => {
                        if (from !== null) return false;
                        if (!node.isText) return;
                        const text = node.textContent;
                        const idx = text.indexOf(searchText);
                        if (idx !== -1) {
                            from = pos + idx;
                            to = from! + searchText.length;
                            return false;
                        }
                    });

                    // If not found in a single node, map flattened text offsets
                    // back to each text node's actual ProseMirror position. A
                    // simple `from + length` is wrong across block boundaries.
                    if (from === null || to === null) {
                        const segments: Array<{
                            textStart: number;
                            textEnd: number;
                            docStart: number;
                        }> = [];
                        let fullText = "";

                        doc.descendants((node, pos) => {
                            if (!node.isText) return;
                            const textStart = fullText.length;
                            fullText += node.textContent;
                            segments.push({
                                textStart,
                                textEnd: fullText.length,
                                docStart: pos,
                            });
                        });

                        const textIdx = fullText.indexOf(searchText);
                        if (textIdx === -1) {
                            return { error: `未找到文本: "${searchText}"` };
                        }

                        const endTextIdx = textIdx + searchText.length - 1;
                        const startSegment = segments.find(
                            (segment) => textIdx >= segment.textStart && textIdx < segment.textEnd
                        );
                        const endSegment = segments.find(
                            (segment) => endTextIdx >= segment.textStart && endTextIdx < segment.textEnd
                        );

                        if (!startSegment || !endSegment) {
                            return { error: `无法定位文本位置: "${searchText}"` };
                        }

                        from = startSegment.docStart + (textIdx - startSegment.textStart);
                        to = endSegment.docStart + (endTextIdx - endSegment.textStart) + 1;
                    }

                    // Select text and add sticky note.
                    editor.chain()
                        .focus()
                        .setTextSelection({ from, to: to! })
                        .run();

                    const result = editor.commands.addStickyNote({ content: note });

                    if (!result) {
                        return { error: "添加便签失败" };
                    }

                    return {
                        success: true,
                        text: searchText,
                        note,
                        message: `已在 "${searchText.substring(0, 30)}${searchText.length > 30 ? "..." : ""}" 上添加便签`,
                    };
                } catch (error) {
                    return { error: `添加便签失败: ${error instanceof Error ? error.message : "未知错误"}` };
                }
            },
        },
    ],
};
